import React, { useEffect, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import type { Dataset, SeriesBlock, SeriesState } from "./seriesTypes";
import "./series.css";

const exact = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 20 });
const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumSignificantDigits: 3,
});
const dash = [undefined, "7 3", "2 3", "10 3 2 3", "5 4", "9 3 2 3 2 3"];
const height = 214;
const top = 16;
const bottom = 178;
const left = 65;
const right = 16;

function formatted(value: number, short = false) {
  if (value !== 0 && Math.abs(value) < 0.001)
    return short ? value.toExponential(1) : value.toString();
  return (short ? compact : exact).format(value);
}

type Point = { x: number; y: number };

function segments(
  values: Dataset["values"],
  positions: number[],
  y: (value: number) => number,
) {
  const groups: Point[][] = [];
  let group: Point[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      group = [];
      return;
    }
    if (!group.length) groups.push(group);
    group.push({ x: positions[i], y: y(value) });
  });
  return groups;
}

function positionsFor(block: SeriesBlock, width: number) {
  const raw = block.labels.map((label, i) =>
    block.x_axis === "date" ? Date.parse(label + "T00:00:00Z") : i,
  );
  const plotWidth = width - left - right;
  if (raw.length === 1) return [left + plotWidth / 2];
  const span = raw[raw.length - 1] - raw[0];
  const gutter = block.kind === "bar" ? plotWidth / (2 * raw.length) : 4;
  return raw.map(
    (n) => left + gutter + ((n - raw[0]) / span) * (plotWidth - 2 * gutter),
  );
}

function labelIndices(positions: number[]) {
  const result = [0];
  const last = positions.length - 1;
  for (let i = 1; i < last; i++) {
    if (
      positions[i] - positions[result[result.length - 1]] > 95 &&
      positions[last] - positions[i] > 95
    )
      result.push(i);
  }
  if (last > 0) result.push(last);
  return result;
}

