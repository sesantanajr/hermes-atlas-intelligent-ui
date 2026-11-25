// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contribution, GatewayEvent, PluginContext, TranscriptDirectiveProps } from "@hermes/plugin-sdk";
import { setLocale } from "../i18n";
import type { Canvas } from "../types";
import plugin, { RPC_METHOD, resetRpcProbe } from "./desktop";
import { composerCalls, host, resetHost, setHost, state } from "./testing/plugin-sdk";

const form: Canvas = {
  id: "canvas-plan",
  title: "Plano da semana",
  description: "",
  schema_version: "1.0",
  blocks: [
    {
      id: "form",
      type: "form",
      title: "Plano",
      fields: [{ id: "name", label: "Nome", kind: "text", required: true }],
    },
  ],
  state: { form: { fields: { name: "Atlas" } } },
};

/** Every disposer a test's registration left, run after each test like Desktop does on unload. */
const registrations: (() => void)[][] = [];

/** What Hermes Desktop hands `register(ctx)`, recording what the plugin does with it. */
function desktop(rest: (path: string, options?: { method?: string; body?: unknown }) => unknown) {
  const contributions: Contribution[] = [];
  const disposers: (() => void)[] = [];
  registrations.push(disposers);
  const listeners = new Map<string, (event: GatewayEvent) => void>();
  const requests: { path: string; method: string; body?: unknown }[] = [];
  const ctx: PluginContext = {
    rest: async (path, options) => {
      requests.push({ path, method: options?.method ?? "GET", body: options?.body });
      const result = rest(path, options);
      if (result instanceof Error) throw result;
      return result;
    },
    register: (entry) => {
      contributions.push(entry);
      return () => undefined;
    },
    onDispose: (fn) => void disposers.push(fn),
    onEvent: (type, listener) => {
      listeners.set(type, listener);
      return () => void listeners.delete(type);
    },
  };
  return { ctx, contributions, disposers, listeners, requests };
}

/** How Hermes Desktop rejects a `ctx.rest` call the backend answered with an HTTP error. */
const httpError = (status: number, detail: string) =>
  new Error(`Error invoking remote method 'hermes:api': Error: ${status}: ${JSON.stringify({ detail })}`);

const library = (path: string) => {
  if (path.startsWith("/clients/")) return { kind: "desktop", locale: "auto" };
  if (path.startsWith("/canvases/canvas-plan/draft")) return null;
  if (path.startsWith("/canvases/canvas-plan"))
    return { id: "canvas-plan", revision: 2, updated: "x", canvas: form };
  return httpError(404, "Canvas não encontrado.");
};

/** The backend the Atlas page boots against, on top of the library. */
const workspace = (path: string) => {
  if (path.startsWith("/status")) return { connected: true, scope: "profile-A", features: {} };
  if (path.startsWith("/workspace")) return { theme: "light", chat_id: null, canvas: null, revision: 0 };
  if (path.startsWith("/conversations?") || path.startsWith("/canvases?")) return [];
  return library(path);
};

function directive(contributions: Contribution[]) {
  const entry = contributions.find((c) => c.area === "transcript.directives");
  return entry?.data as { name: string; render: (props: TranscriptDirectiveProps) => React.ReactNode } | undefined;
}

/** Mount the Atlas page the way Desktop mounts a route contribution. */
async function openPage(rest: Parameters<typeof desktop>[0] = workspace) {
  const harness = desktop(rest);
  plugin.register(harness.ctx);
  const page = harness.contributions.find((c) => c.id === "page")!;
  render(<>{page.render!()}</>);
  const boots = () => harness.requests.filter((r) => r.path.startsWith("/workspace")).length;
  await waitFor(() => expect(boots()).toBe(1));
  return { ...harness, boots };
}

beforeEach(() => {
  resetHost();
  resetRpcProbe();
  document.documentElement.lang = "pt-BR";
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  registrations.splice(0).forEach((disposers) => disposers.splice(0).forEach((fn) => fn()));
  setLocale("pt-BR");
  document.documentElement.lang = "";
  document.head.querySelectorAll("style[data-atlas-intelligent-ui]").forEach((node) => node.remove());
});

