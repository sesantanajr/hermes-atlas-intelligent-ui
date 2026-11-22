// @vitest-environment jsdom
import React, { useState } from "react";
import { expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Canvas } from "./Canvas";
import { LiveCanvasPreview } from "./LiveCanvasPreview";
import type { Canvas as Data } from "../types";
import { projectStops } from "./spatial";
import { studioExamples } from "./studioExamples";
afterEach(cleanup);

it("shows the route during streaming without activating the external map", () => {
  render(<LiveCanvasPreview canvas={studioExamples[1]} />);
  expect(screen.getByText("Ver no mapa")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
});

it("omits unavailable choices and invalid dates from restored form drafts", () => {
  const draft = vi.fn(),
    original = studioExamples[1];
  render(
    <Document
      initial={{
        ...original,
        state: { report: { fields: { day: "2026-02-31", light: "removed" } } },
      }}
      action={draft}
    />,
  );
  expect(
    (screen.getByLabelText("Data da saída") as HTMLInputElement).value,
  ).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Preparar relato" }));
  expect(draft.mock.calls[0][0]).not.toMatch(/2026-02-31|removed/);
});

function Document({
  initial,
  action,
}: {
  initial: Data;
  action: (s: string) => void;
}) {
  const [canvas, change] = useState(initial);
  return <Canvas canvas={canvas} onChange={change} onAction={action} />;
}
it("requires an explicit image request for each remote URL and keeps the diagram accessible", () => {
  const part = { id: "p", x: 20, y: 30, title: "Lente", body: "Detalhes" };
  const diagram = {
    id: "d",
    type: "diagram" as const,
    title: "Figura",
    alt: "Câmera ilustrada",
    items: [part],
  };
  const canvas = (url: string): Data => ({
    schema_version: "1.0",
    id: "c",
    title: "Demo",
    description: "",
    blocks: [{ ...diagram, image_url: url }],
  });
  const tree = render(
    <Canvas canvas={canvas("https://example.org/one.jpg")} />,
  );
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Carregar imagem/ }));
  expect(screen.getByRole("img").getAttribute("referrerpolicy")).toBe(
    "no-referrer",
  );
  tree.rerender(<Canvas canvas={canvas("https://example.net/two.jpg")} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByRole("button", { name: "1. Lente" })).toBeTruthy();
});
it("keeps the itinerary usable for coincident stops and crosses the date line by the short route", () => {
  const stop = (lon: number) => ({
    id: "a",
    title: "X",
    body: "Y",
    lat: 0,
    lon,
  });
  const points = projectStops([stop(178), stop(179), stop(-179)]);
  expect(points[1].x - points[0].x).toBeCloseTo(
    (points[2].x - points[1].x) / 2,
  );
  expect(projectStops([stop(0), stop(0)])).toEqual([
    { x: 50, y: 50 },
    { x: 50, y: 50 },
  ]);
  const draft = vi.fn();
  render(<Document initial={studioExamples[1]} action={draft} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Parada" }), {
    target: { value: "b" },
  });
  expect(
    screen.getByRole("link", { name: /Ver no mapa/ }).getAttribute("href"),
  ).toContain("mlat=-23.545");
  fireEvent.click(
    screen.getByRole("button", { name: "Perguntar sobre a parada" }),
  );
  expect(draft.mock.calls[0][0]).toContain("Linhas da rua");
});
it("prepares a readable draft from dates, multiline, radio and a boolean", () => {
  const draft = vi.fn();
  render(<Document initial={studioExamples[1]} action={draft} />);
  fireEvent.change(screen.getByLabelText("Data da saída"), {
    target: { value: "2026-08-03" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Difusa" }));
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Quero revisar as fotos com o Hermes",
    }),
  );
  fireEvent.change(screen.getByLabelText("Observações de campo"), {
    target: { value: "Linha 1\nLinha 2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preparar relato" }));
  expect(draft).toHaveBeenCalledOnce();
  expect(draft.mock.calls[0][0]).toContain(
    "2026-08-03\nLuz predominante: Difusa\nObservações de campo: Linha 1\nLinha 2\nQuero revisar as fotos com o Hermes: Sim",
  );
});
