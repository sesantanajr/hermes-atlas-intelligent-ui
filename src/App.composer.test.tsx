// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { examples } from "./examples";
import type { Transport } from "./types";
import type { Run } from "./types";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});
const editor = () =>
  screen.getByRole("textbox", {
    name: "Mensagem para o Hermes",
  }) as HTMLTextAreaElement;
const write = (value: string) =>
  fireEvent.change(editor(), { target: { value } });
function gateway(override: Transport = async () => undefined): Transport {
  return async (path, init) => {
    const result = await override(path, init);
    if (result !== undefined) return result;
    if (path === "/status")
      return { connected: true, scope: "profile-A", features: {} };
    if (path === "/workspace")
      return { theme: "light", chat_id: null, canvas: null, revision: 0 };
    if (path.startsWith("/conversations?"))
      return [
        { id: "A", title: "Conversa A" },
        { id: "B", title: "Conversa B" },
      ];
    if (path.startsWith("/conversations/"))
      return { id: path.split("/").at(-1), messages: [], title: "Aberta" };
    return [];
  };
}
const click = async (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

async function withControl(
  prompt: NonNullable<Run["pending_controls"]>[number],
) {
  const send = vi.fn();
  const transport = gateway(async (path, init) => {
    if (path === "/runs/run1/" + prompt.kind) {
      send(JSON.parse(String(init?.body)));
      return { status: "resolved" };
    }
    if (path === "/runs/run1")
      return {
        id: "run1",
        conversation_id: "A",
        status: "running",
        text: "",
        events: [],
        pending_controls: [prompt],
      };
    if (path === "/conversations/A")
      return { id: "A", title: "Conversa A", messages: [], active_run: "run1" };
  });
  render(<App transport={transport} />);
  await screen.findByRole("button", { name: "Conversa A" });
  await click("Conversa A");
  return send;
}

it("shows the gateway's redacted command alongside the description before approving once", async () => {
  const send = await withControl({
    kind: "approval",
    prompt_id: "approval-A",
    execution_generation: 7,
    description: "Verificar o serviço",
    command: "servico status --token [REDACTED]",
    choices: ["once", "deny"],
  });
  expect(screen.getByText("Verificar o serviço")).toBeTruthy();
  expect(
    screen.getByText("servico status --token [REDACTED]", { selector: "code" }),
  ).toBeTruthy();
  expect(send).not.toHaveBeenCalled();
  await click("Permitir uma vez");
  await click("Permitir uma vez");
  expect(send.mock.calls).toEqual([
    [{ request_id: "approval-A", execution_generation: 7, choice: "once" }],
  ]);
});

it("submits multi-select only on confirmation using the Hermes JSON string format", async () => {
  const send = await withControl({
    kind: "clarify",
    prompt_id: "clarify-B",
    execution_generation: 4,
    question: "Quais fontes devo consultar?",
    choices: ["Notas", "Ata, 2026"],
    multi_select: true,
  });
  expect(screen.getByText("Quais fontes devo consultar?")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Notas" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Ata, 2026" }));
  expect(send).not.toHaveBeenCalled();
  await click("Responder");
  expect(send.mock.calls).toEqual([
    [
      {
        request_id: "clarify-B",
        execution_generation: 4,
        answer: JSON.stringify(["Notas", "Ata, 2026"]),
      },
    ],
  ]);
});

