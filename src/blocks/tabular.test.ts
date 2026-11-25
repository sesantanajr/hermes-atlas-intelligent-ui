import { describe, expect, it } from "vitest";
import { blockTable, canvasCsv, columnTotals, parseNumber, tableRows, toCsv } from "./tabular";
import type { Block, Canvas } from "../types";

describe("numbers as people write them", () => {
  it("reads Brazilian and English formats, currencies and percentages", () => {
    expect(parseNumber("R$ 1.234,56", "pt-BR")).toBe(1234.56);
    expect(parseNumber("1,234.56", "en")).toBe(1234.56);
    expect(parseNumber("1.234", "pt-BR")).toBe(1234);
    expect(parseNumber("1.5", "pt-BR")).toBe(1.5);
    expect(parseNumber("1,5", "pt-BR")).toBe(1.5);
    expect(parseNumber("45%", "pt-BR")).toBe(45);
    expect(parseNumber("-12", "pt-BR")).toBe(-12);
    expect(parseNumber("(300)", "en")).toBe(-300);
    expect(parseNumber("abc", "pt-BR")).toBeNull();
    expect(parseNumber("", "pt-BR")).toBeNull();
  });
  it("totals numeric columns and leaves years, codes and text alone", () => {
    const rows = [
      ["A", "R$ 10,00", "50%", "2024", "007"],
      ["B", "R$ 5,50", "30%", "2025", "008"],
    ];
    const [text, money, share, year, code] = columnTotals(rows, 5, "pt-BR");
    expect(text).toBeNull();
    expect(money).toEqual({ kind: "sum", value: 15.5, prefix: "R$ ", suffix: "" });
    expect(share).toEqual({ kind: "average", value: 40, prefix: "", suffix: "%" });
    expect(year).toBeNull();
    expect(code).toBeNull();
  });
});

describe("blocks as tables", () => {
  const table: Extract<Block, { type: "table" }> = {
    type: "table",
    id: "t",
    title: "Custos",
    columns: ["Item", "Valor"],
    rows: [
      ["A", "10"],
      ["B", "=HYPERLINK(\"x\")"],
    ],
  };
  it("applies edited cells over the original rows", () => {
    expect(tableRows(table, { cells: { "0:1": "12" } }).map((r) => r.cells)).toEqual([
      ["A", "12"],
      ["B", "=HYPERLINK(\"x\")"],
    ]);
  });
  it("writes CSV that spreadsheets read as text, with a BOM and quotes", () => {
    const csv = toCsv({ columns: ["Nome", "Nota"], rows: [["a;b", "=1+1"], ["c\"d", "ok"]] });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"a;b";\'=1+1');
    expect(csv).toContain('"c""d";ok');
  });
  it("reads kanban, matrix and gantt with the person's moves", () => {
    const kanban: Block = {
      type: "kanban",
      id: "k",
      title: "Quadro",
      columns: [
        { id: "todo", label: "A fazer" },
        { id: "done", label: "Feito" },
      ],
      tasks: [{ id: "x", label: "Tarefa X", column: "todo" }],
    };
    expect(blockTable(kanban, { values: { x: "done" } })?.rows).toEqual([["Tarefa X", "Feito"]]);
    const gantt: Block = {
      type: "gantt",
      id: "g",
      title: "Plano",
      tasks: [{ id: "a", label: "A", start: "2026-12-01", end: "2026-12-02", progress: 50 }],
    };
    expect(blockTable(gantt)?.rows).toEqual([["A", "", "2026-12-01", "2026-12-02", "50%", ""]]);
    expect(blockTable({ type: "text", id: "p", title: "P", text: "x" })).toBeNull();
  });
  it("puts every tabular block of a canvas in one CSV, each under its title", () => {
    const canvas: Canvas = {
      schema_version: "1.0",
      id: "c",
      title: "C",
      description: "",
      blocks: [table, { type: "text", id: "p", title: "Nota", text: "x" }],
      state: { t: { cells: { "0:1": "11" } } },
    };
    const csv = canvasCsv(canvas)!;
    expect(csv.split("\r\n").slice(0, 3)).toEqual(["\uFEFFCustos", "Item;Valor", "A;11"]);
    expect(canvasCsv({ ...canvas, blocks: [canvas.blocks[1]] })).toBeNull();
  });
});
