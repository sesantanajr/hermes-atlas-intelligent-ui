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
import { ExploreView } from "./explore";
import type { ExploreBlock, ExploreInteraction } from "./exploreTypes";

afterEach(cleanup);

const plan = {
  id: "plan",
  title: "Lançamento",
  items: [
    {
      id: "design",
      title: "Desenho",
      body: "Ouvir a equipe.",
      when: "Outubro",
      status: "done" as const,
    },
    {
      id: "pilot",
      title: "Piloto",
      body: "Avaliar o primeiro grupo.",
      when: "Novembro",
      status: "current" as const,
      points: ["Recolher comentários"],
    },
    {
      id: "rollout",
      title: "Expansão",
      body: "Ampliar o alcance.",
      status: "upcoming" as const,
    },
  ],
};

it("selects the reported current step and opens a follow-up draft only after an explicit action", () => {
  const onAction = vi.fn();
  function Plan() {
    const [state, setState] = useState<ExploreInteraction>({});
    return (
      <ExploreView
        block={{ ...plan, type: "timeline" }}
        state={state}
        change={setState}
        onAction={onAction}
      />
    );
  }
  render(<Plan />);
  const current = screen.getByRole("tab", { name: /Piloto/ });
  expect(current.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe(
    "vertical",
  );
  expect(
    within(screen.getByRole("tabpanel")).getByText("Recolher comentários"),
  ).toBeTruthy();
  fireEvent.keyDown(current, { key: "ArrowDown" });
  const upcoming = screen.getByRole("tab", { name: /Expansão/ });
  expect(document.activeElement).toBe(upcoming);
  expect(upcoming.getAttribute("aria-selected")).toBe("true");
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Explorar etapa no chat" }),
  );
  expect(onAction.mock.calls[0][0]).toContain("Expansão");
  expect(onAction.mock.calls[0][0]).toContain("Ampliar o alcance.");
  expect(onAction.mock.calls[0][0]).not.toContain("primeiro grupo");
});

it("restores a tab by id after reordering and supports horizontal, Home and End keys", () => {
  const block: ExploreBlock = {
    type: "tabs",
    id: "board",
    title: "Seções",
    items: [
      { id: "intro", title: "Visão geral", body: "Primeira seção." },
      { id: "notes", title: "Notas", body: "Segunda seção." },
      { id: "risks", title: "Riscos", body: "Última seção." },
    ],
  };
  function Page({ data, initial }: { data: ExploreBlock; initial: string }) {
    const [state, setState] = useState({ active_item: initial });
    return (
      <ExploreView
        block={data}
        state={state}
        change={(patch) => setState({ active_item: patch.active_item! })}
      />
    );
  }
  const { rerender } = render(<Page data={block} initial="notes" />);
  const notes = screen.getByRole("tab", { name: "Notas" });
  expect(notes.getAttribute("tabindex")).toBe("0");
  const panel = screen.getByRole("tabpanel", { name: "Notas" });
  expect(document.getElementById(notes.getAttribute("aria-controls")!)).toBe(
    panel,
  );
  rerender(
    <Page
      data={{
        ...block,
        items: [block.items[1], block.items[2], block.items[0]],
      }}
      initial="notes"
    />,
  );
  expect(screen.getByRole("tabpanel").textContent).toContain("Segunda seção.");
  fireEvent.keyDown(notes, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Riscos" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Visão geral" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  expect(document.activeElement).toBe(notes);
  expect(screen.queryByRole("button", { name: /no chat/ })).toBeNull();
});
