// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Canvas, moveBlock } from "./Canvas";
import type { Canvas as CanvasData } from "../types";

afterEach(cleanup);

const CANVAS: CanvasData = {
  schema_version: "1.0",
  id: "c",
  title: "Plano",
  description: "",
  blocks: [
    { type: "metric", id: "m", title: "Custo", value: "R$ 10" },
    { type: "checklist", id: "l", title: "Lista", items: ["A", "B"] },
    {
      type: "table",
      id: "t",
      title: "Tabela",
      columns: ["Item", "Valor"],
      rows: [
        ["A", "10,00"],
        ["B", "5,50"],
      ],
    },
  ],
};

function mount(onAction = vi.fn()) {
  const seen: CanvasData[] = [];
  function Host() {
    const [canvas, setCanvas] = useState(CANVAS);
    return (
      <Canvas
        canvas={canvas}
        onAction={onAction}
        onChange={(next) => {
          seen.push(next);
          setCanvas(next);
        }}
      />
    );
  }
  render(<Host />);
  return { last: () => seen.at(-1)!, onAction };
}

const titles = () => [...document.querySelectorAll(".atlas-block")].map((node) => node.getAttribute("data-block-id"));

it("moves blocks from the menu and from the keyboard handle", () => {
  const { last } = mount();
  const tools = screen.getByRole("toolbar", { name: "Ações do bloco Lista" });
  fireEvent.click(within(tools).getByRole("button", { name: "Mais ações" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Mover para baixo/ }));
  expect(last().blocks.map((b) => b.id)).toEqual(["m", "t", "l"]);
  expect(titles()).toEqual(["m", "t", "l"]);
  fireEvent.keyDown(screen.getByRole("button", { name: /Mover bloco Custo/ }), { key: "ArrowDown" });
  expect(titles()).toEqual(["t", "m", "l"]);
  expect(document.querySelector(".canvas-live")?.textContent).toContain("posição 2 de 3");
  expect(moveBlock([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
  expect(moveBlock([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
});

it("keeps width and folding in the block state", () => {
  const { last } = mount();
  const tools = screen.getByRole("toolbar", { name: "Ações do bloco Lista" });
  fireEvent.click(within(tools).getByRole("button", { name: "Usar meia largura" }));
  expect(last().state?.l).toEqual({ width: "half" });
  expect(document.querySelector('[data-block-id="l"]')?.classList.contains("w-half")).toBe(true);
  fireEvent.click(within(tools).getByRole("button", { name: "Recolher bloco" }));
  expect(last().state?.l).toEqual({ width: "half", collapsed: true });
  expect(screen.getByText("Bloco recolhido. Expanda para ver o conteúdo.")).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: "A" })).toBeNull();
  // A metric is half width by default; its control offers full width.
  expect(
    within(screen.getByRole("toolbar", { name: "Ações do bloco Custo" })).getByRole("button", {
      name: "Usar largura total",
    }),
  ).toBeTruthy();
});

it("edits a table cell in place, totals it and can restore the original", () => {
  const { last } = mount();
  const cell = screen.getByText("5,50");
  fireEvent.doubleClick(cell);
  const input = screen.getByRole("textbox", { name: "Editar Valor" });
  fireEvent.change(input, { target: { value: "7,50" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(last().state?.t?.cells).toEqual({ "1:1": "7,50" });
  expect(screen.getByText("7,50").closest("td")?.classList.contains("edited")).toBe(true);
  expect(screen.getByText("Soma").parentElement?.textContent).toContain("17,5");
  fireEvent.click(screen.getByRole("button", { name: /Restaurar original \(1\)/ }));
  expect(last().state?.t?.cells).toEqual({});
});

it("asks the agent about a block and offers its data as CSV", () => {
  const { onAction } = mount();
  const tools = screen.getByRole("toolbar", { name: "Ações do bloco Tabela" });
  fireEvent.click(within(tools).getByRole("button", { name: "Mais ações" }));
  expect(screen.getByRole("menuitem", { name: /Baixar dados \(CSV\)/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: /Perguntar ao Atlas sobre este bloco/ }));
  expect(onAction).toHaveBeenCalledWith("Sobre o bloco “Tabela” do canvas “Plano”: ");
});

it("draws no controls on a read-only canvas", () => {
  render(<Canvas canvas={CANVAS} />);
  expect(screen.queryByRole("toolbar")).toBeNull();
});
