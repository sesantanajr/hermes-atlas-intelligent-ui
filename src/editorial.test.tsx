// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditorialView, type EditorialBlock } from "./editorial";
import { editorialSamples } from "./editorialSamples";
import { PreviewContext } from "./CanvasLink";
import type { Interaction } from "./types";

afterEach(cleanup);
function demo(type: EditorialBlock["type"]) {
  const block = editorialSamples.find((b) => b.type === type)!;
  expect(block).toBeDefined();
  return block;
}
function mount(block: EditorialBlock, initial: Interaction = {}) {
  const save = vi.fn(),
    action = vi.fn();
  function View() {
    const [state, setState] = useState(initial);
    return (
      <EditorialView
        block={block}
        state={state}
        change={(patch) => {
          const next = { ...state, ...patch };
          save(next);
          setState(next);
        }}
        onAction={action}
      />
    );
  }
  return { ...render(<View />), save, action };
}

const tags: Record<EditorialBlock["type"], string> = {
  heading: "h2",
  callout: "aside",
  quote: "blockquote",
  glossary: "input[type=search]",
  code: "pre code",
  markdown: "strong",
  equation: "math mfrac",
  badges: "ul li",
  facts: "dl dt",
  article: "article nav",
  accordion: "button[aria-expanded]",
  cards: "section button",
  columns: "section + section",
  carousel: "[aria-roledescription] select",
  steps_list: "progress",
  bibliography: "ol cite a",
  entity: "article dl",
  document: "textarea",
};
it.each(editorialSamples)("renders the native structure of $type", (block) => {
  expect(mount(block).container.querySelector(tags[block.type])).toBeTruthy();
});

it("filters across glossary definitions, including accent-insensitive matches", () => {
  const { save } = mount(demo("glossary"), { values: { query: "arvores" } });
  expect(screen.getByText("Dossel")).toBeTruthy();
  expect(screen.queryByText("Transecto")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "nenhum" },
  });
  expect(save).toHaveBeenLastCalledWith({ values: { query: "nenhum" } });
  expect(screen.getByRole("status").textContent).toContain("Nenhum termo");
});

it("navigates the carousel by stable slide ID and restores the saved slide", () => {
  const first = mount(demo("carousel"));
  fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
  expect(first.save).toHaveBeenLastCalledWith({ values: { slide: "centro" } });
  first.unmount();
  mount(demo("carousel"), { values: { slide: "centro" } });
  expect(
    screen.getByRole("heading", { name: "Clareira central" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "lago" } });
  expect(
    (screen.getByRole("button", { name: "Próximo" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("tracks each heading independently in the accordion", () => {
  const { save } = mount(demo("accordion"), { values: { chuva: "1" } });
  fireEvent.click(screen.getByRole("button", { name: /Quando repetir/ }));
  expect(save).toHaveBeenLastCalledWith({
    values: { chuva: "1", repetir: "1" },
  });
  fireEvent.click(screen.getByRole("button", { name: /E se chover/ }));
  expect(save).toHaveBeenLastCalledWith({ values: { repetir: "1" } });
});

it("updates step completion and progress by stable key", () => {
  const { save } = mount(demo("steps_list"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Marcar o local" }));
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("1");
  expect(save).toHaveBeenCalledWith({ values: { localizar: "1" } });
});

it("focuses the chosen article section and numbers code without changing the source", () => {
  const article = mount(demo("article"));
  fireEvent.click(screen.getByRole("button", { name: "Circulação" }));
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: "Circulação" }),
  );
  article.unmount();
  const snippet = mount(demo("code"));
  fireEvent.click(screen.getByRole("button", { name: "Numerar linhas" }));
  expect(snippet.container.querySelectorAll(".ae-line-number")).toHaveLength(2);
  expect(snippet.save).toHaveBeenCalledWith({ values: { numbers: "1" } });
});

it("edits a document, preserves an empty draft and prepares the current text on demand", () => {
  const { save, action } = mount(demo("document"), { values: { draft: "" } });
  const editor = screen.getByRole("textbox", {
    name: "Editar documento",
  }) as HTMLTextAreaElement;
  expect(editor.value).toBe("");
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(editor, { target: { value: "Minha anotação." } });
  expect(save).toHaveBeenLastCalledWith({
    values: { draft: "Minha anotação." },
  });
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button"));
  expect(action).toHaveBeenCalledWith("Relato de campo\n\nMinha anotação.");
});

it("uses the card's chosen follow-up and keeps preview references inert", () => {
  const cards = mount(demo("cards"));
  fireEvent.click(
    screen.getByRole("button", { name: "Explorar Aves urbanas" }),
  );
  expect(cards.action).toHaveBeenCalledWith(
    "Monte um roteiro curto de escuta de aves para a praça.",
  );
  cards.unmount();
  render(
    <PreviewContext.Provider value={true}>
      <EditorialView block={demo("bibliography")} state={{}} change={vi.fn()} />
    </PreviewContext.Provider>,
  );
  expect(screen.queryByRole("link")).toBeNull();
});

it("renders GFM and accessible image labels without loading embedded media or raw HTML", () => {
  const block: EditorialBlock = {
    id: "md",
    title: "Conteúdo",
    type: "markdown",
    body: "| A | B |\n| - | - |\n| 1 | 2 |\n\n![Legenda](https://example.com/i.jpg) <iframe src='https://example.com'></iframe>\n\n[Site](https://example.com) [arquivo](file:///file)",
  };
  const { container } = mount(block);
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByText("Legenda")).toBeTruthy();
  expect(container.querySelector("img,iframe")).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(1);
});