it("keeps a free-form alternative to clarify choices", async () => {
  const send = await withControl({
    kind: "clarify",
    prompt_id: "clarify-C",
    execution_generation: 1,
    question: "Qual fonte?",
    choices: ["Notas"],
    multi_select: false,
  });
  fireEvent.click(screen.getByRole("radio", { name: "Notas" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Resposta ao Hermes" }),
    { target: { value: "Entrevistas" } },
  );
  expect(send).not.toHaveBeenCalled();
  await click("Responder");
  expect(send.mock.calls).toEqual([
    [
      {
        request_id: "clarify-C",
        execution_generation: 1,
        answer: "Entrevistas",
      },
    ],
  ]);
});

it("enables canvas examples only after the workspace has finished hydrating", async () => {
  let finish!: (value: unknown) => void;
  render(
    <App
      transport={gateway(async (path) => {
        if (path === "/workspace")
          return new Promise((resolve) => {
            finish = resolve;
          });
      })}
    />,
  );
  const example = screen.getByRole("button", {
    name: /Catálogo com seleção/,
  }) as HTMLButtonElement;
  expect(example.disabled).toBe(true);
  await act(async () => {});
  await act(async () => {
    finish({ theme: "light", chat_id: null, revision: 0, canvas: null });
  });
  expect(example.disabled).toBe(false);
  fireEvent.click(example);
  expect(
    screen.getByRole("heading", { name: "Sessão de cinema" }),
  ).toBeTruthy();
});

it("opens an already completed replay with its answer, warning and canvas revision", async () => {
  const canvas = { ...examples[0], title: "Canvas recuperado" };
  let attempts = 0;
  const transport = gateway(async (path) => {
    if (path === "/runs") {
      if (++attempts === 1) throw Error("confirmação perdida");
      return {
        id: "replay",
        status: "completed",
        conversation_id: "A",
        text: "Resposta final",
        events: [],
        warning: "Aviso do resultado",
        artifact: { id: canvas.id, revision: 4, canvas },
      };
    }
    if (path === "/conversations/A")
      return {
        id: "A",
        title: "Retomada",
        messages: [
          {
            id: "answer",
            role: "assistant",
            content: "Resposta final",
            created: "2026-01-01",
          },
        ],
      };
  });
  render(<App transport={transport} />);
  await screen.findByRole("button", { name: "Conversa A" });
  write("retomar");
  await click("Enviar mensagem");
  await click("Enviar mensagem");
  expect(screen.getByText("Resposta final")).toBeTruthy();
  expect(screen.getByText("Aviso do resultado")).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Canvas recuperado" }),
  ).toBeTruthy();
  expect(screen.getByText("v4")).toBeTruthy();
});

it("keeps the editor intact when adding a selection would exceed the Hermes input limit", async () => {
  const posts = vi.fn();
  const transport = gateway(async (path) => {
    if (path === "/workspace")
      return {
        theme: "light",
        chat_id: null,
        revision: 0,
        canvas: examples[3],
      };
    if (path === "/runs") posts();
  });
  render(<App transport={transport} />);
  await screen.findByRole("button", { name: "Conversa A" });
  write("x".repeat(12_000));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Selecionar Maré de Papel" }),
  );
  await click("Usar seleção no chat");
  const composed = editor().value;
  expect(composed.length).toBeGreaterThan(12_000);
  await click("Enviar mensagem");
  expect(screen.getByText(/excede o limite de 12.000 caracteres/)).toBeTruthy();
  expect(editor().value).toBe(composed);
  expect(posts).not.toHaveBeenCalled();
});

it.each(["mine", "theirs"])(
  "preserves concurrent canvas edits across a reload until the user chooses %s",
  async (choice) => {
    vi.useFakeTimers();
    let remote = {
      theme: "light",
      chat_id: null,
      revision: 0,
      canvas: examples[3],
      workspace_token: "token-A",
    };
    const writes: string[] = [];
    const transport = gateway(async (path, init) => {
      if (path !== "/workspace") return;
      if (init?.method === "PUT") {
        const { expected_workspace_token, ...body } = JSON.parse(
          String(init.body),
        );
        writes.push(expected_workspace_token);
        if (expected_workspace_token !== remote.workspace_token)
          throw Error("HTTP 409");
        remote = { ...body, workspace_token: "token-C" };
      }
      return remote;
    });
    const first = render(<App transport={transport} />);
    await act(async () => {});
    // A second tab modifies the shared canvas after this tab read it.
    remote = {
      ...remote,
      canvas: { ...examples[3], title: "Edição da outra aba" },
      workspace_token: "token-B",
    };
    const selected = () =>
      screen.getByRole("checkbox", {
        name: "Selecionar Maré de Papel",
      }) as HTMLInputElement;
    fireEvent.click(selected());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText(/Outra aba alterou o rascunho/)).toBeTruthy();
    expect(selected().checked).toBe(true);
    first.unmount();
    render(<App transport={transport} />);
    await act(async () => {});
    expect(selected().checked).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(writes).toEqual(["token-A"]);
    if (choice === "mine") {
      await click("Substituir pelo meu rascunho");
      expect(writes).toEqual(["token-A", "token-B"]);
      expect(remote.canvas.state?.screening.selected_ids).toEqual(["mare"]);
    } else {
      await click("Usar rascunho da outra aba");
      expect(selected().checked).toBe(false);
      expect(
        screen.getByRole("heading", { name: "Edição da outra aba" }),
      ).toBeTruthy();
      expect(writes).toEqual(["token-A"]);
    }
    expect(screen.queryByText(/Outra aba alterou o rascunho/)).toBeNull();
  },
);

