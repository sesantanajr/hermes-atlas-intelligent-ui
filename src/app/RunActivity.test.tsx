// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { EventUpdates, RunActivityDetails } from "./RunActivity";
import type { RunActivity } from "../types";
import { conversationMessages } from "./replyDelivery";
afterEach(cleanup);
const partial: RunActivity = {
  limited: false,
  steps: [
    { kind: "tool", name: "terminal", status: "succeeded", duration: 0.9 },
    { kind: "tool", name: "execute_code", status: "failed", duration: 91 },
  ],
};
it("separates an individual failure from a delivered answer, discloses seconds and avoids guessing a cause", () => {
  const { container } = render(
    <RunActivityDetails activity={partial} status="completed" delivered />,
  );
  const summary = container.querySelector("summary")!;
  expect(summary.textContent).toContain("Resposta entregue");
  expect(summary.textContent).toContain("2 etapas");
  expect(summary.textContent).toContain("1 falha");
  fireEvent.click(summary);
  const items = within(
    screen.getByRole("list", { name: "Etapas registradas" }),
  ).getAllByRole("listitem");
  expect(items[0].textContent).toContain("TerminalConcluída0,9 s");
  expect(items[1].textContent).toContain("Execução de códigoFalhou1 min 31 s");
  expect(screen.queryByText(/tempo limite/i)).toBeNull();
});
it("maintains the turn's true failure state regardless of a successful tool, and displays only known reasons", () => {
  const { container, rerender } = render(
    <RunActivityDetails activity={partial} status="failed" delivered />,
  );
  expect(container.querySelector("summary")?.textContent).toContain(
    "Execução falhou",
  );
  const failed: RunActivity = {
    limited: false,
    steps: [
      {
        kind: "subagent",
        name: "Especialista 1",
        status: "failed",
        reason: "timeout",
        duration: 60,
      },
    ],
  };
  rerender(<RunActivityDetails activity={failed} status="cancelled" />);
  expect(container.querySelector("summary")?.textContent).toContain(
    "Execução cancelada",
  );
  fireEvent.click(container.querySelector("summary")!);
  expect(screen.getByText("Tempo limite atingido")).toBeTruthy();
  expect(screen.getByLabelText("Duração da etapa: 1 min")).toBeTruthy();
});
it("keeps missing closure and truncated histories explicit on terminal and unresolved runs", () => {
  const pending: RunActivity = {
    steps: [{ kind: "tool", name: "terminal", status: "running" }],
    limited: true,
  };
  const { container, rerender } = render(
    <RunActivityDetails activity={pending} status="running" />,
  );
  fireEvent.click(container.querySelector("summary")!);
  expect(screen.getByText("Em andamento")).toBeTruthy();
  expect(
    screen.getByText("O registro de etapas está incompleto."),
  ).toBeTruthy();
  rerender(
    <RunActivityDetails activity={pending} status="completed" delivered />,
  );
  expect(screen.queryByText("Em andamento")).toBeNull();
  expect(screen.getByText("Sem confirmação")).toBeTruthy();
  rerender(<RunActivityDetails activity={pending} status="unknown" />);
  expect(container.querySelector("summary")?.textContent).toContain(
    "Execução sem desfecho confirmado",
  );
});
it("shows confirmed success with the answer and retains technical details from a silent turn", () => {
  const success: RunActivity = {
    limited: false,
    steps: [{ kind: "tool", name: "atlas_render", status: "succeeded" }],
  };
  const { container } = render(
    <RunActivityDetails status="completed" activity={success} delivered />,
  );
  const summary = container.querySelector("summary")!;
  expect(summary.textContent).toContain("Resposta entregue");
  expect(summary.textContent).toContain("1 etapa");
  expect(summary.textContent).not.toContain("falha");
  const [row] = conversationMessages([
    {
      role: "assistant",
      id: "m",
      created: "now",
      content: "[SILENT]",
      status: "completed",
      delivery: "silent",
      activity: success,
    },
  ]);
  expect(row.content).toBe("");
  expect(row.activity).toBe(success);
});
it("renders lifecycle labels for legacy snapshots without leaking tool input, result or child summaries", () => {
  const events = [
    { type: "tool.started", tool: "terminal", preview: "private-command" },
    {
      type: "tool.completed",
      tool: "terminal",
      error: true,
      preview: "private-result",
    },
    {
      type: "subagent.complete",
      text: "private-child",
      preview: "private-preview",
    },
    { type: "message.interim", text: "Consultando o Hermes" },
  ];
  const { container, rerender } = render(
    <EventUpdates events={events} normalized={false} />,
  );
  fireEvent.click(container.querySelector("summary")!);
  expect(screen.getByText("Falha na ferramenta · terminal")).toBeTruthy();
  expect(screen.getByText("Especialista retornou")).toBeTruthy();
  expect(container.textContent).not.toMatch(/private-/);
  rerender(<EventUpdates events={events} normalized />);
  expect(container.textContent).toContain("Consultando o Hermes");
  expect(container.textContent).not.toContain("terminal");
});
