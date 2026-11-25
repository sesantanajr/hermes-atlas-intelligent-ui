/**
 * Hermes Desktop / Webapp extension.
 *
 * Built into `desktop/plugin.js`: one ES module that imports only what the host provides
 * (`react`, `react/jsx-runtime`, `@hermes/plugin-sdk`), with its stylesheet inlined. It adds:
 *
 * - the **Atlas page** (`/atlas`) and its row in the sidebar;
 * - the **live canvas in the conversation**: when a reply attaches the page an Atlas tool wrote
 *   (`MEDIA:` line, tool media renderers) or writes the `::atlas{id="…" rev="…"}` directive, the
 *   canvas is drawn inline, interactive, and what the person does on it is readable by the agent
 *   on its next turn.
 *
 * Everything optional in the SDK is feature-detected, so the extension loads on every Desktop
 * release that has the plugin loader and simply offers less on older ones.
 */
import * as sdk from "@hermes/plugin-sdk";
import React, { useMemo, useReducer } from "react";
import "../theme";
import { App } from "../app/App";
import { detectLocale, serverText, setLocale, t } from "../i18n";
import type { Transport } from "../types";
import { ApiError, type Api, createClient, hostError } from "./client";
import { requestCanvas, type Host } from "./context";
import { declareFeatures, sayHello } from "./hello";
import { InlineCanvas, announceCanvasChange } from "./InlineCanvas";

declare const ATLAS_STYLES: string;

const PLUGIN_ID = "atlas-intelligent-ui";
/** The Atlas tools whose result names a canvas page: their files become the live canvas. */
const CANVAS_TOOLS = ["atlas_render", "atlas_update"];
const ROUTE = "/atlas";
const CANVAS_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Context = sdk.PluginContext;

function useAtom<T>(atom: sdk.Atom<T> | undefined, fallback: T): T {
  // `useValue` either exists for the life of the page or never does, so the hook order is stable.
  if (sdk.useValue && atom) return sdk.useValue(atom);
  return atom ? atom.get() : fallback;
}

const epoch = () => sdk.gatewayActivationEpoch?.() ?? 0;

/**
 * Re-render on every activation of a gateway route, same-profile source swaps included, on hosts
 * that export the hook. It either exists for the life of the page or never does, so the hook order
 * is stable.
 */
function useActivation() {
  sdk.useGatewayActivationEpoch?.();
}

/** The Atlas API over plugin RPC (1.1.2, `hermes_atlas/agent/rpc.py`). */
export const RPC_METHOD = `plugin.${PLUGIN_ID}.http`;
/**
 * Whether this Hermes serves the Atlas RPC method: unknown until the first call answers. Hermes
 * 0.23 refuses `ctx.rest` for a plugin that is not bundled on any profile but the one it was
 * launched with, so on Atlas IA, Atlas Code and every other secondary profile the RPC door is the
 * only one that works. Older Hermes releases (no plugin RPC) answer -32601 and keep `ctx.rest`.
 */
let rpcAvailable: boolean | null = null;
export function resetRpcProbe() {
  rpcAvailable = null;
}
const unknownMethod = (error: unknown) =>
  /-32601|unknown[_ ]method|method not found|not supported/i.test(error instanceof Error ? error.message : String(error));

async function viaRpc(
  path: string,
  init: RequestInit | undefined,
  scope: string | null,
): Promise<{ answered: true; value: unknown } | { answered: false }> {
  const request = sdk.host?.request;
  if (!request || rpcAvailable === false) return { answered: false };
  const [bare, query = ""] = path.split("?");
  let answer: unknown;
  try {
    answer = await request(RPC_METHOD, {
      method: init?.method ?? "GET",
      path: bare,
      query,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      ...(scope ? { scope } : {}),
    });
  } catch (error) {
    if (rpcAvailable !== true && unknownMethod(error)) {
      rpcAvailable = false;
      return { answered: false };
    }
    throw hostError(error);
  }
  const reply = answer as { status?: unknown; body?: unknown } | null;
  if (!reply || typeof reply.status !== "number") {
    // Not our bridge answering (a host double, a gateway that ignores the method): keep REST.
    rpcAvailable = false;
    return { answered: false };
  }
  rpcAvailable = true;
  if (reply.status >= 400) {
    const detail =
      reply.body && typeof (reply.body as { detail?: unknown }).detail === "string"
        ? ((reply.body as { detail: string }).detail)
        : "";
    throw new ApiError(
      detail ? serverText(detail) : t("Não foi possível concluir ({status}).", { status: reply.status }),
      reply.status,
      detail,
    );
  }
  return { answered: true, value: reply.body };
}

/**
 * The Atlas API as a transport: plugin RPC where Hermes serves it, else `ctx.rest`, refusing
 * answers that belong to a connection since replaced. `onStale` hears of the replacement, for a
 * page that can rebuild itself on the new connection.
 */
