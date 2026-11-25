/**
 * Blocks as rows and columns (1.1.2): what "Baixar CSV" writes, and the numbers a table totals.
 *
 * Every block that holds data has a tabular reading here. Values are the ones on screen: edited
 * table cells, a kanban card where the person dragged it, the quantities they set in a budget.
 */
import type { Block, Canvas, Interaction } from "../types";
import { dataFor } from "./analyticsData";
import { isAnalyticsBlock } from "./analytics";
import { getLocale, t } from "../i18n";

export type Tabular = { columns: string[]; rows: string[][] };

/** The rows of a table block with the person's edits applied, each with its original index. */
export function tableRows(block: Extract<Block, { type: "table" }>, state: Interaction) {
  const cells = state.cells ?? {};
  return block.rows.map((row, index) => ({
    index,
    cells: row.map((value, column) => cells[`${index}:${column}`] ?? value),
  }));
}

/**
 * A number written the way people write them in a table: `R$ 1.234,56`, `1,234.56`, `45%`,
 * `-12`. Returns null for anything that is not one number.
 */
export function parseNumber(text: string, locale: string = getLocale()): number | null {
  let raw = String(text ?? "").trim();
  if (!raw || raw.length > 40) return null;
  const negative = /^\(.*\)$/.test(raw) || /^[-−–]/.test(raw.replace(/^[^\d\-−–(]*/, ""));
  raw = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(raw)) return null;
  const dots = (raw.match(/\./g) ?? []).length,
    commas = (raw.match(/,/g) ?? []).length;
  if (dots && commas) {
    const decimal = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
    raw = raw.replace(decimal === "," ? /\./g : /,/g, "").replace(",", ".");
  } else if (commas) {
    const grouped = /^\d{1,3}(,\d{3})+$/.test(raw) && !locale.startsWith("pt");
    raw = grouped || commas > 1 ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (dots) {
    const grouped = /^\d{1,3}(\.\d{3})+$/.test(raw) && (locale.startsWith("pt") || dots > 1);
    if (grouped) raw = raw.replace(/\./g, "");
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export type ColumnTotal = { kind: "sum" | "average"; value: number; prefix: string; suffix: string };

/**
 * Totals for the numeric columns of a table: a sum, or an average for percentages. A column is
 * numeric when at least two cells are filled and nearly all of them read as numbers.
 */
export function columnTotals(rows: string[][], columns: number, locale: string = getLocale()): (ColumnTotal | null)[] {
  return Array.from({ length: columns }, (_, column) => {
    const filled = rows.map((row) => String(row[column] ?? "").trim()).filter(Boolean);
    if (filled.length < 2) return null;
    const numbers = filled.map((cell) => parseNumber(cell, locale));
    const read = numbers.filter((value): value is number => value !== null);
    if (read.length < Math.max(2, Math.ceil(filled.length * 0.8))) return null;
    // A column of years or codes (all integers between 1900 and 2100, or with leading zeros) is not summed.
    if (read.every((value) => Number.isInteger(value) && value >= 1900 && value <= 2100)) return null;
    if (filled.some((cell) => /^0\d/.test(cell))) return null;
    const percent = filled.filter((cell) => cell.includes("%")).length > filled.length / 2;
    const prefix = /^(R\$|US\$|\$|€|£)\s?/.exec(filled[0])?.[0] ?? "";
    const sum = read.reduce((a, b) => a + b, 0);
    return percent
      ? { kind: "average", value: sum / read.length, prefix: "", suffix: "%" }
      : { kind: "sum", value: sum, prefix, suffix: "" };
  });
}

function money(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

/** The block as a table, or null when it holds no data worth a spreadsheet. */
export function blockTable(block: Block, state: Interaction = {}): Tabular | null {
  const values = state.values ?? {};
  if (isAnalyticsBlock(block)) {
    try {
      return dataFor(block);
    } catch {
      return null;
    }
  }
  switch (block.type) {
    case "table":
      return { columns: block.columns, rows: tableRows(block, state).map((row) => row.cells) };
    case "chart":
      return {
        columns: [t("Item"), block.unit ? `${t("Valor")} (${block.unit})` : t("Valor")],
        rows: block.points.map((p) => [p.label, String(p.value)]),
      };
    case "series":
      return {
        columns: [block.x_axis === "date" ? t("Data") : t("Categoria"), ...block.datasets.map((d) => d.label)],
        rows: block.labels.map((label, i) => [label, ...block.datasets.map((d) => (d.values[i] ?? "") + "")]),
      };
    case "checklist":
      return {
        columns: [t("Item"), t("Concluído")],
        rows: block.items.map((item, i) => [item, (state.checked ?? []).includes(i) ? t("sim") : t("não")]),
      };
    case "comparison":
      return {
        columns: [t("Opção"), t("Descrição"), t("Características")],
        rows: block.options.map((o) => [o.name, o.description, o.features.join("; ")]),
      };
    case "collection":
      return {
        columns: [t("Item"), t("Descrição"), t("Nota")],
        rows: block.items.map((item) => [item.title, item.description ?? "", item.score == null ? "" : String(item.score)]),
      };
    case "kanban":
      return {
        columns: [t("Tarefa"), t("Coluna")],
        rows: block.tasks.map((task) => {
          const column = values[task.id] ?? task.column;
          return [task.label, block.columns.find((c) => c.id === column)?.label ?? column];
        }),
      };
    case "budget_planner":
      return {
        columns: [t("Item"), t("Quantidade"), t("Preço"), t("Total da linha")],
        rows: block.items.map((item) => {
          const quantity = Number(values[item.id] ?? item.quantity ?? 1);
          return [item.label, String(quantity), money(item.price_cents, block.currency), money(item.price_cents * quantity, block.currency)];
        }),
      };
    case "gantt":
      return {
        columns: [t("Tarefa"), t("Fase"), t("Início"), t("Fim"), t("Progresso"), t("Responsável")],
        rows: block.tasks.map((task) => [task.label, task.group ?? "", task.start, task.end, `${task.progress ?? 0}%`, task.owner ?? ""]),
      };
    case "calendar":
      return {
        columns: [t("Data"), t("Fim"), t("Hora"), t("Evento"), t("Detalhes")],
        rows: [...block.events]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((e) => [e.date, e.end ?? "", e.time ?? "", e.label, e.detail ?? ""]),
      };
    case "matrix":
      return {
        columns: [t("Item"), t("Quadrante")],
        rows: block.items.map((item) => {
          const quadrant = values[item.id] ?? item.quadrant;
          return [item.label, block.quadrants.find((q) => q.id === quadrant)?.label ?? quadrant];
        }),
      };
    case "tree": {
      const byId = new Map(block.nodes.map((node) => [node.id, node]));
      const path = (id: string | null | undefined): string[] => {
        const trail: string[] = [];
        for (let cursor = id, guard = 0; cursor && guard < 64; guard++) {
          const node = byId.get(cursor);
          if (!node) break;
          trail.unshift(node.label);
          cursor = node.parent ?? null;
        }
        return trail;
      };
      return {
        columns: [t("Nó"), t("Caminho"), t("Detalhes")],
        rows: block.nodes.map((node) => [node.label, path(node.id).join(" › "), node.detail ?? ""]),
      };
    }
    case "map":
      return {
        columns: [t("Local"), "Lat", "Lon", t("Detalhes")],
        rows: block.pins.map((pin) => [pin.label, String(pin.lat), String(pin.lon), pin.detail ?? ""]),
      };
    case "places":
      return {
        columns: [t("Local"), t("Categoria"), t("Endereço")],
        rows: block.places.map((place) => [place.label, place.category, place.address]),
      };
    case "timeline":
      return {
        columns: [t("Data"), t("Evento"), t("Detalhes")],
        rows: block.items.map((item) => [item.when ?? "", item.title, item.body ?? ""]),
      };
    default:
      return null;
  }
}

/** One CSV field: quoted when it holds a separator, a quote or a line break. */
function field(value: string, separator: string) {
  const text = String(value ?? "");
  // A cell starting with = + - @ is a formula to a spreadsheet: prefix it so it stays text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return new RegExp(`["\\n\\r${separator}]`).test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * CSV text (with a BOM, so Excel reads accents) for a table. Portuguese uses `;` like Excel does
 * in Brazil; English uses `,`.
 */
export function toCsv(table: Tabular, separator = ";"): string {
  const lines = [table.columns, ...table.rows].map((row) => row.map((cell) => field(cell, separator)).join(separator));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** Every tabular block of a canvas, one after another, each under its title. */
export function canvasCsv(canvas: Canvas, separator = ";"): string | null {
  const parts: string[] = [];
  for (const block of canvas.blocks) {
    const table = blockTable(block, canvas.state?.[block.id] ?? {});
    if (!table || !table.rows.length) continue;
    parts.push(toCsv({ columns: [block.title], rows: [] }, separator).replace(/^\uFEFF/, "") + toCsv(table, separator).replace(/^\uFEFF/, ""));
  }
  return parts.length ? "\uFEFF" + parts.join("\r\n") : null;
}
