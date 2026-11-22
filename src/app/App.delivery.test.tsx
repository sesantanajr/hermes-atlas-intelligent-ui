// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  within,
  cleanup,
  act,
  fireEvent,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { assistantText, conversationMessages } from "./replyDelivery";
import type { Conversation, Message, Run, Transport } from "../types";

const row = (
  role: Message["role"],
  content: string,
  extra: Partial<Message> = {},
): Message => ({
  id: crypto.randomUUID(),
  role,
  content,
  created: "2026-11-21T12:00:00Z",
  ...extra,
});
const chat = (messages: Message[], active?: string): Conversation => ({
  id: "A",
  title: "Conversa de teste",
  messages,
  active_run: active,
});
const activeRun = (fields: Partial<Run> = {}): Run => ({
  id: "R",
  conversation_id: "A",
  text: "",
  events: [],
  status: "running",
  ...fields,
});
function transport(getChat: () => Conversation, getRun?: Transport): Transport {
  return async (path, init) => {
    if (path === "/status")
      return { connected: true, scope: "test-scope", features: {} };
    if (path === "/workspace" && (init?.method ?? "GET") === "GET")
      return { chat_id: "A", canvas: null, revision: 0, theme: "light" };
    if (path === "/conversations/A") return getChat();
    if (path.startsWith("/runs/") && getRun) return getRun(path, init);
    if (path.startsWith("/conversations?"))
      return [
        { id: "A", title: "Conversa de teste" },
        { id: "B", title: "Segunda conversa" },
      ];
    if (path === "/conversations/B")
      return {
        id: "B",
        title: "Segunda conversa",
        messages: [row("user", "Pergunta B")],
      };
    return [];
  };
}
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("delivers ordinary text, quotations, indented and fenced Markdown; suppresses a standalone or closing transport marker", () => {
  for (const original of [
    "Use [SILENT] no exemplo.",
    "`[SILENT]`",
    "x\n> [SILENT]",
    "x\n    [SILENT]",
    "x\n\t[SILENT]",
    "exemplo\n~~~~\n[SILENT]",
    "exemplo\n````txt\n```\n[SILENT]",
    "[SILENT] pode ser citado",
    "NO_REPLY!",
  ]) {
    expect(assistantText(original)).toBe(original);
    expect(assistantText(original, true)).toBe(original);
  }
  for (const marker of [
    "[silent]",
    "Silent",
    "no_reply",
    "NO   REPLY",
    "[静默]",
    "静默",
    "[沉默]",
    "沉默",
  ]) {
    expect(assistantText(marker + "  ")).toBe("");
    expect(assistantText("Resposta.\r\n\r\n" + marker)).toBe("Resposta.");
  }
  expect(assistantText("Resposta.\n[SIL", true)).toBe("Resposta.");
  expect(assistantText("Resposta.\n[SIL")).toBe("Resposta.\n[SIL");
  expect(assistantText("Resposta.\n[SILOS]", true)).toBe("Resposta.\n[SILOS]");
  expect(assistantText("```\n[SILENT]\n```\n[SILENT]")).toBe(
    "```\n[SILENT]\n```",
  );
});

it("reopens the result and its individual tool outcomes in the real conversation view", async () => {
  const history = chat([
    row("user", "Quais recursos foram medidos?"),
    row("assistant", "A memória foi medida.", {
      status: "completed",
      activity: {
        limited: false,
        steps: [
          { kind: "tool", name: "terminal", status: "succeeded" },
          {
            kind: "tool",
            name: "execute_code",
            status: "failed",
            reason: "timeout",
          },
        ],
      },
    }),
    row("assistant", "", {
      status: "completed",
      delivery: "silent",
      activity: {
        limited: true,
        steps: [
          { kind: "subagent", name: "Especialista 2", status: "unknown" },
        ],
      },
    }),
  ]);
  render(<App transport={transport(() => history)} />);
  await screen.findByText("A memória foi medida.");
  const embedded = screen.getByText("Resposta entregue").closest("details")!;
  fireEvent.click(embedded.querySelector("summary")!);
  expect(within(embedded).getByText("Tempo limite atingido")).toBeTruthy();
  expect(within(embedded).getByText("1 falha")).toBeTruthy();
  const silent = screen
    .getByText("Execução concluída sem resposta de texto")
    .closest("details")!;
  expect(silent.closest("article")).toBeNull();
  expect(screen.queryByText("[SILENT]")).toBeNull();
});

it("keeps a single delivery receipt for a direct turn, and ignores extra control messages on either side of a useful answer", () => {
  const human = row("user", "Pedido");
  const useful = row("assistant", "Entregue");
  const silent = row("assistant", "[SILENT]", { status: "completed" });
  const messages = conversationMessages([
    silent,
    human,
    silent,
    useful,
    silent,
    human,
    silent,
    silent,
  ]);
  expect(messages.map((m) => [m.role, m.content, m.delivery])).toEqual([
    ["user", "Pedido", undefined],
    ["assistant", "Entregue", undefined],
    ["user", "Pedido", undefined],
    ["assistant", "", "silent"],
  ]);
  expect(silent.content).toBe("[SILENT]");
});

