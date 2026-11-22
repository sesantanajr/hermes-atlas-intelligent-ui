// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contribution, GatewayEvent, PluginContext, TranscriptDirectiveProps } from "@hermes/plugin-sdk";
import { setLocale } from "../i18n";
import type { Canvas } from "../types";
import plugin from "./desktop";
import { composerCalls, resetHost, setHost } from "./testing/plugin-sdk";

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

const library = (path: string) => {
  if (path.startsWith("/clients/")) return { kind: "desktop", locale: "auto" };
  if (path.startsWith("/canvases/canvas-plan/draft")) return null;
  if (path.startsWith("/canvases/canvas-plan"))
    return { id: "canvas-plan", revision: 2, updated: "x", canvas: form };
  return new Error("HTTP 404 Not Found");
};

function directive(contributions: Contribution[]) {
  const entry = contributions.find((c) => c.area === "transcript.directive");
  return entry?.data as { name: string; render: (props: TranscriptDirectiveProps) => React.ReactNode } | undefined;
}

beforeEach(() => {
  resetHost();
  document.documentElement.lang = "pt-BR";
});
afterEach(() => {
  cleanup();
  registrations.splice(0).forEach((disposers) => disposers.splice(0).forEach((fn) => fn()));
  setLocale("pt-BR");
  document.documentElement.lang = "";
  document.head.querySelectorAll("style[data-hermes-atlas]").forEach((node) => node.remove());
});

describe("Hermes Desktop extension", () => {
  it("is the module the Desktop loader expects", () => {
    expect(plugin.id).toBe("hermes-atlas"); // the folder name under desktop-plugins/
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
      ["canvas", "transcript.directive"],
    ]);
    // Only the tools whose result names a canvas page; Desktop refuses claims on other tools.
    expect((contributions[2].data as { tools: string[] }).tools).toEqual(["atlas_render", "atlas_update"]);
    expect(contributions[0].data).toEqual({ path: "/atlas" });
    expect(contributions[1].data).toMatchObject({ path: "/atlas", label: "Atlas" });
    expect(directive(contributions)?.name).toBe("atlas");
    expect([...listeners.keys()]).toEqual([
      "plugin.hermes-atlas.canvas.saved",
      "plugin.hermes-atlas.canvas.deleted",
    ]);
    // The backend learns what this Desktop can draw, so the tools pick the best way to show a canvas.
    await waitFor(() => expect(requests.some((r) => r.path === "/clients/desktop" && r.method === "POST")).toBe(true));
    const hello = requests.find((r) => r.path === "/clients/desktop")!;
    expect(hello.body).toMatchObject({ features: ["directive", "tool_media"] });
    // The stylesheet is injected (the host loads no CSS file) and removed on dispose.
    expect(document.head.querySelectorAll("style[data-hermes-atlas]").length).toBe(1);
    disposers.splice(0).forEach((fn) => fn());
    expect(document.head.querySelectorAll("style[data-hermes-atlas]").length).toBe(0);
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
    const file = { path: "/home/u/.hermes/plugin-data/hermes-atlas/exports/plano-v2.html", name: "plano-v2.html",
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
    act(() => listeners.get("plugin.hermes-atlas.canvas.saved")!({ type: "x", payload: { id: "canvas-plan" } }));
    await waitFor(() => expect(loads()).toBe(before + 1));
  });

  it("reports a missing canvas from the HTTP status in the host's error", async () => {
    const { ctx, contributions } = desktop((path) =>
      path.startsWith("/clients/") ? {} : new Error("Request failed with HTTP 404"),
    );
    plugin.register(ctx);
    render(<>{directive(contributions)!.render({ attrs: { id: "canvas-gone" }, source: "", streaming: false })}</>);
    await screen.findByText("Este canvas não está mais na biblioteca do Atlas.");
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
});
