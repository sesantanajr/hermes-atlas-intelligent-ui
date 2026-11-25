// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ganttFrame, isPlanningBlock, neighbour, PlanningView, treeChildren, eventDays } from "./planning";
import type { PlanningBlock } from "./planning";
import { planningSamples } from "./planningSamples";
import type { Interaction } from "../types";

afterEach(cleanup);

function mount(type: PlanningBlock["type"], initial: Interaction = {}) {
  const block = planningSamples.find((sample) => sample.type === type)!;
  const action = vi.fn();
  const states: Interaction[] = [];
  function Host() {
    const [state, update] = useState(initial);
    return (
      <PlanningView
        block={block}
        state={state}
        onAction={action}
        change={(patch) => {
          const next = { ...state, ...patch };
          states.push(next);
          update(next);
        }}
      />
    );
  }
  render(<Host />);
  return { block, action, last: () => states.at(-1) ?? {} };
}

it("has a sample and a renderer for each planning block", () => {
  expect(planningSamples.map((b) => b.type)).toEqual(["gantt", "calendar", "matrix", "tree"]);
  for (const block of planningSamples) expect(isPlanningBlock(block)).toBe(true);
  expect(isPlanningBlock({ type: "table" })).toBe(false);
});

it("lays tasks on a time axis, switches scale and opens a task", () => {
  const { last, action } = mount("gantt");
  const frame = ganttFrame(planningSamples[0].type === "gantt" ? planningSamples[0].tasks : []);
  expect(frame.scale).toBe("week");
  expect(screen.getByText("1 de 5 concluídas")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Dias" }));
  expect(last().values).toEqual({ scale: "day" });
  fireEvent.click(screen.getByRole("button", { name: /Piloto com 10 usuários:/ }));
  expect(last().values).toEqual({ scale: "day", task: "piloto" });
  expect(screen.getByText(/Depende de: Licenças e grupos/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Discutir no chat/ }));
  expect(action).toHaveBeenCalledWith(expect.stringContaining("Piloto com 10 usuários"));
});

it("shows the month, moves between months and opens an event", () => {
  const { last } = mount("calendar");
  expect(screen.getByText("4 eventos neste mês")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
  expect(last().values).toEqual({ month: "2027-01" });
  expect(screen.getByText("0 eventos neste mês")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
  fireEvent.click(screen.getAllByRole("button", { name: /Simulado AZ-104/ })[0]);
  expect(last().values).toEqual({ month: "2026-12", event: "simulado" });
  expect(screen.getByText("Duas horas, 50 questões.")).toBeTruthy();
  expect(eventDays({ id: "x", label: "x", date: "2026-12-30", end: "2027-01-02" })).toEqual([
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
});

it("moves matrix cards with the keyboard and keeps only the moves in the state", () => {
  const { last, action } = mount("matrix");
  const card = screen.getByText("Corrigir o backup").closest("[role=button]")!;
  fireEvent.keyDown(card, { key: "ArrowRight" });
  expect(last().values).toEqual({ backup: "agendar" });
  const agendar = screen.getByRole("region", { name: /Agendar: 2 itens/ });
  expect(within(agendar).getByText("Corrigir o backup")).toBeTruthy();
  fireEvent.keyDown(within(agendar).getByText("Corrigir o backup").closest("[role=button]")!, { key: "ArrowLeft" });
  expect(last().values).toEqual({});
  fireEvent.click(screen.getByRole("button", { name: /Analisar a matriz no chat/ }));
  expect(action.mock.calls[0][0]).toContain("Fazer agora: Corrigir o backup");
  expect([0, 1, 2, 3].map((i) => neighbour(i, "ArrowDown"))).toEqual([2, 3, 2, 3]);
  expect([0, 1, 2, 3].map((i) => neighbour(i, "ArrowLeft"))).toEqual([0, 0, 2, 2]);
});

it("folds and unfolds tree branches", () => {
  const { last } = mount("tree");
  expect(screen.getByRole("tree", { name: "Estrutura do projeto" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Recolher Interface" }));
  expect(last().values).toEqual({ front: "closed" });
  expect(screen.queryByText("Telas")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Recolher tudo/ }));
  expect(Object.keys(last().values ?? {}).sort()).toEqual(["api", "front", "ops", "projeto"]);
  fireEvent.click(screen.getByRole("button", { name: /Expandir tudo/ }));
  expect(last().values).toEqual({});
  const children = treeChildren(planningSamples[3].type === "tree" ? planningSamples[3].nodes : []);
  expect(children.get(null)?.map((n) => n.id)).toEqual(["projeto"]);
});
