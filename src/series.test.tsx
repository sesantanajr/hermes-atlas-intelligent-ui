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
import type { Canvas as CanvasData } from "./types";
import type { SeriesBlock } from "./seriesTypes";

afterEach(cleanup);

const sample: SeriesBlock = {
  type: "series",
  id: "trend",
  title: "Saldo",
  unit: "kg",
  kind: "area",
  x_axis: "date",
  labels: ["2026-01-01", "2026-01-03", "2026-02-01", "2026-02-04"],
  datasets: [
    { id: "p", label: "Plano", values: [1, 5, -4, 8] },
    { id: "r", label: "Real", values: [0, null, -1, 16] },
  ],
};
function canvas(block = sample): CanvasData {
  return {
    schema_version: "1.0",
    id: "analysis",
    title: "Análise",
    description: "",
    blocks: [block],
  };
}

it("plots dates by distance, keeps data gaps and draws bars on both sides of zero", () => {
  const view = render(<Canvas canvas={canvas()} />);
  const points = Array.from(
    view.container.querySelectorAll('[data-series-id="p"] circle'),
    (p) => Number(p.getAttribute("cx")),
  );
  expect((points[1] - points[0]) / (points[2] - points[1])).toBeCloseTo(2 / 29);
  const real = view.container.querySelector('[data-series-id="r"]')!;
  expect(real.querySelectorAll('path[fill="none"]')).toHaveLength(2);
  expect(real.querySelectorAll("path[opacity]")).toHaveLength(1);
  view.rerender(<Canvas canvas={canvas({ ...sample, kind: "bar" })} />);
  const bars = view.container.querySelectorAll('[data-series-id="p"] rect');
  const zero = Number(
    view.container.querySelector(".series-baseline line")?.getAttribute("y1"),
  );
  expect(Number(bars[0].getAttribute("y"))).toBeLessThan(zero);
  expect(Number(bars[2].getAttribute("y"))).toBe(zero);
  expect(Number(bars[2].getAttribute("height"))).toBeGreaterThan(0);
});

it("preserves the visible series and table on reload, with a draft limited to the selection", () => {
  const draft = vi.fn();
  let stored = canvas();
  function Workspace() {
    const [doc, setDoc] = useState(() => structuredClone(stored));
    return (
      <Canvas
        canvas={doc}
        onAction={draft}
        onChange={(next) => {
          stored = next;
          setDoc(next);
        }}
      />
    );
  }
  const view = render(<Workspace />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Plano" }));
  fireEvent.click(screen.getByRole("button", { name: "Tabela" }));
  view.unmount();
  render(<Workspace />);
  const table = screen.getByRole("table", { name: "Saldo (kg)" });
  expect(
    within(table).getByRole("columnheader", { name: "Real" }),
  ).toBeTruthy();
  expect(
    within(table).queryByRole("columnheader", { name: "Plano" }),
  ).toBeNull();
  expect(within(table).getByRole("cell", { name: "Sem dado" })).toBeTruthy();
  expect(within(table).getByRole("cell", { name: "-1" })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Analisar séries no chat" }),
  );
  expect(draft).toHaveBeenCalledTimes(1);
  expect(draft.mock.calls[0][0]).toContain("Real [r]");
  expect(draft.mock.calls[0][0]).not.toContain("Plano");
  fireEvent.click(screen.getByRole("checkbox", { name: "Real" }));
  expect(
    screen.getByText("Selecione uma série para visualizar os dados."),
  ).toBeTruthy();
});
