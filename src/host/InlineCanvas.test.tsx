// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../i18n";
import type { Canvas, Draft, Record as CanvasRecord } from "../types";
import { ApiError, type Api } from "./client";
import type { Host } from "./context";
import { InlineCanvas, announceCanvasChange } from "./InlineCanvas";

type Call = { path: string; data?: unknown; method: string };

const trip: Canvas = {
  id: "canvas-trip",
  title: "Viagem a Lisboa",
  description: "Lista para a viagem.",
  schema_version: "1.0",
  blocks: [{ type: "checklist", id: "todo", title: "Antes de sair", items: ["Passaporte", "Seguro"] }],
};
const record = (revision: number, canvas: Canvas = trip): CanvasRecord => ({
  id: canvas.id,
  revision,
  updated: "2026-11-21T12:00:00Z",
  canvas,
});
const ticked = (canvas: Canvas, ...checked: number[]): Canvas => ({
  ...canvas,
  state: { todo: { checked } },
});

/** A stand-in for the Atlas API: answers by method and path, and records every call. */
function server(routes: Partial<Record<string, (call: Call) => unknown>>) {
  const calls: Call[] = [];
  const api = (async (path: string, data?: unknown, method?: string) => {
    const call = { path, data, method: method || (data === undefined ? "GET" : "POST") };
    calls.push(call);
    const route = Object.entries(routes).find(([key]) => {
      const [verb, pattern] = key.split(" ");
      return verb === call.method && new RegExp(`^${pattern}$`).test(path);
    });
    if (!route) throw new ApiError("Not found.", 404);
    const result = route[1]!(call);
    if (result instanceof Error) throw result;
    return result;
  }) as Api;
  return { api, calls, writes: () => calls.filter((c) => c.method !== "GET") };
}

const host: Host = { kind: "desktop" };

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setLocale("pt-BR");
});

async function show(api: Api, props: Partial<React.ComponentProps<typeof InlineCanvas>> = {}) {
  render(<InlineCanvas canvasId="canvas-trip" api={api} host={host} sessionId="s1" {...props} />);
  await screen.findByRole("heading", { name: "Viagem a Lisboa" });
}