function restTransport(ctx: Context, startedAt: number, onStale?: () => void): Transport {
  const replaced = () => {
    if (epoch() === startedAt) return false;
    onStale?.();
    return true;
  };
  return async (path, init) => {
    if (replaced()) throw new Error(t("A conexão do Desktop mudou. Reabra o Atlas."));
    const scope = new Headers(init?.headers).get("X-Atlas-Workspace");
    const rpc = await viaRpc(path, init, scope);
    if (rpc.answered) {
      if (replaced()) throw new Error(t("Resposta descartada porque a conexão mudou."));
      return rpc.value;
    }
    // ctx.rest sets no headers: the workspace check travels as a query parameter instead.
    const query = scope
      ? `${path.includes("?") ? "&" : "?"}atlas_scope=${encodeURIComponent(scope)}`
      : "";
    let result: unknown;
    try {
      result = await ctx.rest(path + query, {
        method: init?.method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        timeoutMs: 30000,
      });
    } catch (error) {
      throw hostError(error);
    }
    if (replaced()) throw new Error(t("Resposta descartada porque a conexão mudou."));
    return result;
  };
}

/** Send `text` to a chat session as the person's turn. */
async function submitTo(sessionId: string, text: string) {
  // The chat's composer, when it is on screen: the turn then follows its steer and queue rules.
  // Desktop answers only through a visible composer, and on the Atlas page the chat is not one.
  let sent = false;
  try {
    sent = !!sdk.host?.composer?.submit?.(sessionId, text);
  } catch {
    sent = false;
  }
  if (sent) return;
  // The gateway call the composer wraps, which needs no composer on screen.
  if (!sdk.host?.request) throw new Error(t("Ative a sessão e o perfil de destino antes de enviar."));
  await sdk.host.request("prompt.submit", { session_id: sessionId, text });
}

function desktopHost(ctx: Context, sessionId: string | null): Host {
  const composer = sdk.host?.composer;
  const clipboard = ctx.os?.writeClipboard;
  const canSend = !!(composer?.submit || sdk.host?.request);
  return {
    kind: "desktop",
    insertIntoChat: async (text, target) => {
      if (!composer?.insertText) return false;
      const address = target ?? null;
      const taken = await composer.insertText(address, text, { mode: "block" });
      if (taken) composer.focus?.(address);
      return !!taken;
    },
    native: canSend
      ? {
          sessionId,
          send: async (text) => {
            if (!sessionId) throw new Error(t("Abra uma conversa no Hermes antes de enviar."));
            await submitTo(sessionId, text);
          },
        }
      : undefined,
    openWorkspace: (id, revision) => {
      requestCanvas({ id, revision });
      sdk.host?.navigate?.(ROUTE);
    },
    notify: (message, kind = "info") => sdk.host?.notify?.({ kind, message }),
    writeClipboard: clipboard ? (text) => clipboard(text) : undefined,
  };
}

function DesktopAtlas({ ctx }: { ctx: Context }) {
  const profile = useAtom(sdk.host?.state?.profile, "");
  // Which backend: the registry source of the active route (newer hosts). `state.gateway` is the
  // WebSocket's state ('connecting', 'open', …): a reconnect is still the same library.
  const connection = useAtom(sdk.host?.state?.connectionId, null);
  const sessionId = useAtom(sdk.host?.state?.focusedSessionId, null);
  useActivation();
  // Hosts without the activation hook: rebuild as soon as a request notices the replacement.
  const [, rebuild] = useReducer((n: number) => n + 1, 0);
  const startedAt = epoch();
  const transport = useMemo(
    () => restTransport(ctx, startedAt, rebuild),
    // A new profile, source or route activation is a different library: rebuild the transport.
    [ctx, startedAt, profile, connection],
  );
  const host = useMemo(() => desktopHost(ctx, sessionId), [ctx, sessionId]);
  return (
    <App key={`${connection ?? ""}|${profile}|${startedAt}`} transport={transport} host={host} />
  );
}

const clients = new WeakMap<Context, { api: Api; startedAt: number }>();
function inlineApi(ctx: Context): Api {
  const startedAt = epoch();
  const known = clients.get(ctx);
  if (known && known.startedAt === startedAt) return known.api;
  const api = createClient(restTransport(ctx, startedAt)).request;
  clients.set(ctx, { api, startedAt });
  return api;
}

