/**
 * The table block (1.1.2): filter, sort by any column, edit a cell in place, totals for numeric
 * columns and the rows as CSV.
 *
 * Edits never change the block the agent wrote: they are kept in the block's state (`cells`,
 * keyed by the row and column of the original data), so sorting and filtering keep working, the
 * person can restore the original, and the agent sees exactly which cells changed.
 */
import React, { useContext, useState } from "react";
import { Download, RotateCcw, Search } from "lucide-react";
import type { Block, Interaction } from "../types";
import { formatNumber, getLocale, intlLocale, t } from "../i18n";
import { PreviewContext } from "./CanvasLink";
import { columnTotals, parseNumber, tableRows, toCsv } from "./tabular";
import { downloadTextFile, safeName } from "./exporters";

type TableBlock = Extract<Block, { type: "table" }>;

export function TableView({
  block,
  state,
  set,
}: {
  block: TableBlock;
  state: Interaction;
  set: (patch: Partial<Interaction>) => void;
}) {
  const preview = useContext(PreviewContext);
  const [editing, setEditing] = useState<{ row: number; column: number; value: string } | null>(null);
  const query = state.query || "";
  const cells = state.cells ?? {};
  const locale = getLocale();
  const all = tableRows(block, state);
  const visible = all
    .filter((row) => row.cells.some((c) => c.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) =>
      state.sort_column != null && state.sort_column < block.columns.length
        ? (state.sort_reverse ? -1 : 1) * compare(a.cells[state.sort_column], b.cells[state.sort_column], locale)
        : 0,
    );
  const totals = columnTotals(visible.map((row) => row.cells), block.columns.length, locale);
  const numeric = totals.map((total) => total !== null);
  const anyTotal = numeric.some(Boolean) && visible.length > 1;
  const edited = Object.keys(cells).length;
  const commit = () => {
    if (!editing) return;
    const key = `${editing.row}:${editing.column}`;
    const original = block.rows[editing.row]?.[editing.column] ?? "";
    const next = { ...cells };
    if (editing.value === original) delete next[key];
    else next[key] = editing.value.slice(0, 2000);
    setEditing(null);
    set({ cells: next });
  };
  const csv = () =>
    downloadTextFile(
      `${safeName(block.title, "tabela")}.csv`,
      toCsv({ columns: block.columns, rows: visible.map((row) => row.cells) }, locale === "en" ? "," : ";"),
      "text/csv;charset=utf-8",
    );
  return (
    <>
      <div className="table-bar">
        <label className="table-search">
          <Search size={16} />
          <input
            aria-label={t("Filtrar {title}", { title: block.title })}
            placeholder={t("Filtrar linhas...")}
            value={query}
            onChange={(e) => set({ query: e.target.value })}
          />
        </label>
        <span className="chip" aria-live="polite">
          {query
            ? t("{n} de {total} linhas", { n: visible.length, total: block.rows.length })
            : t("{n} linhas", { n: block.rows.length })}
        </span>
        {edited > 0 && !preview && (
          <button className="btn small ghost" onClick={() => set({ cells: {} })}>
            <RotateCcw size={14} /> {t("Restaurar original ({n})", { n: edited })}
          </button>
        )}
        <button className="btn small ghost" onClick={csv} disabled={preview} title={t("Baixar dados (CSV)")}>
          <Download size={14} /> CSV
        </button>
      </div>
      <div className={`table-scroll${block.rows.length > 12 ? " tall" : ""}`}>
        <table>
          <thead>
            <tr>
              {block.columns.map((c, i) => (
                <th
                  key={i}
                  className={numeric[i] ? "numeric" : ""}
                  aria-sort={
                    state.sort_column === i ? (state.sort_reverse ? "descending" : "ascending") : "none"
                  }
                >
                  <button
                    onClick={() =>
                      set({
                        sort_column: i,
                        sort_reverse: state.sort_column === i ? !state.sort_reverse : false,
                      })
                    }
                  >
                    {c} {state.sort_column === i ? (state.sort_reverse ? "↓" : "↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.index}>
                {row.cells.map((value, column) => {
                  const key = `${row.index}:${column}`;
                  const changed = key in cells;
                  const isEditing = editing?.row === row.index && editing.column === column;
                  return (
                    <td
                      key={column}
                      className={[
                        numeric[column] ? "numeric" : "",
                        changed ? "edited" : "",
                        preview ? "" : "editable",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={
                        changed
                          ? t("Editado. Original: {text}", { text: block.rows[row.index][column] || "—" })
                          : preview
                            ? undefined
                            : t("Clique duas vezes para editar")
                      }
                      tabIndex={preview ? undefined : 0}
                      onDoubleClick={() => !preview && setEditing({ row: row.index, column, value })}
                      onKeyDown={(event) => {
                        if (preview || isEditing) return;
                        if (event.key === "Enter" || event.key === "F2") {
                          event.preventDefault();
                          setEditing({ row: row.index, column, value });
                        }
                      }}
                    >
                      {isEditing ? (
                        <input
                          className="cell-input"
                          autoFocus
                          aria-label={t("Editar {column}", { column: block.columns[column] })}
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onBlur={commit}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commit();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              setEditing(null);
                            }
                          }}
                        />
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {anyTotal && (
            <tfoot>
              <tr>
                {totals.map((total, column) => (
                  <td key={column} className={total ? "numeric" : ""}>
                    {total ? (
                      <>
                        <small>{total.kind === "sum" ? t("Soma") : t("Média")}</small>
                        {total.prefix}
                        {formatNumber(total.value, 2)}
                        {total.suffix}
                      </>
                    ) : column === numeric.indexOf(false) ? (
                      t("Total ({n} linhas)", { n: visible.length })
                    ) : (
                      ""
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!preview && (
        <p className="table-note">
          {t("Clique duas vezes numa célula para editar. As edições ficam no canvas e o Atlas consegue lê-las.")}
        </p>
      )}
    </>
  );
}

/** Numbers by value, anything else alphabetically with digits read as numbers. */
function compare(a: string, b: string, locale: string) {
  const x = parseNumber(a, locale),
    y = parseNumber(b, locale);
  if (x !== null && y !== null) return x - y;
  return a.localeCompare(b, intlLocale(), { numeric: true });
}