function SeriesPlot({
  block,
  visible,
}: {
  block: SeriesBlock;
  visible: Dataset[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(480);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const resize = () => {
      const measured = element.clientWidth;
      if (measured) setViewport(measured);
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const values = visible.flatMap((series) =>
    series.values.filter((v): v is number => v !== null),
  );
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values) || (low === 0 ? 1 : 0);
  const y = (value: number) =>
    top + ((high - value) / (high - low)) * (bottom - top);
  const axisValues = [
    ...new Set([low, low < 0 && high > 0 ? 0 : (low + high) / 2, high]),
  ];
  const minWidth =
    left +
    right +
    block.labels.length * (block.kind === "bar" ? visible.length * 5 + 7 : 7);
  const width = Math.max(viewport, 265, minWidth);
  const positions = positionsFor(block, width);
  return (
    <div
      className="series-plot"
      ref={container}
      tabIndex={width > viewport ? 0 : undefined}
      role="region"
      aria-label="Área do gráfico"
    >
      {values.length === 0 ? (
        <p className="series-empty">As séries visíveis estão sem dados.</p>
      ) : (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${block.title}. ${visible.map((s) => s.label).join(", ")}. Consulte os valores exatos em Tabela.`}
        >
          {axisValues.map((value) => (
            <g
              key={value}
              className={value === 0 ? "series-baseline" : "series-gridline"}
            >
              <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
              <text textAnchor="end" x={left - 8} y={y(value) + 4}>
                {formatted(value, true)}
              </text>
            </g>
          ))}
          {labelIndices(positions).map((i) => {
            const label = block.labels[i];
            const anchor =
              positions.length === 1
                ? "middle"
                : i === 0
                  ? "start"
                  : i === positions.length - 1
                    ? "end"
                    : "middle";
            return (
              <text
                className="series-axis-label"
                key={i}
                x={positions[i]}
                y={height - 11}
                textAnchor={anchor}
              >
                <title>{label}</title>
                {label.length > 12 ? label.slice(0, 11) + "…" : label}
              </text>
            );
          })}
          {visible.map((series, index) => {
            const tone = block.datasets.indexOf(series);
            const color = `var(--series-${tone})`;
            if (block.kind === "bar")
              return (
                <g key={series.id} fill={color} data-series-id={series.id}>
                  {series.values.map((value, i) => {
                    if (value === null) return null;
                    const prev = positions[i - 1],
                      next = positions[i + 1];
                    const slot = Math.min(
                      70,
                      prev === undefined ? Infinity : positions[i] - prev,
                      next === undefined ? Infinity : next - positions[i],
                      (width - left - right) / block.labels.length,
                    );
                    const bar = (slot * 0.76) / visible.length;
                    return (
                      <rect
                        key={i}
                        x={
                          positions[i] -
                          (bar * visible.length) / 2 +
                          index * bar
                        }
                        width={bar * 0.9}
                        y={Math.min(y(0), y(value))}
                        height={Math.abs(y(value) - y(0))}
                      >
                        <title>
                          {`${series.label} · ${block.labels[i]} · ${formatted(value)} ${block.unit || ""}`.trim()}
                        </title>
                      </rect>
                    );
                  })}
                </g>
              );
            return (
              <g key={series.id} data-series-id={series.id}>
                {segments(series.values, positions, y).map((group, i) => {
                  const line = group
                    .map((p, j) => `${j ? "L" : "M"}${p.x},${p.y}`)
                    .join(" ");
                  return (
                    <g key={i}>
                      {block.kind === "area" && group.length > 1 && (
                        <path
                          fill={color}
                          opacity={0.14}
                          d={`${line} L${group[group.length - 1].x},${y(0)} L${group[0].x},${y(0)} Z`}
                        />
                      )}
                      <path
                        fill="none"
                        stroke={color}
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                        strokeDasharray={dash[tone]}
                        d={line}
                      />
                      {group.map((p) => (
                        <circle
                          key={p.x}
                          cx={p.x}
                          cy={p.y}
                          r={group.length === 1 ? 3.8 : 2.5}
                          fill={color}
                        />
                      ))}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function SeriesView({
  block,
  state,
  change,
  onAction,
}: {
  block: SeriesBlock;
  state: SeriesState;
  change: (patch: Partial<SeriesState>) => void;
  onAction?: (draft: string) => void;
}) {
  const hidden = state.hidden_series ?? [];
  const visible = block.datasets.filter((s) => !hidden.includes(s.id));
  const table = state.series_view === "table";
  const hasData = visible.some((s) => s.values.some((value) => value !== null));
  function ask() {
    onAction?.(
      `Analise as séries visíveis em “${block.title}” considerando os dados do canvas.\n${visible.map((s) => `• ${s.label} [${s.id}]`).join("\n")}`,
    );
  }
  return (
    <div className="series-view">
      <div className="series-toolbar">
        {block.unit && (
          <span className="series-unit">Unidade · {block.unit}</span>
        )}
        <div
          className="series-switch"
          role="group"
          aria-label="Visualização dos dados"
        >
          <button
            type="button"
            aria-pressed={!table}
            onClick={() => change({ series_view: "plot" })}
          >
            Gráfico
          </button>
          <button
            type="button"
            aria-pressed={table}
            onClick={() => change({ series_view: "table" })}
          >
            Tabela
          </button>
        </div>
      </div>
      <fieldset className="series-legend">
        <legend>Séries visíveis</legend>
        {block.datasets.map((series, i) => (
          <label key={series.id}>
            <input
              type="checkbox"
              checked={!hidden.includes(series.id)}
              style={{ accentColor: `var(--series-${i})` }}
              onChange={(e) =>
                change({
                  hidden_series: e.target.checked
                    ? hidden.filter((id) => id !== series.id)
                    : [...hidden, series.id],
                })
              }
            />
            {series.label}
          </label>
        ))}
      </fieldset>
      {!visible.length ? (
        <p className="series-empty">
          Selecione uma série para visualizar os dados.
        </p>
      ) : table ? (
        <div
          className="series-table"
          tabIndex={0}
          role="region"
          aria-label="Valores das séries visíveis"
        >
          <table>
            <caption>
              {block.title}
              {block.unit ? ` (${block.unit})` : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  {block.x_axis === "date" ? "Data" : "Categoria"}
                </th>
                {visible.map((series) => (
                  <th scope="col" key={series.id}>
                    {series.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.labels.map((label, i) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {visible.map((s) => (
                    <td key={s.id}>
                      {s.values[i] === null
                        ? "Sem dado"
                        : formatted(s.values[i]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <SeriesPlot block={block} visible={visible} />
      )}
      {onAction && (
        <button
          type="button"
          className="series-ask"
          disabled={!hasData}
          onClick={ask}
        >
          <MessageSquarePlus size={15} aria-hidden="true" /> Analisar séries no
          chat
        </button>
      )}
    </div>
  );
}
