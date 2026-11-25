import { describe, expect, it } from "vitest";
import { canvasMessage, changesMessage, describeChanges, readHostMessage, restoreCanvas } from "./embed";
import type { Canvas } from "../types";

const ORIGINAL: Canvas = {
  schema_version: "1.0",
  id: "canvas-1",
  title: "Plano",
  description: "",
  blocks: [
    { type: "checklist", id: "l", title: "Lista", items: ["Passaporte", "Seguro"] },
    { type: "table", id: "t", title: "Custos", columns: ["Item", "Valor"], rows: [["Hotel", "100"]] },
    {
      type: "calculator",
      id: "calc",
      title: "Simulação",
      operation: "sum",
      inputs: [
        { label: "A", value: 1, min: 0, max: 10, step: 1 },
        { label: "B", value: 2, min: 0, max: 10, step: 1 },
      ],
    },
  ],
};

describe("frame protocol", () => {
  it("reads only well-formed host messages", () => {
    expect(readHostMessage({ source: "atlas-host", version: 1, type: "theme", theme: "dark" })).toEqual({
      source: "atlas-host",
      version: 1,
      type: "theme",
      theme: "dark",
    });
    for (const bad of [null, "x", { source: "other", version: 1, type: "theme" }, { source: "atlas-host", version: 2, type: "theme" }, { source: "atlas-host", version: 1, type: "eval" }])
      expect(readHostMessage(bad)).toBeNull();
    expect(canvasMessage("height", { height: 10 })).toEqual({ source: "atlas-canvas", version: 1, type: "height", height: 10 });
  });

  it("restores the person's order, state and calculator values, never the content", () => {
    const saved = {
      ...ORIGINAL,
      title: "Outro título",
      blocks: [
        { ...ORIGINAL.blocks[1], rows: [["Injetado", "0"]] },
        ORIGINAL.blocks[0],
        { ...ORIGINAL.blocks[2], inputs: [{ value: 9 }, { value: 99 }] },
      ],
      state: { l: { checked: [1] }, ghost: { checked: [0] } },
    };
    const restored = restoreCanvas(ORIGINAL, saved);
    expect(restored.title).toBe("Plano");
    expect(restored.blocks.map((b) => b.id)).toEqual(["t", "l", "calc"]);
    expect(restored.blocks[0]).toEqual(ORIGINAL.blocks[1]);
    const calc = restored.blocks[2];
    expect(calc.type === "calculator" && calc.inputs.map((i) => i.value)).toEqual([9, 2]);
    expect(restored.state).toEqual({ l: { checked: [1] } });
    expect(restoreCanvas(ORIGINAL, { ...saved, id: "other" })).toBe(ORIGINAL);
    expect(restoreCanvas(ORIGINAL, { ...saved, blocks: [ORIGINAL.blocks[0]] }).blocks.map((b) => b.id)).toEqual([
      "l",
      "t",
      "calc",
    ]);
  });

  it("describes the changes in words the person can send", () => {
    expect(describeChanges(ORIGINAL, ORIGINAL)).toEqual([]);
    const changed: Canvas = {
      ...ORIGINAL,
      blocks: [ORIGINAL.blocks[1], ORIGINAL.blocks[0], ORIGINAL.blocks[2]],
      state: { l: { checked: [0] }, t: { cells: { "0:1": "120" }, width: "half" } },
    };
    const lines = describeChanges(ORIGINAL, changed);
    expect(lines).toEqual([
      "Reorganizei os blocos: Custos → Lista → Simulação.",
      "Deixei o bloco “Custos” em meia largura.",
      "Editei a tabela “Custos”: linha 1, Valor: “120”.",
      "Em “Lista”, marquei: Passaporte.",
    ]);
    expect(changesMessage(changed, lines)).toMatch(/^Atualizei o canvas “Plano”:\n- Reorganizei/);
    // A filter, a sort or the item on screen is not news for the agent.
    const browsed: Canvas = { ...ORIGINAL, state: { t: { query: "hotel", sort_column: 1 } } };
    expect(describeChanges(ORIGINAL, browsed)).toEqual([]);
    expect(changesMessage(changed, [])).toBe("");
  });
});
