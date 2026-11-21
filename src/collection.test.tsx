// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Canvas } from "./Canvas";
import { examples } from "./examples";
import type { Canvas as CanvasData } from "./types";

afterEach(cleanup);

it("compares stable item ids after sorting and prepares a draft containing only the selection", () => {
  const onAction = vi.fn();
  function Harness() {
    const [canvas, setCanvas] = useState(
      examples.find((item) => item.id === "demo-screening")!,
    );
    return <Canvas canvas={canvas} onChange={setCanvas} onAction={onAction} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByLabelText("Selecionar Maré de Papel"));
  fireEvent.change(screen.getByRole("combobox", { name: "Ordenar" }), {
    target: { value: "score" },
  });
  expect(
    within(screen.getAllByRole("article")[0]).getByRole("heading").textContent,
  ).toBe("Última Órbita");
  expect(
    (screen.getByLabelText("Selecionar Maré de Papel") as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(screen.getByLabelText("Selecionar Última Órbita"));
  fireEvent.click(
    screen.getByRole("button", { name: "Comparar selecionados" }),
  );
  const table = screen.getByRole("table", {
    name: "Comparação dos itens selecionados",
  });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual(["Critério", "Maré de Papel", "Última Órbita"]);
  expect(within(table).getByRole("cell", { name: "114 min" })).toBeTruthy();
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Usar seleção no chat" }));
  expect(onAction.mock.calls[0][0]).toContain("Maré de Papel [mare]");
  expect(onAction.mock.calls[0][0]).not.toContain("Mapa da Chuva");
});

it("does not request images on load or carry permission to another image after updating the canvas", () => {
  const make = (url: string): CanvasData => ({
    schema_version: "1.0",
    id: "sample",
    title: "Coleção",
    description: "",
    blocks: [
      {
        type: "collection",
        id: "set",
        title: "Opções",
        items: [{ id: "one", title: "Item", image_url: url }],
      },
    ],
  });
  const { container, rerender } = render(
    <Canvas canvas={make("https://example.org/poster.jpg")} />,
  );
  expect(container.querySelector("img")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Carregar imagem de Item em example.org",
    }),
  );
  expect(container.querySelector("img")?.getAttribute("referrerpolicy")).toBe(
    "no-referrer",
  );
  rerender(<Canvas canvas={make("https://example.net/other.jpg")} />);
  expect(container.querySelector("img")).toBeNull();
});
