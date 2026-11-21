// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BlockCatalog } from "./BlockCatalog";
import { Canvas } from "./Canvas";
import { catalog, categories } from "./catalogData";
import packagedCatalog from "../atlas/catalog.json";

afterEach(cleanup);

it("exposes 73 distinct renderable block types in eight nonempty categories", () => {
  expect(new Set(catalog.map((entry) => entry.type)).size).toBe(73);
  expect(catalog).toHaveLength(73);
  expect(catalog).toEqual(packagedCatalog);
  expect(new Set(catalog.map((entry) => entry.category))).toEqual(
    new Set(categories),
  );
  expect(categories).toHaveLength(8);
  for (const entry of catalog) {
    const block = entry.example;
    expect(block.type).toBe(entry.type);
    const app = render(
      <Canvas
        canvas={{
          id: "example",
          title: entry.label,
          description: "",
          schema_version: "1.0",
          blocks: [block],
        }}
      />,
    );
    const section = app.container.querySelector(".atlas-block");
    expect(section, block.type).toBeTruthy();
    // The shared title alone would also render if the discriminator had no view.
    if (block.type === "heading") {
      expect(screen.getByRole("heading", { name: block.title })).toBeTruthy();
    } else {
      expect(
        [...section!.children].some((child) => child.tagName !== "H3"),
        block.type,
      ).toBe(true);
    }
    app.unmount();
  }
});

it("searches without accents, intersects category filters and recovers from empty results", () => {
  render(<BlockCatalog disabled={false} onAdd={vi.fn()} />);
  const input = screen.getByRole("searchbox", { name: "Pesquisar blocos" });
  fireEvent.change(input, { target: { value: "avaliacao" } });
  expect(
    screen.getByRole("button", { name: "Experimentar Avaliação por estrelas" }),
  ).toBeTruthy();
  fireEvent.change(
    screen.getByRole("combobox", { name: "Categoria de blocos" }),
    { target: { value: "Formulários" } },
  );
  expect(screen.getByText("0 blocos encontrados")).toBeTruthy();
  fireEvent.change(input, { target: { value: "date_range" } });
  expect(
    screen.getByRole("button", { name: "Experimentar Intervalo de datas" }),
  ).toBeTruthy();
});

it("allows preview interaction while addition is locked and only inserts on explicit request", () => {
  const onAdd = vi.fn();
  const app = render(<BlockCatalog disabled onAdd={onAdd} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Experimentar Avaliação por estrelas" }),
  );
  const star = screen.getByRole<HTMLInputElement>("radio", { name: "4 de 5" });
  fireEvent.click(star);
  expect(star.checked).toBe(true);
  const add = screen.getByRole<HTMLButtonElement>("button", {
    name: "Adicionar ao canvas",
  });
  expect(add.disabled).toBe(true);
  fireEvent.click(add);
  expect(onAdd).not.toHaveBeenCalled();
  app.rerender(<BlockCatalog disabled={false} onAdd={onAdd} />);
  fireEvent.click(add);
  expect(onAdd).toHaveBeenCalledExactlyOnceWith(
    catalog.find((entry) => entry.type === "rating")!.example,
    { values: { value: "4" } },
  );
});