function DirectiveCanvas({
  ctx,
  attrs,
  sessionId,
  streaming,
}: sdk.TranscriptDirectiveProps & { ctx: Context }) {
  useActivation(); // a new route activation hands the card a client on the new connection
  const id = attrs.id ?? "";
  const api = inlineApi(ctx);
  const host = useMemo(() => desktopHost(ctx, sessionId ?? null), [ctx, sessionId]);
  // Attributes are model output: draw nothing rather than guess at a malformed reference.
  if (!CANVAS_ID.test(id)) return null;
  const revision = /^[1-9]\d{0,8}$/.test(attrs.rev ?? "") ? Number(attrs.rev) : undefined;
  sayHello(api, "desktop");
  return (
    <InlineCanvas
      key={`${id}:${revision ?? "latest"}`}
      canvasId={id}
      revision={revision}
      api={api}
      host={host}
      sessionId={sessionId}
      streaming={streaming}
    />
  );
}

/** The canvas an Atlas tool result names. Results arrive as JSON text live and parsed from history. */
export function canvasOfResult(result: unknown): { id: string; revision?: number } | null {
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const { id, revision, success } = value as { [key: string]: unknown };
  if (success === false || typeof id !== "string" || !CANVAS_ID.test(id)) return null;
  return {
    id,
    revision: typeof revision === "number" && Number.isInteger(revision) && revision > 0 ? revision : undefined,
  };
}

function FileCanvas({
  ctx,
  result,
  sessionId,
  fallback,
}: sdk.ToolMediaRendererProps & { ctx: Context }) {
  useActivation();
  const target = canvasOfResult(result);
  const api = inlineApi(ctx);
  const host = useMemo(() => desktopHost(ctx, sessionId ?? null), [ctx, sessionId]);
  // Anything this is not sure about keeps Desktop's own file card.
  if (!target) return <>{fallback}</>;
  sayHello(api, "desktop");
  return (
    <InlineCanvas
      key={`${target.id}:${target.revision ?? "latest"}`}
      canvasId={target.id}
      revision={target.revision}
      api={api}
      host={host}
      sessionId={sessionId}
      // The page itself still opens from Desktop's card when the Atlas backend cannot answer.
      fallback={fallback}
    />
  );
}

/** The revision a backend event names, when it names a valid one. */
const savedRevision = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

export default {
  // Equal to the dashboard manifest's `name` (the backend route `ctx.rest` reaches) and to the
  // folder Hermes installs the package in (desktop-plugins/atlas-intelligent-ui).
  id: PLUGIN_ID,
  name: "Hermes Atlas",
  description:
    "Interactive canvases from your agent: inline in the conversation, plus a library and block catalogue.",
  register(ctx: Context) {
    setLocale(detectLocale());
    const style = document.createElement("style");
    style.dataset.atlasIntelligentUi = "true";
    style.textContent = ATLAS_STYLES;
    document.head.appendChild(style);
    ctx.onDispose(() => style.remove());

    ctx.register({
      id: "page",
      area: sdk.ROUTES_AREA ?? "routes",
      title: "Atlas",
      data: { path: ROUTE },
      render: () => <DesktopAtlas ctx={ctx} />,
    });
    ctx.register({
      id: "navigation",
      area: sdk.SIDEBAR_NAV_AREA ?? "sidebar.nav",
      data: { path: ROUTE, label: "Atlas", codicon: "sparkle" },
    });
    const features: string[] = [];
    // The page a canvas tool wrote, attached to a reply with a `MEDIA:` line, becomes the live
    // canvas. Desktop only lets a package draw files its own tools produced.
    if (typeof sdk.TOOL_MEDIA_RENDERER_AREA === "string") {
      ctx.register({
        id: "canvas-file",
        area: sdk.TOOL_MEDIA_RENDERER_AREA,
        data: {
          tools: CANVAS_TOOLS,
          render: (props: sdk.ToolMediaRendererProps) => <FileCanvas ctx={ctx} {...props} />,
        },
      });
      features.push("tool_media");
    }
    if (typeof sdk.TRANSCRIPT_DIRECTIVE_AREA === "string") {
      features.push("directive");
      ctx.register({
        id: "canvas",
        area: sdk.TRANSCRIPT_DIRECTIVE_AREA,
        data: {
          name: "atlas",
          render: (props: sdk.TranscriptDirectiveProps) => (
            <DirectiveCanvas ctx={ctx} {...props} />
          ),
        },
      });
    }
    declareFeatures("desktop", features);
    // The backend announces saves and deletions; inline canvases refresh without polling.
    for (const event of ["canvas.saved", "canvas.deleted"])
      ctx.onEvent?.(`plugin.${PLUGIN_ID}.${event}`, ({ payload }) => {
        if (typeof payload?.id === "string")
          announceCanvasChange(payload.id, savedRevision(payload.revision));
      });
    // Desktop keeps <html lang> in step with its language setting: follow a switch at runtime.
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(() => setLocale(detectLocale()));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
      ctx.onDispose(() => observer.disconnect());
    }
    // The page's language first; the one chosen in Hermes, if any, once the backend answers.
    sayHello(inlineApi(ctx), "desktop", (locale) => setLocale(detectLocale(locale)));
  },
};