it("isolates per-chat drafts across navigation and restores this tab's draft after reload", async () => {
  const transport = gateway();
  const first = render(<App transport={transport} />);
  await screen.findByRole("button", { name: "Conversa A" });
  await click("Conversa A");
  write("privado do chat A");
  await click("Conversa B");
  expect(editor().value).toBe("");
  write("rascunho do B");
  first.unmount();
  render(<App transport={transport} />);
  await screen.findByRole("button", { name: "Conversa A" });
  await click("Conversa B");
  expect(editor().value).toBe("rascunho do B");
  await click("Conversa A");
  expect(editor().value).toBe("privado do chat A");
});

async function attach() {
  const file = new File(["dados do arquivo"], "teste.txt", {
    type: "text/plain",
  });
  Object.defineProperty(file, "text", {
    value: async () => "dados do arquivo",
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Anexar arquivos"), {
      target: { files: [file] },
    });
  });
}
it("issues a new request identity when an attachment changes and keeps retries in the correct chat", async () => {
  const submitted: {
    request_id: string;
    conversation_id: string;
    attachments: unknown[];
  }[] = [];
  const transport = gateway(async (path, init) => {
    if (path === "/runs") {
      submitted.push(JSON.parse(String(init?.body)));
      throw Error("conexão interrompida");
    }
    return undefined;
  });
  render(<App transport={transport} />);
  await screen.findByRole("button", { name: "Conversa A" });
  await click("Conversa A");
  write("compare");
  await attach();
  await click("Enviar mensagem");
  await click("teste.txt");
  await click("Enviar mensagem");
  expect(submitted[0].request_id).not.toBe(submitted[1].request_id);
  expect(submitted[1].attachments).toEqual([]);
  await click("Conversa B");
  write("compare");
  await click("Enviar mensagem");
  expect(submitted.map((r) => r.conversation_id)).toEqual(["A", "A", "B"]);
});

it("includes selected attachments in submissions to the focused Desktop chat", async () => {
  const send = vi.fn(async () => {});
  render(
    <App transport={gateway()} nativeContext={{ sessionId: "demo", send }} />,
  );
  await screen.findByRole("button", { name: "Conversa A" });
  write("resuma o anexo");
  await attach();
  await click("Enviar à sessão ativa do Desktop");
  expect(send.mock.calls[0]).toEqual([
    expect.stringContaining("teste.txt\ndados do arquivo"),
  ]);
  expect(editor().value).toBe("");
  expect(screen.queryByRole("button", { name: "teste.txt" })).toBeNull();
});

it("queries the server for titles beyond the first page and ends pagination on the last match", async () => {
  const calls: string[] = [];
  const transport = gateway(async (path) => {
    if (!path.startsWith("/conversations?")) return undefined;
    const q = new URLSearchParams(path.split("?")[1]);
    calls.push(q.get("q") || "");
    return q.get("q")
      ? [{ id: "lagos", title: "Viagem a Lagos" }]
      : Array.from({ length: 51 }, (_, i) => ({
          id: String(i),
          title: "Projeto " + i,
        }));
  });
  render(<App transport={transport} />);
  await screen.findByRole("button", { name: "Carregar mais" });
  fireEvent.change(screen.getByRole("textbox", { name: "Buscar conversas" }), {
    target: { value: "lagos" },
  });
  await screen.findByRole("button", { name: "Viagem a Lagos" });
  expect(calls).toContain("lagos");
  expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
});
