// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Canvas } from "./Canvas";
import type { Canvas as CanvasData } from "../types";
import { experienceSamples } from "./experienceSamples";
afterEach(cleanup);
function Demo({ kind }: { kind: string }) {
  const [canvas, setCanvas] = useState<CanvasData>({
    schema_version: "1.0",
    id: "demo",
    title: "Teste",
    description: "",
    blocks: [experienceSamples.find((b) => b.type === kind)!],
  });
  return <Canvas canvas={canvas} onChange={setCanvas} />;
}
test("board moves a task and recalculates its column", () => {
  render(<Demo kind="kanban" />);
  fireEvent.change(screen.getByLabelText("Mover Selecionar fotografias"), {
    target: { value: "done" },
  });
  expect(
    screen.getByText("Selecionar fotografias").closest("section")?.textContent,
  ).toContain("Concluído");
});
test("planner quantities affect available budget and total", () => {
  render(<Demo kind="budget_planner" />);
  fireEvent.change(screen.getByLabelText("Quantidade de Impressões"), {
    target: { value: "20" },
  });
  expect(screen.getByText(/Acima do limite/)).toBeTruthy();
});
test("decision path supports return and alternate branch", () => {
  render(<Demo kind="decision_tree" />);
  fireEvent.click(screen.getByRole("button", { name: "Som" }));
  expect(screen.getByText(/paisagem sonora/)).toBeTruthy();
  fireEvent.click(screen.getByText("Voltar uma etapa"));
  fireEvent.click(screen.getByText("Imagem"));
  expect(screen.getByText(/oficina de fotografia/)).toBeTruthy();
});
test("map zoom and place selection update geographic bounds", () => {
  render(<Demo kind="map" />);
  const svg = screen.getByRole("img");
  fireEvent.click(screen.getByLabelText("Aumentar zoom"));
  const box = svg.getAttribute("viewBox");
  fireEvent.change(screen.getByLabelText("Local"), {
    target: { value: "lisboa" },
  });
  expect(svg.getAttribute("viewBox")).not.toEqual(box);
});
test("remote captions require consent even with a bundled clip", () => {
  render(
    <Canvas
      canvas={{
        schema_version: "1.0",
        id: "demo",
        title: "Vídeo",
        description: "",
        blocks: [
          {
            id: "clip",
            title: "Clipe",
            type: "video",
            src: "atlas:focus",
            transcript: "Silencioso",
            captions_url: "https://example.org/clip.vtt",
          },
        ],
      }}
    />,
  );
  expect(document.querySelector("track")).toBeNull();
  fireEvent.click(screen.getByText(/Carregar mídia de example.org/));
  expect(document.querySelector("track")?.getAttribute("src")).toBe(
    "https://example.org/clip.vtt",
  );
});
test("external image only loads after explicit action", () => {
  render(
    <Canvas
      canvas={{
        schema_version: "1.0",
        id: "demo",
        title: "Foto",
        description: "",
        blocks: [
          {
            id: "img",
            title: "Imagem",
            type: "image",
            photo: { src: "https://example.com/sample.jpg", alt: "Foto teste" },
          },
        ],
      }}
    />,
  );
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByText(/Carregar mídia/));
  expect(screen.getByRole("img").getAttribute("src")).toBe(
    "https://example.com/sample.jpg",
  );
});