describe("Hermes Desktop extension", () => {
  it("is the module the Desktop loader expects", () => {
    expect(plugin.id).toBe("atlas-intelligent-ui"); // the folder name under desktop-plugins/
    expect(plugin.name).toBe("Hermes Atlas");
    expect(typeof plugin.register).toBe("function");
  });

  it("adds the page, the sidebar entry, the canvas renderers, and cleans up", async () => {
    const { ctx, contributions, disposers, listeners, requests } = desktop(library);
    plugin.register(ctx);
    expect(contributions.map((c) => [c.id, c.area])).toEqual([
      ["page", "routes"],
      ["navigation", "sidebar.nav"],
      ["canvas-file", "transcript.toolMedia"],
      ["canvas", "transcript.directives"],
    ]);
    // Only the tools whose result names a canvas page; Desktop refuses claims on other tools.
    expect((contributions[2].data as { tools: string[] }).tools).toEqual(["atlas_render", "atlas_update"]);
    expect(contributions[0].data).toEqual({ path: "/atlas" });
    expect(contributions[1].data).toMatchObject({ path: "/atlas", label: "Atlas" });
    expect(directive(contributions)?.name).toBe("atlas");
    expect([...listeners.keys()]).toEqual([
      "plugin.atlas-intelligent-ui.canvas.saved",
      "plugin.atlas-intelligent-ui.canvas.deleted",
    ]);
    // The backend learns what this Desktop can draw, so the tools pick the best way to show a canvas.
    await waitFor(() => expect(requests.some((r) => r.path === "/clients/desktop" && r.method === "POST")).toBe(true));
    const hello = requests.find((r) => r.path === "/clients/desktop")!;
    expect(hello.body).toMatchObject({ features: ["directive", "tool_media"] });
    // The stylesheet is injected (the host loads no CSS file) and removed on dispose.
    expect(document.head.querySelectorAll("style[data-atlas-intelligent-ui]").length).toBe(1);
    disposers.splice(0).forEach((fn) => fn());
    expect(document.head.querySelectorAll("style[data-atlas-intelligent-ui]").length).toBe(0);
  });

  it("still loads on a Desktop without transcript directives or media renderers", () => {
    setHost({ directives: false, media: false, epochApi: false });
    const { ctx, contributions } = desktop(library);
    plugin.register(ctx);
    expect(contributions.map((c) => c.id)).toEqual(["page", "navigation"]);
  });

  it("uses the directive alone on a Desktop without media renderers", () => {
    setHost({ media: false });
    const { ctx, contributions } = desktop(library);
    plugin.register(ctx);
    expect(contributions.map((c) => c.id)).toEqual(["page", "navigation", "canvas"]);
  });

  it("turns the page an Atlas tool wrote into the live canvas", async () => {
    const { ctx, contributions, requests } = desktop(library);
    plugin.register(ctx);
    const media = contributions.find((c) => c.area === "transcript.toolMedia")!.data as {
      render: (props: unknown) => React.ReactNode;
    };
    const file = { path: "/home/u/.hermes/plugin-data/atlas-intelligent-ui/exports/plano-v2.html", name: "plano-v2.html",
      kind: "file", mime: "text/html", resolveUrl: async () => "data:text/html," };
    const props = (result: unknown) => ({ file, toolName: "atlas_render", toolCallId: "call-1", args: {}, result,
      sessionId: "session-1", fallback: <p>Desktop file card</p> });

    // Live, the result is the tool's JSON text.
    render(<>{media.render(props(JSON.stringify({ success: true, id: "canvas-plan", revision: 2, show: "file" })))}</>);
    await screen.findByRole("heading", { name: "Plano da semana" });
    expect(requests.map((r) => r.path)).toContain("/canvases/canvas-plan?revision=2");
    cleanup();

    // Reopened from history, it can arrive parsed.
    render(<>{media.render(props({ success: true, id: "canvas-plan", revision: 2 }))}</>);
    await screen.findByRole("heading", { name: "Plano da semana" });
    cleanup();

    // Anything else keeps Desktop's own card: a failed call, a missing or malformed id, garbage.
    for (const result of [{ success: false, error: "x" }, { id: "../etc" }, "not json", null, 42])  {
      render(<>{media.render(props(result))}</>);
      expect(screen.getByText("Desktop file card")).toBeTruthy();
      cleanup();
    }
  });

  it("draws the canvas a reply names, and nothing for a malformed reference", async () => {
    const { ctx, contributions, requests } = desktop(library);
    plugin.register(ctx);
    const draw = directive(contributions)!.render;

    const { container } = render(
      <>{draw({ attrs: { id: "not a canvas id" }, source: "", streaming: false, sessionId: "session-1" })}</>,
    );
    expect(container.innerHTML).toBe("");
    cleanup();

    render(<>{draw({ attrs: { id: "canvas-plan", rev: "2" }, source: '::atlas{id="canvas-plan" rev="2"}', streaming: false, sessionId: "session-1" })}</>);
    await screen.findByRole("heading", { name: "Plano da semana" });
    expect(requests.map((r) => r.path)).toContain("/canvases/canvas-plan?revision=2");

    // The person acts on the canvas: the text goes into *their* composer, for them to send.
    fireEvent.click(screen.getByRole("button", { name: "Enviar ao Hermes" }));
    await screen.findByText("Adicionado à sua mensagem. Revise e envie.");
    const insert = composerCalls.find((call) => call.method === "insertText");
    expect(insert?.args[0]).toBe("session-1");
    expect(insert?.args[1]).toContain("Atlas");
    expect(insert?.args[2]).toEqual({ mode: "block" });
    expect(composerCalls.some((call) => call.method === "submit")).toBe(false);
  });

  it("ignores a revision attribute that is not a number", async () => {
    const { ctx, contributions, requests } = desktop(library);
    plugin.register(ctx);
    render(<>{directive(contributions)!.render({ attrs: { id: "canvas-plan", rev: "2; drop" }, source: "", streaming: true })}</>);
    await screen.findByRole("heading", { name: "Plano da semana" });
    expect(requests.map((r) => r.path)).not.toContain("/canvases/canvas-plan?revision=2");
  });

  it("refreshes an inline canvas when the backend announces a save", async () => {
    const { ctx, contributions, listeners, requests } = desktop(library);
    plugin.register(ctx);
    render(<>{directive(contributions)!.render({ attrs: { id: "canvas-plan" }, source: "", streaming: false })}</>);
    await screen.findByRole("heading", { name: "Plano da semana" });
    const loads = () => requests.filter((r) => r.path === "/canvases/canvas-plan").length;
    const before = loads();
    act(() => listeners.get("plugin.atlas-intelligent-ui.canvas.saved")!({ type: "x", payload: { id: "canvas-plan" } }));
    await waitFor(() => expect(loads()).toBe(before + 1));
  });

  it("calls a canvas deleted only when the Atlas server says so", async () => {
    let answer = httpError(404, "Canvas não encontrado.");
    const { ctx, contributions } = desktop((path) => (path.startsWith("/clients/") ? {} : answer));
    plugin.register(ctx);
    const draw = () =>
      render(<>{directive(contributions)!.render({ attrs: { id: "canvas-gone" }, source: "", streaming: false })}</>);
    draw();
    await screen.findByText("Este canvas não está mais na biblioteca do Atlas.");
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    cleanup();

    // Hermes answers 404 too while the plugin's backend is not enabled: that is worth a retry.
    answer = httpError(404, "Plugin not found");
    draw();
    await screen.findByText("Não foi possível carregar o canvas. Plugin not found");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Plugin not found"); // not an alert on arrival
    cleanup();

    // A page an Atlas tool wrote then keeps Desktop's own file card, which can still open it.
    const media = contributions.find((c) => c.area === "transcript.toolMedia")!.data as {
      render: (props: unknown) => React.ReactNode;
    };
    render(<>{media.render({ file: {}, toolName: "atlas_render", toolCallId: "c", args: {},
      result: { success: true, id: "canvas-gone", revision: 3 }, sessionId: "s", fallback: <p>Desktop file card</p> })}</>);
    await screen.findByText("Desktop file card");
  });

  it("shows the server's own explanation of a refused write, not the transport's wording", async () => {
    const { ctx, contributions } = desktop((path, options) => {
      if (options?.method === "POST" && path.startsWith("/canvases?"))
        return httpError(409, "Este canvas mudou em outra janela. Abra a última versão antes de salvar.");
      return library(path);
    });
    plugin.register(ctx);
    render(<>{directive(contributions)!.render({ attrs: { id: "canvas-plan", rev: "2" }, source: "", streaming: false })}</>);
    await screen.findByRole("heading", { name: "Plano da semana" });
    fireEvent.change(screen.getByRole("textbox", { name: /Nome/ }), { target: { value: "Outro" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar versão/ }));
    await screen.findByText("Este canvas mudou em outra janela. Abra a última versão antes de salvar.");
    expect(document.body.textContent).not.toContain("Error invoking remote method");
    expect(document.body.textContent).not.toContain('{"detail"');
  });

  it("keeps a pinned canvas when the backend announces the version on screen or a newer one", async () => {
    const { ctx, contributions, listeners, requests } = desktop(library);
    plugin.register(ctx);
    render(<>{directive(contributions)!.render({ attrs: { id: "canvas-plan", rev: "2" }, source: "", streaming: false })}</>);
    await screen.findByRole("heading", { name: "Plano da semana" });
    const reads = () => requests.filter((r) => r.path === "/canvases/canvas-plan?revision=2").length;
    const before = reads();
    const saved = listeners.get("plugin.atlas-intelligent-ui.canvas.saved")!;
    act(() => saved({ type: "x", payload: { id: "canvas-plan", revision: 2 } }));
    act(() => saved({ type: "x", payload: { id: "canvas-plan", revision: 3 } }));
    await screen.findByRole("button", { name: "Existe a versão 3" });
    expect(reads()).toBe(before);
  });

  it("keeps the Atlas page through a gateway reconnect, and rebuilds it for another connection", async () => {
    const { boots } = await openPage();
    // The WebSocket reconnecting is the same library: nothing reloads.
    act(() => state.gateway.set("connecting"));
    act(() => state.gateway.set("open"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(boots()).toBe(1);
    // A new route activation (a same-profile source swap included) or another source does.
    act(() => setHost({ epoch: 1 }));
    await waitFor(() => expect(boots()).toBe(2));
    act(() => state.connectionId.set("vps"));
    await waitFor(() => expect(boots()).toBe(3));
  });

  it("rebuilds the Atlas page on a host without the activation hook once a request notices", async () => {
    setHost({ epochHook: false });
    const { boots } = await openPage();
    setHost({ epoch: 4 }); // no hook: nothing re-renders the page by itself
    fireEvent.click(await screen.findByRole("button", { name: "Minha biblioteca" })); // any request will do
    await waitFor(() => expect(boots()).toBe(2));
  });

  it("sends to the Desktop session from the Atlas page even when the chat's composer is not on screen", async () => {
    setHost({ submit: false }); // the Atlas page covers the chat: Desktop's composer cannot take it
    await openPage();
    fireEvent.change(screen.getByRole("textbox", { name: "Mensagem para o Hermes" }), {
      target: { value: "Resuma o plano" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar à sessão ativa do Desktop" }));
    await screen.findByText(/Mensagem enviada à sessão ativa do Desktop/);
    expect(composerCalls.find((call) => call.method === "submit")?.args[0]).toBe("session-1");
    expect(composerCalls.find((call) => call.method === "request" && call.args[0] === "prompt.submit")?.args).toEqual([
      "prompt.submit",
      { session_id: "session-1", text: "Resuma o plano" },
    ]);
  });

  it("offers sending to the Desktop session only where the host has a way to send", async () => {
    setHost({ submitApi: false, request: false });
    await openPage();
    expect(screen.queryByRole("button", { name: "Enviar à sessão ativa do Desktop" })).toBeNull();
  });

  it("follows a language switch in Desktop", async () => {
    const { ctx, disposers } = desktop(library);
    plugin.register(ctx);
    const i18n = await import("../i18n");
    document.documentElement.lang = "en";
    await waitFor(() => expect(i18n.getLocale()).toBe("en"));
    document.documentElement.lang = "pt-BR";
    await waitFor(() => expect(i18n.getLocale()).toBe("pt-BR"));
    disposers.splice(0).forEach((fn) => fn());
    document.documentElement.lang = "en";
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(i18n.getLocale()).toBe("pt-BR"); // disposed: no longer listening
  });

  it("speaks the language chosen in Hermes once the backend answers", async () => {
    const { ctx } = desktop((path) => (path.startsWith("/clients/") ? { locale: "en" } : null));
    // The handshake is sent once per page: load fresh copies of the modules for this one.
    vi.resetModules();
    const { default: fresh } = await import("./desktop");
    const i18n = await import("../i18n");
    fresh.register(ctx);
    expect(i18n.getLocale()).toBe("pt-BR"); // the page's language, until the backend answers
    await waitFor(() => expect(i18n.getLocale()).toBe("en"));
    i18n.setLocale("pt-BR");
  });

  it("reaches the Atlas API through plugin RPC where Hermes serves it (every profile, Hermes 0.23)", async () => {
    const rpcCalls: { method: string; params: Record<string, unknown> }[] = [];
    host.request = async (method: string, params?: unknown) => {
      const p = params as Record<string, unknown>;
      rpcCalls.push({ method, params: p });
      if (method !== RPC_METHOD) return { ok: true };
      const path = String(p.path) + (p.query ? `?${p.query}` : "");
      const answer = library(path);
      return answer instanceof Error ? { status: 404, body: { detail: "Canvas não encontrado." } } : { status: 200, body: answer };
    };
    const { ctx, contributions, requests } = desktop(() => httpError(404, "Plugin not found"));
    plugin.register(ctx);
    const media = contributions.find((c) => c.area === "transcript.toolMedia")!.data as {
      render: (props: unknown) => React.ReactNode;
    };
    render(
      <>
        {media.render({
          file: { path: "/x/plano-v2.html", name: "plano-v2.html", kind: "file", mime: "text/html", resolveUrl: async () => "" },
          toolName: "atlas_render", toolCallId: "c1", args: {}, sessionId: "session-1",
          result: { success: true, id: "canvas-plan", revision: 2 }, fallback: <p>card</p>,
        })}
      </>,
    );
    await screen.findByRole("heading", { name: "Plano da semana" });
    expect(requests).toEqual([]); // ctx.rest, refused by Hermes on secondary profiles, was never needed
    const reads = rpcCalls.filter((call) => call.method === RPC_METHOD).map((call) => call.params);
    expect(reads).toContainEqual({ method: "GET", path: "/canvases/canvas-plan", query: "revision=2", body: undefined });
  });

  it("keeps ctx.rest on a Hermes without plugin RPC", async () => {
    host.request = async (method: string) => {
      if (method === RPC_METHOD) throw new Error("-32601: unknown method plugin.atlas-intelligent-ui.http");
      return { ok: true };
    };
    const { ctx, contributions, requests } = desktop(library);
    plugin.register(ctx);
    const media = contributions.find((c) => c.area === "transcript.toolMedia")!.data as {
      render: (props: unknown) => React.ReactNode;
    };
    render(
      <>
        {media.render({
          file: { path: "/x/plano-v2.html", name: "plano-v2.html", kind: "file", mime: "text/html", resolveUrl: async () => "" },
          toolName: "atlas_render", toolCallId: "c1", args: {}, sessionId: "session-1",
          result: { success: true, id: "canvas-plan", revision: 2 }, fallback: <p>card</p>,
        })}
      </>,
    );
    await screen.findByRole("heading", { name: "Plano da semana" });
    expect(requests.map((r) => r.path)).toContain("/canvases/canvas-plan?revision=2");
  });
});
