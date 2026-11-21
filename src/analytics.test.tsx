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
import { AnalyticsView, analyticsKinds } from "./analytics";
import type { AnalyticsBlock } from "./analytics";
import { analyticsSamples } from "./analyticsSamples";
import { dataFor, histogram, treemap, waterfall } from "./analyticsData";
import type { Interaction } from "./types";

afterEach(cleanup);
function Harness({
  block,
  initial = {},
  draft,
}: {
  block: AnalyticsBlock;
  initial?: Interaction;
  draft?: (text: string) => void;
}) {
  const [state, setState] = useState(initial);
  return (
    <AnalyticsView
      block={block}
      state={state}
      change={(patch) => setState((s) => ({ ...s, ...patch }))}
      onAction={draft}
    />
  );
}
const base = { id: "test", title: "Dados" };
it("provides a graphical view and an accessible values table for every sample", () => {
  expect(analyticsSamples.map((b) => b.type).sort()).toEqual(
    [...analyticsKinds].sort(),
  );
  for (const block of analyticsSamples) {
    render(<Harness block={block} />);
    expect(screen.getByRole("region", { name: block.title })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver valores" }));
    const table = screen.getByRole("table", { name: block.title });
    expect(within(table).getAllByRole("row").length).toBe(
      dataFor(block).rows.length + 1,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver gráfico" }));
    cleanup();
  }
});
it("filters all dashboard panels and drafts only the selected period", () => {
  const block = analyticsSamples.find((b) => b.type === "dashboard")!,
    draft = vi.fn();
  render(<Harness block={block} draft={draft} />);
  expect(screen.getByText("210")).toBeTruthy();
  expect(screen.getByText("240 empréstimos")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Período" }), {
    target: { value: "fev" },
  });
  expect(screen.getByText("245")).toBeTruthy();
  expect(screen.getByText("250 empréstimos")).toBeTruthy();
  expect(screen.queryByText("210")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ver valores" }));
  expect((screen.getByLabelText("Período") as HTMLSelectElement).value).toBe(
    "fev",
  );
  expect(draft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Analisar na conversa" }));
  expect(draft.mock.calls[0][0]).toContain("Fevereiro");
  expect(draft.mock.calls[0][0]).toContain("250 empréstimos");
  expect(draft.mock.calls[0][0]).not.toContain("240 empréstimos");
});
it("keeps bubble area proportional to size and can pass a focused coordinate into chat", () => {
  const draft = vi.fn();
  const block: AnalyticsBlock = {
    ...base,
    type: "bubble",
    x_label: "x",
    y_label: "y",
    points: [
      { label: "Centro", x: -2, y: -2, size: 1 },
      { label: "Sul", x: 4, y: 3, size: 4 },
      { label: "Norte", x: 0, y: 0, size: 0 },
    ],
  };
  const { container } = render(<Harness block={block} draft={draft} />);
  const radii = [...container.querySelectorAll("svg[role=img] circle")]
    .map((c) => Number(c.getAttribute("r")))
    .sort((a, b) => a - b);
  expect(radii[0]).toBe(0);
  expect(radii[2] ** 2 / radii[1] ** 2).toBeCloseTo(4);
  fireEvent.change(screen.getByRole("combobox", { name: "Destaque" }), {
    target: { value: "Sul" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Analisar na conversa" }));
  expect(draft.mock.calls[0][0]).toContain("Sul");
  expect(draft.mock.calls[0][0]).not.toContain("Centro");
});
it("renders an inner total on a donut, a full disk on a single-slice pie, and handles total zero", () => {
  const items = [{ label: "A", value: 10 }];
  const { container, rerender } = render(
    <Harness block={{ ...base, type: "donut", items }} />,
  );
  expect(within(screen.getByRole("img")).getByText("Total")).toBeTruthy();
  rerender(<Harness block={{ ...base, type: "pie", items }} />);
  expect(container.querySelectorAll("svg[role=img] circle")).toHaveLength(1);
  expect(container.querySelectorAll("svg[role=img] text")).toHaveLength(0);
  rerender(
    <Harness
      block={{ ...base, type: "pie", items: [{ label: "A", value: 0 }] }}
    />,
  );
  expect(screen.getByText(/Total zero/)).toBeTruthy();
});
it("retains missing samples in details, groups boundary values correctly and covers flat sets", () => {
  expect(histogram([-2, -1, 0, 1, 2, null], 2).map((b) => b.count)).toEqual([
    2, 3,
  ]);
  expect(histogram([null, 4, 4], 8)).toEqual([
    { low: 4, high: 4, count: 2, inclusive: true },
  ]);
  expect(histogram([null], 4)).toEqual([]);
  const b: AnalyticsBlock = {
    ...base,
    type: "sparkline",
    points: [
      { label: "A", value: 1 },
      { label: "B", value: null },
      { label: "C", value: -1 },
    ],
  };
  const { container } = render(<Harness block={b} />);
  expect(container.querySelectorAll("polyline")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Ver valores" }));
  expect(screen.getByText("Sem dado")).toBeTruthy();
});
it("allocates exact treemap areas and preserves waterfall balances across zero", () => {
  const tiles = treemap(
    [
      { label: "A", value: 3 },
      { label: "B", value: 1 },
      { label: "C", value: 0 },
    ],
    100,
    40,
  );
  expect(tiles.map((t) => t.w * t.h)).toEqual([3000, 1000]);
  const steps = waterfall(-2, [
    { label: "Entrada", value: 8 },
    { label: "Saída", value: -10 },
  ]);
  expect(steps.map((s) => [s.from, s.to])).toEqual([
    [0, -2],
    [-2, 6],
    [6, -4],
    [0, -4],
  ]);
});
it("uses competition ranks for ties and avoids undefined funnel rates", () => {
  const ranks = dataFor({
    ...base,
    type: "ranking",
    items: [
      { label: "A", value: -1 },
      { label: "B", value: 4 },
      { label: "C", value: 4 },
    ],
  });
  expect(ranks.rows.map((r) => r[0])).toEqual(["1", "1", "3"]);
  const funnel = dataFor({
    ...base,
    type: "funnel",
    items: [
      { label: "A", value: 0 },
      { label: "B", value: 0 },
    ],
  });
  expect(funnel.rows.map((r) => r[2])).toEqual(["—", "—"]);
});
