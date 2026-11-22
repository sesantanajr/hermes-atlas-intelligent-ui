// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BlockCatalog } from "./BlockCatalog";
import { Canvas } from "./Canvas";
import { catalog } from "./catalogData";
import { setLocale } from "../i18n";
import type { Block, Canvas as CanvasData, Interaction } from "../types";

beforeEach(() => setLocale("en"));
afterEach(() => {
  cleanup();
  setLocale("pt-BR");
});

function example<T extends Block["type"]>(type: T) {
  return catalog.find((entry) => entry.type === type)!.example as Extract<
    Block,
    { type: T }
  >;
}
function canvasOf(block: Block, state?: Interaction): CanvasData {
  return {
    schema_version: "1.0",
    id: "c",
    title: "T",
    description: "",
    blocks: [block],
    state: state && { [block.id]: state },
  };
}

describe("every catalogue example in English", () => {
  it.each(catalog.map((entry) => [entry.type, entry.example] as const))(
    "renders %s",
    (_type, block) => {
      expect(() =>
        render(<Canvas canvas={canvasOf(block)} onAction={vi.fn()} />),
      ).not.toThrow();
      expect(document.querySelector(".atlas-block")).toBeTruthy();
    },
  );
});

describe("blocks in English", () => {
  it("translates the table filter and the checklist progress", () => {
    const table = example("table");
    render(<Canvas canvas={canvasOf(table)} />);
    expect(screen.getByPlaceholderText("Filter rows...")).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Filter " + table.title }),
    ).toBeTruthy();
    cleanup();
    const checklist = example("checklist");
    render(<Canvas canvas={canvasOf(checklist, { checked: [0] })} />);
    expect(
      screen.getByText(`1 of ${checklist.items.length} completed`),
    ).toBeTruthy();
  });

  it("formats numbers and money for the language", () => {
    const blocks: Block[] = [
      {
        id: "sum",
        type: "calculator",
        title: "Custo",
        operation: "product",
        unit: "kg",
        inputs: [
          { label: "Peso", value: 1234.5, min: 0, max: 5000, step: 0.5 },
          { label: "Caixas", value: 3, min: 1, max: 10, step: 1 },
        ],
      },
      {
        id: "notebook",
        type: "product",
        title: "Caderno",
        description: "Preço ilustrativo.",
        currency: "USD",
        variants: [{ id: "a5", label: "A5", price_cents: 123450 }],
      },
      {
        id: "share",
        type: "pie",
        title: "Fatias",
        items: [
          { label: "A", value: 1 },
          { label: "B", value: 7 },
        ],
      },
    ];
    const canvas: CanvasData = { ...canvasOf(blocks[0]), blocks };
    const view = render(<Canvas canvas={canvas} />);
    expect(screen.getByText("Simulation result")).toBeTruthy();
    expect(screen.getByText("kg 3,703.5")).toBeTruthy();
    expect(screen.getByText("$1,234.50")).toBeTruthy();
    expect(screen.getByText("12.5%")).toBeTruthy();
    setLocale("pt-BR");
    view.rerender(<Canvas canvas={{ ...canvas }} />);
    expect(screen.getByText("Resultado da simulação")).toBeTruthy();
    expect(screen.getByText("kg 3.703,5")).toBeTruthy();
    expect(screen.getByText("12,5%")).toBeTruthy();
    expect(screen.queryByText("$1,234.50")).toBeNull();
  });

  it("translates labels kept in tables when they are rendered, and follows the language back", () => {
    const blocks: Block[] = [
      {
        id: "plan",
        type: "timeline",
        title: "Plano",
        items: [
          { id: "a", title: "Preparar", body: "Separar.", status: "done" },
          {
            id: "b",
            title: "Fotografar",
            body: "Percorrer.",
            when: "09h00",
            status: "current",
          },
        ],
      },
      {
        id: "note",
        type: "callout",
        title: "Aviso",
        tone: "warning",
        body: "Leve água.",
      },
    ];
    const canvas: CanvasData = { ...canvasOf(blocks[0]), blocks };
    const view = render(<Canvas canvas={canvas} />);
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("09h00 · In progress")).toBeTruthy();
    expect(screen.getByText("Warning")).toBeTruthy();
    setLocale("pt-BR");
    view.rerender(<Canvas canvas={{ ...canvas }} />);
    expect(screen.getByText("Concluída")).toBeTruthy();
    expect(screen.getByText("09h00 · Em andamento")).toBeTruthy();
    expect(screen.getByText("Atenção")).toBeTruthy();
    expect(screen.queryByText("Warning")).toBeNull();
  });

  it("drafts the message for the agent in English", () => {
    const onAction = vi.fn();
    const form: Block = {
      id: "trip",
      type: "form",
      title: "Viagem",
      fields: [
        { id: "city", label: "Cidade", kind: "text" },
        { id: "guide", label: "Com guia", kind: "checkbox" },
      ],
    };
    render(
      <Canvas
        canvas={canvasOf(form, { fields: { city: "Lisboa", guide: "true" } })}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send to Hermes" }));
    expect(onAction).toHaveBeenLastCalledWith(
      "Form “Viagem”:\nCidade: Lisboa\nCom guia: Yes",
    );
    cleanup();
    const collection = example("collection");
    const item = collection.items[0];
    render(
      <Canvas
        canvas={canvasOf(collection, { selected_ids: [item.id] })}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("1 of 4 selected");
    fireEvent.click(
      screen.getByRole("button", { name: "Use selection in chat" }),
    );
    expect(onAction).toHaveBeenLastCalledWith(
      `Analyse my selection in “${collection.title}”. Explain the strengths and limitations of this item.\n\n• ${item.title} [${item.id}]`,
    );
  });

  it("shows the block catalogue in English and filters by a translated category", () => {
    render(<BlockCatalog disabled={false} onAdd={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Block catalogue" }),
    ).toBeTruthy();
    expect(screen.getByText(`${catalog.length} blocks found`)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Data visualisation" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Block category" }), {
      target: { value: "Forms" },
    });
    const forms = catalog.filter((entry) => entry.category_en === "Forms");
    expect(screen.getByText(`${forms.length} blocks found`)).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Data visualisation" }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search blocks" }), {
      target: { value: "date range" },
    });
    expect(screen.getByText("1 block found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try Date range" }));
    expect(screen.getByRole("button", { name: "Add to canvas" })).toBeTruthy();
    expect(screen.getByLabelText("Start date")).toBeTruthy();
  });
});
