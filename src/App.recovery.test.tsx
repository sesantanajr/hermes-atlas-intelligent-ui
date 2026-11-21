// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  act,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { App } from "./App";
import { Transport } from "./types";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});
it("rehydrates the workspace after a transient outage instead of leaving chat disabled", async () => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  Element.prototype.scrollIntoView = vi.fn();
  let offline = false;
  const transport: Transport = async (path) => {
    if (offline) throw new Error("Failed to fetch");
    if (path === "/status")
      return { scope: "same-profile", connected: true, features: {} };
    if (path === "/workspace")
      return { chat_id: null, canvas: null, revision: 0, theme: "light" };
    if (path.startsWith("/conversations?"))
      return [{ id: "existing", title: "Saved conversation" }];
    return [];
  };
  await act(async () => {
    render(<App transport={transport} />);
  });
  expect(
    screen.getByRole("button", { name: "Saved conversation" }),
  ).toBeTruthy();
  offline = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(
    screen.queryByRole("button", { name: "Saved conversation" }),
  ).toBeNull();
  offline = false;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(
    screen.getByRole("button", { name: "Saved conversation" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Hermes conectado" })).toBeTruthy();
});

it("preserves the submission identity when an ambiguous POST is followed by a connection outage", async () => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  Element.prototype.scrollIntoView = vi.fn();
  let offline = false;
  const submissions: Record<string, unknown>[] = [];
  const transport: Transport = async (path, init) => {
    if (offline) throw new Error("Failed to fetch");
    if (path === "/status")
      return { scope: "same-profile", connected: true, features: {} };
    if (path === "/workspace")
      return { chat_id: null, canvas: null, revision: 0, theme: "light" };
    if (path === "/runs") {
      submissions.push(JSON.parse(String(init?.body)));
      throw new Error("Connection lost after submission");
    }
    return [];
  };
  await act(async () => {
    render(<App transport={transport} />);
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Mensagem para o Hermes" }),
    { target: { value: "Pedido de teste" } },
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  });
  offline = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  offline = false;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(
    (
      screen.getByRole("textbox", {
        name: "Mensagem para o Hermes",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Pedido de teste");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  });
  expect(submissions).toHaveLength(2);
  expect(submissions[1].request_id).toBe(submissions[0].request_id);
  expect(submissions[1].conversation_id).toBe(submissions[0].conversation_id);
});