describe("InlineCanvas", () => {
  it("shows the saved revision and keeps an interaction as a draft, not a revision", async () => {
    const { api, writes } = server({
      "GET /canvases/canvas-trip": () => record(1),
      "GET /canvases/canvas-trip/draft": () => null,
      "PUT /canvases/canvas-trip/draft": (call) => ({
        id: "canvas-trip", base_revision: 1, canvas: (call.data as { canvas: Canvas }).canvas,
        updated: "now", token: "t-1",
      }),
    });
    await show(api);
    expect(screen.getByText("v1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Salvar versão/ })).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Passaporte" }));
    expect(screen.getByRole("button", { name: /Salvar versão/ })).toBeTruthy();
    expect(writes()).toEqual([]); // saving waits for the person to pause
    await act(async () => void vi.advanceTimersByTime(800));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: "PUT",
      path: "/canvases/canvas-trip/draft",
      data: { base_revision: 1, canvas: ticked(trip, 0) },
    });
    expect(screen.getByRole("status").textContent).toContain("O Hermes já consegue vê-las");
  });

  it("resumes a draft made on the same revision and sends its token with the next change", async () => {
    const draft: Draft = {
      id: "canvas-trip", base_revision: 2, canvas: ticked(trip, 1), updated: "x", token: "t-9",
    };
    const { api, writes } = server({
      "GET /canvases/canvas-trip": () => record(2),
      "GET /canvases/canvas-trip/draft": () => draft,
      "PUT /canvases/canvas-trip/draft": () => ({ ...draft, token: "t-10" }),
    });
    await show(api);
    expect((screen.getByRole("checkbox", { name: "Seguro" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Passaporte" }));
    await act(async () => void vi.advanceTimersByTime(800));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].data).toMatchObject({ expected_token: "t-9", base_revision: 2 });
  });

  it("ignores a draft made on another revision", async () => {
    const { api } = server({
      "GET /canvases/canvas-trip": () => record(3),
      "GET /canvases/canvas-trip/draft": () => ({
        id: "canvas-trip", base_revision: 2, canvas: ticked(trip, 0, 1), updated: "x", token: "t",
      }),
    });
    await show(api);
    expect((screen.getByRole("checkbox", { name: "Passaporte" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("button", { name: /Salvar versão/ })).toBeNull();
  });

  it("saves a new version on request and discards a draft on request", async () => {
    const { api, writes } = server({
      "GET /canvases/canvas-trip": () => record(1),
      "GET /canvases/canvas-trip/draft": () => null,
      "PUT /canvases/canvas-trip/draft": () => ({ token: "t-1" }),
      "DELETE /canvases/canvas-trip/draft": () => null,
      "POST /canvases\\?expected_revision=1": (call) => record(2, call.data as Canvas),
    });
    await show(api);
    fireEvent.click(screen.getByRole("checkbox", { name: "Passaporte" }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar versão/ }));
    await screen.findByText("Versão 2 salva com suas alterações.");
    expect(screen.getByText("v2")).toBeTruthy();
    expect(writes().map((c) => c.method)).toEqual(["POST"]); // the pending draft save was dropped

    fireEvent.click(screen.getByRole("checkbox", { name: "Seguro" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar minhas alterações" }));
    await waitFor(() => expect(writes().at(-1)?.method).toBe("DELETE"));
    expect((screen.getByRole("checkbox", { name: "Seguro" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Passaporte" }) as HTMLInputElement).checked).toBe(true);
  });

  it("sends the last change when the card is unmounted before the delayed save", async () => {
    const { api, writes } = server({
      "GET /canvases/canvas-trip": () => record(1),
      "GET /canvases/canvas-trip/draft": () => null,
      "PUT /canvases/canvas-trip/draft": () => ({ token: "t-1" }),
    });
    await show(api);
    fireEvent.click(screen.getByRole("checkbox", { name: "Seguro" }));
    cleanup();
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].data).toMatchObject({ canvas: ticked(trip, 1) });
  });

  it("reloads when another window changed the draft", async () => {
    let revision = 1;
    const { api, calls } = server({
      "GET /canvases/canvas-trip": () => record(revision),
      "GET /canvases/canvas-trip/draft": () => null,
      "PUT /canvases/canvas-trip/draft": () => new ApiError("O rascunho foi alterado em outra aba.", 409),
    });
    await show(api);
    revision = 2;
    fireEvent.click(screen.getByRole("checkbox", { name: "Passaporte" }));
    await act(async () => void vi.advanceTimersByTime(800));
    await screen.findByText("Este canvas mudou em outra janela. Mostrando a versão atual.");
    await screen.findByText("v2");
    expect(calls.filter((c) => c.path === "/canvases/canvas-trip").length).toBe(2);
  });

  it("refreshes when the backend announces a save, unless the person is mid-change", async () => {
    let title = "Viagem a Lisboa";
    const { api } = server({
      "GET /canvases/canvas-trip": () => record(1, { ...trip, title }),
      "GET /canvases/canvas-trip/draft": () => null,
    });
    await show(api);
    title = "Viagem ao Porto";
    act(() => announceCanvasChange("canvas-other"));
    act(() => announceCanvasChange("canvas-trip"));
    await screen.findByRole("heading", { name: "Viagem ao Porto" });
  });

  it("points to a newer version when the reply named an older one", async () => {
    const openWorkspace = vi.fn();
    const { api } = server({
      "GET /canvases/canvas-trip\\?revision=1": () => record(1),
      "GET /canvases/canvas-trip": () => record(3),
      "GET /canvases/canvas-trip/draft": () => null,
    });
    await show(api, { revision: 1, host: { kind: "desktop", openWorkspace } });
    fireEvent.click(await screen.findByRole("button", { name: "Existe a versão 3" }));
    expect(openWorkspace).toHaveBeenCalledWith("canvas-trip", 3);
  });

  it("explains a canvas that is gone, and offers a retry for other failures", async () => {
    const missing = server({});
    render(<InlineCanvas canvasId="canvas-trip" api={missing.api} host={host} />);
    await screen.findByText("Este canvas não está mais na biblioteca do Atlas.");
    cleanup();

    let fail = true;
    const flaky = server({
      "GET /canvases/canvas-trip": () => (fail ? new ApiError("Servidor indisponível.", 503) : record(1)),
      "GET /canvases/canvas-trip/draft": () => null,
    });
    render(<InlineCanvas canvasId="canvas-trip" api={flaky.api} host={host} />);
    await screen.findByText(/Não foi possível carregar o canvas\. Servidor indisponível\./);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("heading", { name: "Viagem a Lisboa" });
  });

  it("speaks English when the interface does", async () => {
    setLocale("en");
    const { api } = server({
      "GET /canvases/canvas-trip": () => record(1),
      "GET /canvases/canvas-trip/draft": () => null,
      "PUT /canvases/canvas-trip/draft": () => ({ token: "t" }),
    });
    await show(api);
    expect(screen.getByRole("region", { name: "Atlas canvas" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Passaporte" }));
    expect(screen.getByRole("button", { name: /Save version/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download as an HTML page" })).toBeTruthy();
  });
});
