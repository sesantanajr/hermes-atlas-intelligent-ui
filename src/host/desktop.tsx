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
import React, { useMemo } from "react";
import "../theme";
import { App } from "../app/App";
import { detectLocale, serverText, setLocale, t } from "../i18n";
import type { Transport } from "../types";
import { ApiError, type Api, createClient } from "./client";
import { requestCanvas, type Host } from "./context";
import { declareFeatures, sayHello } from "./hello";
import { InlineCanvas, announceCanvasChange } from "./InlineCanvas";

declare const ATLAS_STYLES: string;

const PLUGIN_ID = "hermes-atlas";
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

function asApiError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : String(error);
  const known = (error as { status?: unknown })?.status;
  const status =
    typeof known === "number" ? known : Number(/\b([45]\d\d)\b/.exec(message)?.[1] ?? 0);
  return new ApiError(serverText(message), status);
}

/** `ctx.rest` as an Atlas transport, refusing answers that belong to a connection since replaced. */
function restTransport(ctx: Context, startedAt: number): Transport {
  return async (path, init) => {
    if (epoch() !== startedAt)
      throw new Error(t("A conexão do Desktop mudou. Reabra o Atlas."));
    // ctx.rest sets no headers: the workspace check travels as a query parameter instead.
    const scope = new Headers(init?.headers).get("X-Atlas-Workspace");
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
      throw asApiError(error);
    }
    if (epoch() !== startedAt)
      throw new Error(t("Resposta descartada porque a conexão mudou."));
    return result;
  };
}

function desktopHost(sessionId: string | null): Host {
  const composer = sdk.host?.composer;
  return {
    kind: "desktop",
    insertIntoChat: async (text, target) => {
      if (!composer?.insertText) return false;
      const address = target ?? null;
      const taken = await composer.insertText(address, text, { mode: "block" });
      if (taken) composer.focus?.(address);
      return !!taken;
    },
    native: {
      sessionId,
      send: async (text) => {
        if (!sessionId) throw new Error(t("Abra uma conversa no Hermes antes de enviar."));
        if (composer?.submit) {
          if (!composer.submit(sessionId, text))
            throw new Error(t("Ative a sessão e o perfil de destino antes de enviar."));
          return;
        }
        // Desktop releases before the composer API: the gateway call it wraps.
        if (!sdk.host?.request) throw new Error(t("Este Desktop não permite enviar à sessão."));
        await sdk.host.request("prompt.submit", { session_id: sessionId, text });
      },
    },
    openWorkspace: (id, revision) => {
      requestCanvas({ id, revision });
      sdk.host?.navigate?.(ROUTE);
    },
    notify: (message, kind = "info") => sdk.host?.notify?.({ kind, message }),
  };
}

function DesktopAtlas({ ctx }: { ctx: Context }) {
  const profile = useAtom(sdk.host?.state?.profile, "");
  const connection = useAtom(sdk.host?.state?.gateway, "");
  const sessionId = useAtom(sdk.host?.state?.focusedSessionId, null);
  const startedAt = epoch();
  const transport = useMemo(
    () => restTransport(ctx, startedAt),
    // A new profile or gateway is a different library: rebuild the transport with it.
    [ctx, startedAt, profile, connection],
  );
  const host = useMemo(() => desktopHost(sessionId), [sessionId]);
  return <App key={`${profile}:${startedAt}`} transport={transport} host={host} />;
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
  const id = attrs.id ?? "";
  const api = inlineApi(ctx);
  const host = useMemo(() => desktopHost(sessionId ?? null), [sessionId]);
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
  const target = canvasOfResult(result);
  const api = inlineApi(ctx);
  const host = useMemo(() => desktopHost(sessionId ?? null), [sessionId]);
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
    />
  );
}

export default {
  // Must equal the folder Hermes Desktop loads it from (desktop-plugins/hermes-atlas).
  id: "hermes-atlas",
  name: "Hermes Atlas",
  description:
    "Interactive canvases from your agent: inline in the conversation, plus a library and block catalogue.",
  register(ctx: Context) {
    setLocale(detectLocale());
    const style = document.createElement("style");
    style.dataset.hermesAtlas = "true";
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
        if (typeof payload?.id === "string") announceCanvasChange(payload.id);
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
