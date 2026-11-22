import React from "react";
import { MessageSquarePlus } from "lucide-react";
import type { Interaction } from "../types";
import type {
  AnalyticsBlock,
  AnalyticsKind,
  Amount,
  TableData,
} from "./analyticsData";
import { dataFor, fmt, percent, ranked, totalOf } from "./analyticsData";
import {
  Coordinates,
  Gauge,
  Histogram,
  ink,
  Radar,
  Slices,
  Sparkline,
  Tiles,
  Waterfall,
} from "./analyticsPlots";
import { t } from "../i18n";
import "./analytics.css";

export type { AnalyticsBlock } from "./analyticsData";
export const analyticsKinds = [
  "donut",
  "pie",
  "scatter",
  "bubble",
  "radar",
  "heatmap",
  "histogram",
  "waterfall",
  "funnel",
  "gauge",
  "progress",
  "sparkline",
  "ranking",
  "treemap",
  "dashboard",
] as const satisfies readonly AnalyticsKind[];
export function isAnalyticsBlock(block: {
  type: string;
}): block is AnalyticsBlock {
  return (analyticsKinds as readonly string[]).includes(block.type);
}

function DataTable({ data, title }: { data: TableData; title: string }) {
  return (
    <div className="ana-table-wrap">
      <table aria-label={title}>
        <thead>
          <tr>
            {data.columns.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {v}
                  </th>
                ) : (
                  <td key={j}>{v}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Breakdown({
  items,
  unit,
  numbered = false,
}: {
  items: Amount[];
  unit?: string;
  numbered?: boolean;
}) {
  const total = totalOf(items);
  return (
    <ul className="ana-key">
      {items.map((p, i) => (
        <li key={p.label}>
          <span className="ana-dot" style={{ backgroundColor: ink(i) }} />
          <span>
            {numbered ? i + 1 + ". " : ""}
            {p.label}
          </span>
          <strong>{fmt(p.value, unit)}</strong>
          {total > 0 && <small>{percent(p.value / total)}</small>}
        </li>
      ))}
    </ul>
  );
}
function RankedBars({ items, unit }: { items: Amount[]; unit?: string }) {
  const ordered = ranked(items),
    min = Math.min(0, ...items.map((p) => p.value)),
    max = Math.max(0, ...items.map((p) => p.value));
  const span = max - min || 1,
    origin = (-min / span) * 100;
  return (
    <ol className="ana-ranks">
      {ordered.map((p) => {
        const position = ((p.value - min) / span) * 100;
        return (
          <li
            key={p.label}
            value={ordered.findIndex((q) => q.value === p.value) + 1}
          >
            <div className="ana-line-label">
              <span>{p.label}</span>
              <strong>{fmt(p.value, unit)}</strong>
            </div>
            <span className="ana-strip" aria-hidden="true">
              <i
                style={{
                  left: Math.min(origin, position) + "%",
                  width: Math.abs(origin - position) + "%",
                  background: ink(p.value < 0 ? 3 : 0),
                }}
              />
              <b style={{ left: origin + "%" }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
function Visual({
  block: b,
  selected,
  periodId,
}: {
  block: AnalyticsBlock;
  selected: string;
  periodId: string;
}) {
  switch (b.type) {
    case "pie":
    case "donut":
      return (
        <>
          <Slices b={b} selected={selected} />
          <Breakdown items={b.items} unit={b.unit} />
        </>
      );
    case "treemap":
      return (
        <>
          <Tiles b={b} selected={selected} />
          <Breakdown items={ranked(b.items)} unit={b.unit} numbered />
        </>
      );
    case "scatter":
    case "bubble":
      return (
        <>
          <Coordinates b={b} selected={selected} />
          {b.type === "bubble" && (
            <small>
              {t("Área da bolha proporcional ao tamanho informado.")}
            </small>
          )}
        </>
      );
    case "radar":
      return (
        <>
          <Radar title={b.title} axes={b.axes} />
          <small>
            {t("O contorno externo corresponde ao máximo de cada eixo.")}
          </small>
        </>
      );
    case "heatmap": {
      const max = Math.max(
        0,
        ...b.values.flatMap((row) => row.map((v) => Math.abs(v ?? 0))),
      );
      return (
        <div className="ana-table-wrap">
          <table className="ana-heat" aria-label={b.title}>
            <thead>
              <tr>
                <th scope="col">{t("Turno / grupo")}</th>
                {b.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={r}>
                  <th scope="row">{r}</th>
                  {b.values[i].map((v, j) => (
                    <td
                      key={j}
                      style={{
                        backgroundColor:
                          v === null || max === 0
                            ? undefined
                            : `color-mix(in srgb, ${ink(v < 0 ? 3 : 0)} ${(Math.abs(v) / max) * 36}%, var(--surface))`,
                      }}
                    >
                      {fmt(v, b.unit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "histogram":
      return (
        <>
          <Histogram b={b} />
          <small>
            {t("{n} observações numéricas · {missing} sem dado", {
              n: b.samples.filter((n) => n !== null).length,
              missing: b.samples.filter((n) => n === null).length,
            })}
          </small>
        </>
      );
    case "waterfall":
      return (
        <>
          <Waterfall b={b} />
          <small>
            {t("Saldo final")}{" "}
            <strong>{fmt((b.start ?? 0) + totalOf(b.items), b.unit)}</strong>
          </small>
        </>
      );
    case "ranking":
      return <RankedBars items={b.items} unit={b.unit} />;
    case "funnel": {
      const initial = b.items[0].value;
      return (
        <ol className="ana-funnel">
          {b.items.map((p, i) => (
            <li key={p.label}>
              <div className="ana-line-label">
                <span>
                  {i + 1}. {p.label}
                </span>
                <strong>{fmt(p.value, b.unit)}</strong>
              </div>
              <div className="ana-funnel-stage" aria-hidden="true">
                <i
                  style={{
                    width: (initial ? (100 * p.value) / initial : 0) + "%",
                    background: ink(i),
                  }}
                />
              </div>
              {i > 0 && b.items[i - 1].value > 0 && (
                <small>
                  {t("{percent} da etapa anterior", {
                    percent: percent(p.value / b.items[i - 1].value),
                  })}
                </small>
              )}
            </li>
          ))}
        </ol>
      );
    }
    case "progress":
      return (
        <div className="ana-progress">
          <strong className="ana-big">{percent(b.completed / b.total)}</strong>
          <progress aria-label={b.title} value={b.completed} max={b.total} />
          <div className="ana-line-label">
            <span>
              {t("{n} de {total}", {
                n: fmt(b.completed, b.unit),
                total: fmt(b.total, b.unit),
              })}
            </span>
            <small>
              {t("Restante · {value}", {
                value: fmt(b.total - b.completed, b.unit),
              })}
            </small>
          </div>
        </div>
      );
    case "gauge":
      return (
        <>
          <strong className="ana-big">{fmt(b.value, b.unit)}</strong>
          <Gauge b={b} />
        </>
      );
    case "sparkline": {
      const available = b.points.filter((p) => p.value !== null),
        last = available.at(-1);
      return (
        <>
          {last && (
            <div>
              <small>
                {t("Última medição · {label}", { label: last.label })}
              </small>
              <strong className="ana-big">{fmt(last.value, b.unit)}</strong>
            </div>
          )}
          <Sparkline points={b.points} title={b.title} unit={b.unit} />
        </>
      );
    }
    case "dashboard": {
      const period = b.periods.find((p) => p.id === periodId) ?? b.periods[0];
      return (
        <>
          <dl className="ana-metrics">
            {period.metrics.map((m) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd>{fmt(m.value, m.unit)}</dd>
              </div>
            ))}
          </dl>
          <h4>{b.breakdown_label}</h4>
          <RankedBars items={period.breakdown} unit={b.unit} />
        </>
      );
    }
  }
}
function selectable(b: AnalyticsBlock): string[] {
  switch (b.type) {
    case "pie":
    case "donut":
    case "treemap":
      return b.items.map((p) => p.label);
    case "scatter":
    case "bubble":
      return b.points.map((p) => p.label);
    default:
      return [];
  }
}
export function AnalyticsView({
  block,
  state,
  change,
  onAction,
}: {
  block: AnalyticsBlock;
  state: Interaction;
  change: (patch: Partial<Interaction>) => void;
  onAction?: (draft: string) => void;
}) {
  const values = state.values ?? {},
    table = values.view === "table",
    options = selectable(block);
  const selected = options.includes(values.selected ?? "")
    ? values.selected
    : "";
  const period =
    block.type === "dashboard"
      ? (block.periods.find((p) => p.id === values.period) ?? block.periods[0])
      : undefined;
  const data = dataFor(block, period?.id);
  const set = (key: string, value: string) =>
    change({ values: { ...values, [key]: value } });
  const selection = selected
    ? data.rows.find((row) => row[0] === selected)
    : undefined;
  function discuss() {
    const title = [block.title, period?.label].filter(Boolean).join(" · ");
    const lines = (selection ? [selection] : data.rows.slice(0, 8)).map((row) =>
      row.map((cell, i) => data.columns[i] + " = " + cell).join(" · "),
    );
    onAction?.(
      (
        t("Analise {title} com base nos valores exibidos.", { title }) +
        "\n" +
        lines.join("\n")
      ).slice(0, 6000),
    );
  }
  return (
    <section
      className="ana-view"
      aria-label={block.title}
      data-analytics={block.type}
    >
      <div className="ana-tools">
        {block.type === "dashboard" && (
          <label>
            {t("Período")}{" "}
            <select
              value={period?.id}
              onChange={(e) => set("period", e.target.value)}
            >
              {block.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {!!options.length && (
          <label>
            {t("Destaque")}{" "}
            <select
              value={selected || ""}
              onChange={(e) => set("selected", e.target.value)}
            >
              <option value="">{t("Todos")}</option>
              {options.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          aria-pressed={table}
          onClick={() => set("view", table ? "chart" : "table")}
        >
          {table ? t("Ver gráfico") : t("Ver valores")}
        </button>
      </div>
      {table ? (
        <DataTable title={block.title} data={data} />
      ) : (
        <Visual
          block={block}
          selected={selected || ""}
          periodId={period?.id || ""}
        />
      )}
      {selection && (
        <p aria-live="polite" className="ana-selection">
          <strong>{selected}</strong> ·{" "}
          {selection
            .slice(1)
            .map((v, i) => data.columns[i + 1] + " " + v)
            .join(" · ")}
        </p>
      )}
      {onAction && (
        <button className="ana-discuss" type="button" onClick={discuss}>
          <MessageSquarePlus size={16} /> {t("Analisar na conversa")}
        </button>
      )}
    </section>
  );
}
