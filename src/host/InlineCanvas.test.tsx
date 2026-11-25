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
    const gone = new ApiError("Canvas não encontrado.", 404, "Canvas não encontrado.");
    const missing = server({ "GET /canvases/canvas-trip": () => gone });
    render(<InlineCanvas canvasId="canvas-trip" api={missing.api} host={host} />);
    await screen.findByText("Este canvas não está mais na biblioteca do Atlas.");
    cleanup();

    // Any other 404 (Hermes's own, while the plugin's backend is off) is not a deletion.
    const unmounted = server({});
    render(<InlineCanvas canvasId="canvas-trip" api={unmounted.api} host={host} />);
    await screen.findByRole("button", { name: "Tentar novamente" });
    cleanup();

    let fail = true;
    const flaky = server({
      "GET /canvases/canvas-trip": () => (fail ? new ApiError("Servidor indisponível.", 503) : record(1)),
      "GET /canvases/canvas-trip/draft": () => null,
    });
    render(<InlineCanvas canvasId="canvas-trip" api={flaky.api} host={host} />);
    await screen.findByText(/Não foi possível carregar o canvas\. Servidor indisponível\./);
    expect(screen.queryByRole("alert")).toBeNull(); // nothing the person did: not an alert
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("alert"); // the retry they asked for failed: that is announced
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("heading", { name: "Viagem a Lisboa" });
  });

  it("draws the fallback it was given when the canvas cannot be loaded", async () => {
    const { api } = server({ "GET /canvases/canvas-trip": () => new ApiError("Servidor indisponível.", 503) });
    render(<InlineCanvas canvasId="canvas-trip" api={api} host={host} fallback={<p>Cartão do Desktop</p>} />);
    await screen.findByText("Cartão do Desktop");
  });

  it("keeps the version the person saved when the backend announces it back", async () => {
    const { api, calls } = server({
      "GET /canvases/canvas-trip\\?revision=1": () => record(1),
      "GET /canvases/canvas-trip\\?revision=2": () => record(2, ticked(trip, 0)),
      "GET /canvases/canvas-trip": () => record(2, ticked(trip, 0)),
      "GET /canvases/canvas-trip/draft": () => null,
      "POST /canvases\\?expected_revision=1": (call) => record(2, call.data as Canvas),
    });
    await show(api, { revision: 1 });
    fireEvent.click(screen.getByRole("checkbox", { name: "Passaporte" }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar versão/ }));
    await screen.findByText("Versão 2 salva com suas alterações.");
    act(() => announceCanvasChange("canvas-trip", 2)); // the backend announces the save
    await act(async () => void vi.advanceTimersByTime(50));
    expect(screen.getByText("v2")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Passaporte" }) as HTMLInputElement).checked).toBe(true);
    expect(calls.filter((c) => c.path === "/canvases/canvas-trip?revision=1")).toHaveLength(1);
    // From now on the card reloads the version the person saved, not the one the reply named.
    act(() => announceCanvasChange("canvas-trip"));
    await waitFor(() => expect(calls.some((c) => c.path === "/canvases/canvas-trip?revision=2")).toBe(true));
    expect(screen.getByText("v2")).toBeTruthy();
  });

  it("writes one change at a time, each with the token the previous write left", async () => {
    const puts: { token?: string; finish: (token: string) => void }[] = [];
    const { api } = server({
      "GET /canvases/canvas-trip": () => record(1),
      "GET /canvases/canvas-trip/draft": () => null,
      "PUT /canvases/canvas-trip/draft": (call) =>
        new Promise((resolve) => {
          const data = call.data as { canvas: Canvas; expected_token?: string };
          puts.push({
            token: data.expected_token,
            finish: (token) => resolve({ id: "canvas-trip", base_revision: 1, canvas: data.canvas, updated: "now", token }),
          });
        }),
    });
    await show(api);
    fireEvent.click(screen.getByRole("checkbox", { name: "Passaporte" }));
    await act(async () => void vi.advanceTimersByTime(800));
    await waitFor(() => expect(puts).toHaveLength(1));
    // A slow connection: the next change is ready before the first write has come back.
    fireEvent.click(screen.getByRole("checkbox", { name: "Seguro" }));
    await act(async () => void vi.advanceTimersByTime(800));
    expect(puts).toHaveLength(1);
    await act(async () => puts[0].finish("t-1"));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts.map((put) => put.token)).toEqual([undefined, "t-1"]);
    await act(async () => puts[1].finish("t-2"));
    expect(screen.queryByText(/mudou em outra janela/)).toBeNull();
  });

  it("discards only after the write under way, and says so when the server keeps the draft", async () => {
    let finish!: () => void;
    const { api, writes } = server({
      "GET /canvases/canvas-trip": () => record(1),
      "GET /canvases/canvas-trip/draft": () => null,
      "PUT /canvases/canvas-trip/draft": () =>
        new Promise((resolve) => {
          finish = () => resolve({ token: "t-1" });
        }),
      "DELETE /canvases/canvas-trip/draft": () => new ApiError("Servidor indisponível.", 503),
    });
    await show(api);
    const passport = () => screen.getByRole("checkbox", { name: "Passaporte" }) as HTMLInputElement;
    fireEvent.click(passport());
    await act(async () => void vi.advanceTimersByTime(800));
    await waitFor(() => expect(writes()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Descartar minhas alterações" }));
    await act(async () => void vi.advanceTimersByTime(50));
    expect(writes().map((c) => c.method)).toEqual(["PUT"]); // waits for the write under way
    await act(async () => finish());
    await waitFor(() => expect(writes().map((c) => c.method)).toEqual(["PUT", "DELETE"]));
    await screen.findByText(/Não foi possível descartar suas alterações\. Servidor indisponível\./);
    expect(passport().checked).toBe(true); // the server still has it, so the card still shows it
  });

  it("writes the last change after the one under way when the card unmounts", async () => {
    const tokens: (string | undefined)[] = [];
    let finish!: () => void;
    const { api, writes } = server({
      "GET /canvases/canvas-trip": () => record(1),
      "GET /canvases/canvas-trip/draft": () => null,
      "PUT /canvases/canvas-trip/draft": (call) => {
        tokens.push((call.data as { expected_token?: string }).expected_token);
        if (tokens.length > 1) return { token: "t-2" };
        return new Promise((resolve) => {
          finish = () => resolve({ token: "t-1" });
        });
      },
    });
    await show(api);
    fireEvent.click(screen.getByRole("checkbox", { name: "Passaporte" }));
    await act(async () => void vi.advanceTimersByTime(800));
    await waitFor(() => expect(writes()).toHaveLength(1));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seguro" }));
    cleanup(); // scrolled away before the delayed save, with a write still under way
    expect(writes()).toHaveLength(1);
    finish();
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(tokens).toEqual([undefined, "t-1"]);
    expect(writes()[1].data).toMatchObject({
      canvas: { state: { todo: { checked: expect.arrayContaining([0, 1]) } } },
    });
  });

  it("copies an action through the host's clipboard when no composer takes it", async () => {
    const form: Canvas = {
      ...trip,
      blocks: [{ id: "f", type: "form", title: "Dados", fields: [{ id: "n", label: "Nome", kind: "text" }] }],
    };
    const { api } = server({
      "GET /canvases/canvas-trip": () => record(1, form),
      "GET /canvases/canvas-trip/draft": () => null,
    });
    const writeClipboard = vi.fn(async () => true);
    await show(api, { host: { kind: "desktop", writeClipboard } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar ao Hermes" }));
    await screen.findByText("Copiado. Cole na conversa para enviar ao Hermes.");
    expect(writeClipboard).toHaveBeenCalledWith(expect.stringContaining("Dados"));
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
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menuitem", { name: /Interactive page \(HTML\)/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Image \(PNG\)/ })).toBeTruthy();
  });
});