it("reopens legacy messages with usable copy actions only; warnings, a user's literal and a canvas-only result are preserved", async () => {
  const history = chat([
    row("user", "[SILENT]"),
    row("assistant", "Resposta útil\n[SILENT]"),
    row("assistant", "[SILENT]"),
    row("user", "Crie o canvas"),
    row("assistant", "[SILENT]", { artifact: { id: "canvas", revision: 2 } }),
    row("user", "Pedido direto"),
    row("assistant", "", { delivery: "silent" }),
    row("user", "Outro turno"),
    row("assistant", "[SILENT]", { status: "failed" }),
  ]);
  await act(async () => {
    render(<App transport={transport(() => history)} />);
  });
  const articles = screen.getAllByRole("article");
  expect(articles).toHaveLength(7);
  expect(screen.getAllByText("[SILENT]")).toHaveLength(1);
  expect(screen.getByText("Resposta útil")).toBeTruthy();
  expect(
    within(
      screen.getByRole("button", { name: /Abrir canvas/ }).closest("article")!,
    ).queryByRole("button", { name: "Copiar mensagem" }),
  ).toBeNull();
  expect(screen.getByText("O Hermes não concluiu a execução.")).toBeTruthy();
  expect(
    screen
      .getByText("O Hermes concluiu o pedido sem enviar uma resposta.")
      .closest("article"),
  ).toBeNull();
});

it("holds split markers through cursor polls, skips unchanged snapshots and settles on the persisted answer without a ghost row", async () => {
  vi.useFakeTimers();
  const user = row("user", "Pergunta");
  let done = false,
    calls = 0;
  const paths: string[] = [];
  const gateway = transport(
    () =>
      done
        ? chat([
            user,
            row("assistant", "Entregue"),
            row("assistant", "[SILENT]"),
          ])
        : chat([user], "R"),
    async (path) => {
      paths.push(path);
      switch (++calls) {
        case 1:
          return activeRun({ text: "[S", cursor: "v1" });
        case 2:
          return activeRun({
            text: "[SILENT]",
            cursor: "v2",
            events: [{ type: "message.interim", text: "[SILENT]" }],
          });
        case 3:
          return { id: "R", unchanged: true, cursor: "v2" };
        case 4:
          done = true;
          return activeRun({
            status: "completed",
            text: "",
            delivery: "silent",
          });
      }
    },
  );
  await act(async () => {
    render(<App transport={gateway} />);
  });
  expect(paths).toEqual(["/runs/R", "/runs/R?cursor=v1"]);
  expect(screen.queryByText(/\[S/)).toBeNull();
  expect(screen.queryByText(/Atividade do agente/)).toBeNull();
  const panel = screen.getByText("Pergunta").closest(".messages")!;
  const scroll = vi.fn();
  Object.defineProperty(panel, "scrollTop", {
    configurable: true,
    get: () => 0,
    set: scroll,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450);
  });
  expect(scroll).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450);
  });
  expect(screen.getByText("Entregue")).toBeTruthy();
  expect(screen.queryByText(/sem enviar uma resposta/)).toBeNull();
  expect(paths.slice(-2)).toEqual(["/runs/R?cursor=v2", "/runs/R?cursor=v2"]);
});

it("backs off after a lost poll and clears the reconnect status on an unchanged cursor response", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const gateway = transport(
    () => chat([row("user", "Pergunta")], "R"),
    async () => {
      ++calls;
      if (calls === 2 || calls === 3)
        throw Error("Rede temporariamente indisponível.");
      return calls === 1
        ? activeRun({ text: "Em andamento", cursor: "v1" })
        : { id: "R", cursor: "v1", unchanged: true };
    },
  );
  await act(async () => {
    render(<App transport={gateway} />);
  });
  expect(screen.getByText(/Reconectando à mesma execução/)).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(899);
  });
  expect(calls).toBe(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(calls).toBe(3);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1799);
  });
  expect(calls).toBe(3);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByText("Em andamento")).toBeTruthy();
  expect(screen.queryByText(/Reconectando à mesma execução/)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps the reader's scroll position when a real reply grows and leaves the surrounding host in place", async () => {
  vi.useFakeTimers();
  let words = "Parte inicial.";
  const gateway = transport(
    () => chat([row("user", "Pergunta")], "R"),
    async () => activeRun({ text: words }),
  );
  await act(async () => {
    render(<App transport={gateway} />);
  });
  const panel = screen
    .getByText("Pergunta")
    .closest(".messages")! as HTMLElement;
  Object.defineProperty(panel, "scrollHeight", {
    value: 900,
    configurable: true,
  });
  Object.defineProperty(panel, "clientHeight", {
    value: 240,
    configurable: true,
  });
  panel.scrollTop = 40;
  fireEvent.scroll(panel);
  words += " Outra frase.";
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450);
  });
  expect(screen.getByText(words)).toBeTruthy();
  expect(panel.scrollTop).toBe(40);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it("never overlaps slow profile checks or does an extra status call while hydrating", async () => {
  vi.useFakeTimers();
  let count = 0;
  let finish!: () => void;
  const base = transport(() => chat([row("user", "Pedido")]));
  const gateway: Transport = async (path, init) => {
    if (path === "/status") {
      count++;
      if (count === 2)
        await new Promise<void>((r) => {
          finish = r;
        });
    }
    return base(path, init);
  };
  await act(async () => {
    render(<App transport={gateway} />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(count).toBe(2);
  await act(async () => {
    finish();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(count).toBe(3);
});

it("discards the old terminal result when the conversation changes during a pending poll", async () => {
  let resolve!: (r: Run) => void;
  let first = true;
  const gateway = transport(
    () => chat([row("user", "Pergunta A")], "R"),
    async () => {
      if (first) {
        first = false;
        return activeRun({ cursor: "v1" });
      }
      return new Promise<Run>((r) => {
        resolve = r;
      });
    },
  );
  await act(async () => {
    render(<App transport={gateway} />);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Segunda conversa" }));
  });
  await act(async () => {
    resolve(activeRun({ status: "completed", warning: "Antiga" }));
  });
  expect(screen.getByText("Pergunta B")).toBeTruthy();
  expect(screen.queryByText("Pergunta A")).toBeNull();
  expect(screen.queryByText("Antiga")).toBeNull();
});
