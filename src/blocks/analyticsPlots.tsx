import React from "react";
import type { AnalyticsBlock, RadarAxis, Reading } from "./analyticsData";
import {
  bucketLabel,
  fmt,
  histogram,
  percent,
  totalOf,
  treemap,
  waterfall,
} from "./analyticsData";
import { t } from "../i18n";

export const ink = (i: number) => "var(--ana-" + (i % 6) + ")";
const sumLabel = (name: string, value: string) => name + " · " + value;
function Frame({
  label,
  box = "0 0 480 225",
  children,
}: {
  label: string;
  box?: string;
  children: React.ReactNode;
}) {
  return (
    <svg className="ana-plot" viewBox={box} role="img" aria-label={label}>
      <title>{label}</title>
      {children}
    </svg>
  );
}
function pos(i: number, n: number, r: number, x: number, y: number) {
  const a = (i / n) * 2 * Math.PI - Math.PI / 2;
  return [x + Math.cos(a) * r, y + Math.sin(a) * r];
}
function scale(min: number, max: number, a: number, b: number) {
  return (v: number) =>
    max === min ? (a + b) / 2 : a + ((v - min) / (max - min)) * (b - a);
}
export function Slices({
  b,
  selected,
}: {
  b: AnalyticsBlock<"pie" | "donut">;
  selected: string;
}) {
  const total = totalOf(b.items),
    ring = b.type === "donut";
  if (!total)
    return <p>{t("Total zero. As categorias estão na tabela de valores.")}</p>;
  let running = 0;
  return (
    <Frame label={b.title} box="0 0 340 200">
      {b.items.map((item, i) => {
        if (item.value === 0) return null;
        const portion = item.value / total,
          start = running;
        running += portion;
        const a = pos(start, 1, 89, 170, 100),
          z = pos(running, 1, 89, 170, 100);
        const opacity = selected && selected !== item.label ? 0.25 : 1;
        const title = (
          <title>
            {sumLabel(
              item.label,
              fmt(item.value, b.unit) + " · " + percent(portion),
            )}
          </title>
        );
        if (portion === 1)
          return (
            <circle
              key={i}
              cx="170"
              cy="100"
              r="89"
              fill={ink(i)}
              opacity={opacity}
            >
              {title}
            </circle>
          );
        return (
          <path
            key={i}
            fill={ink(i)}
            opacity={opacity}
            stroke="var(--surface)"
            d={`M170 100 L${a.join(" ")} A89 89 0 ${portion > 0.5 ? 1 : 0} 1 ${z.join(" ")} Z`}
          >
            {title}
          </path>
        );
      })}
      {ring && (
        <g>
          <circle cx="170" cy="100" r="54" fill="var(--surface)" />
          <text x="170" y="95" textAnchor="middle">
            {t("Total")}
          </text>
          <text x="170" y="117" className="ana-dial-number" textAnchor="middle">
            {fmt(total)}
          </text>
        </g>
      )}
    </Frame>
  );
}
export function Coordinates({
  b,
  selected,
}: {
  b: AnalyticsBlock<"scatter" | "bubble">;
  selected: string;
}) {
  const xs = b.points.map((p) => p.x),
    ys = b.points.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const x = scale(minX, maxX, 83, 443),
    y = scale(minY, maxY, 157, 27);
  const biggest =
    b.type === "bubble" ? Math.max(...b.points.map((p) => p.size)) : 0;
  return (
    <Frame label={b.title}>
      <path d="M60 9V179H466" className="ana-axis" />
      {[...new Set([minY, (minY + maxY) / 2, maxY])].map((v) => (
        <g key={v}>
          <path d={`M60 ${y(v)}H466`} className="ana-grid" />
          <text x="55" y={y(v) + 4} textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      {[...new Set([minX, (minX + maxX) / 2, maxX])].map((v) => (
        <text key={v} x={x(v)} y="195" textAnchor="middle">
          {fmt(v)}
        </text>
      ))}
      <text x="260" y="216" textAnchor="middle">
        {b.x_label}
      </text>
      <text transform="translate(13 88) rotate(-90)" textAnchor="middle">
        {b.y_label}
      </text>
      {[...b.points]
        .sort(
          (a, c) =>
            ("size" in c ? Number(c.size) : 0) -
            ("size" in a ? Number(a.size) : 0),
        )
        .map((p) => {
          const sized = "size" in p && typeof p.size === "number";
          const r = sized
            ? biggest
              ? Math.sqrt(Number(p.size) / biggest) * 17
              : 0
            : 5;
          const active = selected === p.label;
          return (
            <circle
              key={p.label}
              cx={x(p.x)}
              cy={y(p.y)}
              r={r}
              fill={ink(active ? 1 : 0)}
              fillOpacity={selected && !active ? 0.2 : 0.75}
              stroke="var(--surface)"
            >
              <title>
                {[
                  p.label,
                  b.x_label + " " + fmt(p.x),
                  b.y_label + " " + fmt(p.y),
                  sized ? t("Tamanho") + " " + fmt(Number(p.size)) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </title>
            </circle>
          );
        })}
    </Frame>
  );
}
export function Radar({ axes, title }: { axes: RadarAxis[]; title: string }) {
  const p = (i: number, r: number) => pos(i, axes.length, r, 240, 108);
  const polygon = (values: number[]) =>
    values.map((v, i) => p(i, 82 * v).join(",")).join(" ");
  return (
    <Frame label={title}>
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <polygon
          key={v}
          points={polygon(axes.map(() => v))}
          className="ana-grid"
        />
      ))}
      {axes.map((a, i) => {
        const [x, y] = p(i, 82),
          [tx, ty] = p(i, 99);
        return (
          <g key={a.label}>
            <line x1="240" y1="108" x2={x} y2={y} className="ana-axis" />
            <text
              x={tx}
              y={ty + 4}
              textAnchor={
                Math.abs(tx - 240) < 1 ? "middle" : tx < 240 ? "end" : "start"
              }
            >
              {a.label.length > 16 ? a.label.slice(0, 15) + "…" : a.label}
            </text>
          </g>
        );
      })}
      <polygon
        points={polygon(axes.map((a) => a.value / a.max))}
        fill={ink(0)}
        fillOpacity=".25"
        stroke={ink(0)}
        strokeWidth="2"
      />
      {axes.map((a, i) => {
        const [x, y] = p(i, (82 * a.value) / a.max);
        return (
          <circle key={a.label} cx={x} cy={y} r="3" fill={ink(0)}>
            <title>
              {a.label} · {fmt(a.value)} / {fmt(a.max)}
            </title>
          </circle>
        );
      })}
    </Frame>
  );
}
export function Histogram({ b }: { b: AnalyticsBlock<"histogram"> }) {
  const bins = histogram(b.samples, b.bins ?? 8);
  if (!bins.length) return <p>{t("Sem observações numéricas.")}</p>;
  const max = Math.max(...bins.map((v) => v.count)),
    w = 430 / bins.length;
  return (
    <Frame label={b.title} box="0 0 480 195">
      <path d="M36 15V160H466" className="ana-axis" />
      <text x="31" y="23" textAnchor="end">
        {max}
      </text>
      {bins.map((bin, i) => {
        const h = (139 * bin.count) / max;
        return (
          <rect
            key={i}
            x={36 + i * w}
            y={160 - h}
            width={w}
            height={h}
            fill={ink(0)}
            stroke="var(--surface)"
          >
            <title>
              {t("{range} · {n} observações", {
                range: bucketLabel(bin),
                n: bin.count,
              })}
            </title>
          </rect>
        );
      })}
      <text x="36" y="182">
        {fmt(bins[0].low, b.unit)}
      </text>
      <text x="466" y="182" textAnchor="end">
        {fmt(bins[bins.length - 1].high, b.unit)}
      </text>
    </Frame>
  );
}
export function Waterfall({ b }: { b: AnalyticsBlock<"waterfall"> }) {
  const points = waterfall(b.start ?? 0, b.items);
  const amounts = [0, ...points.map((p) => p.to)];
  const min = Math.min(...amounts),
    max = Math.max(...amounts),
    y = scale(min, max, 179, 19);
  const w = 418 / points.length,
    bw = w * 0.7;
  return (
    <Frame label={b.title} box="0 0 480 207">
      <path d={`M52 ${y(0)}H474`} className="ana-axis" />
      {[...new Set([min, max])].map((v) => (
        <text key={v} x="49" y={y(v) + 4} textAnchor="end">
          {fmt(v)}
        </text>
      ))}
      {points.map((p, i) => {
        const x = 54 + i * w,
          a = y(p.from),
          z = y(p.to);
        return (
          <g key={i}>
            <rect
              x={x}
              y={Math.min(a, z)}
              height={Math.max(1, Math.abs(z - a))}
              width={bw}
              fill={ink(p.change ? (p.value >= 0 ? 0 : 3) : 4)}
            >
              <title>
                {p.label} · {p.change && t("Variação") + " "}
                {fmt(p.value, b.unit)} · {t("Saldo")} {fmt(p.to, b.unit)}
              </title>
            </rect>
            {i < points.length - 1 && (
              <line
                x1={x + bw}
                x2={x + w}
                y1={z}
                y2={z}
                stroke="currentColor"
                strokeDasharray="2 2"
              />
            )}
            {points.length < 18 && (
              <text x={x + bw / 2} y="200" textAnchor="middle">
                {i === 0 ? t("Início") : i === points.length - 1 ? t("Fim") : i}
              </text>
            )}
          </g>
        );
      })}
    </Frame>
  );
}
export function Gauge({ b }: { b: AnalyticsBlock<"gauge"> }) {
  const min = b.min ?? 0,
    max = b.max ?? 100;
  const angle = Math.PI * (1 - (b.value - min) / (max - min));
  return (
    <Frame label={b.title} box="0 0 320 160">
      <path d="M55 120 A105 105 0 0 1 265 120" className="ana-dial-track" />
      <path
        d="M55 120 A105 105 0 0 1 265 120"
        fill="none"
        stroke={ink(0)}
        strokeWidth="12"
        pathLength="100"
        strokeDasharray={`${(100 * (b.value - min)) / (max - min)} 100`}
      />
      <line
        x1="160"
        y1="120"
        x2={160 + 91 * Math.cos(angle)}
        y2={120 - 91 * Math.sin(angle)}
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="160" cy="120" r="5" fill="currentColor" />
      <text x="55" y="147" textAnchor="middle">
        {fmt(min)}
      </text>
      <text x="265" y="147" textAnchor="middle">
        {fmt(max)}
      </text>
    </Frame>
  );
}
export function Sparkline({
  points,
  title,
  unit,
}: {
  points: Reading[];
  title: string;
  unit?: string;
}) {
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (!values.length) return <p>{t("Sem medições neste intervalo.")}</p>;
  const y = scale(Math.min(...values), Math.max(...values), 94, 15),
    x = scale(0, points.length - 1, 10, 470);
  const groups: number[][] = [];
  let segment: number[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      segment = [];
    } else {
      if (!segment.length) groups.push(segment);
      segment.push(i);
    }
  });
  return (
    <Frame label={title} box="0 0 480 124">
      {groups.map((indices) => (
        <polyline
          key={indices[0]}
          points={indices
            .map((i) => [x(i), y(points[i].value!)].join(","))
            .join(" ")}
          fill="none"
          stroke={ink(0)}
          strokeWidth="2.5"
        />
      ))}
      {points.map(
        (p, i) =>
          p.value !== null && (
            <circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill={ink(0)}>
              <title>{sumLabel(p.label, fmt(p.value, unit))}</title>
            </circle>
          ),
      )}
      <text x="8" y="117">
        {points[0].label}
      </text>
      <text x="472" y="117" textAnchor="end">
        {points[points.length - 1].label}
      </text>
    </Frame>
  );
}
export function Tiles({
  b,
  selected,
}: {
  b: AnalyticsBlock<"treemap">;
  selected: string;
}) {
  const tiles = treemap(b.items);
  if (!tiles.length)
    return <p>{t("Total zero. Nenhuma área para distribuir.")}</p>;
  return (
    <Frame label={b.title} box="0 0 480 200">
      {tiles.map((tile, i) => (
        <g key={tile.label}>
          <rect
            x={tile.x}
            y={tile.y}
            width={tile.w}
            height={tile.h}
            fill={ink(i)}
            fillOpacity={selected && selected !== tile.label ? 0.2 : 0.85}
            stroke="var(--surface)"
            strokeWidth="2"
          >
            <title>{sumLabel(tile.label, fmt(tile.value, b.unit))}</title>
          </rect>
          {tile.w > 26 && tile.h > 22 && (
            <text
              className="ana-tile-number"
              x={tile.x + tile.w / 2}
              y={tile.y + tile.h / 2 + 4}
              textAnchor="middle"
            >
              {i + 1}
            </text>
          )}
        </g>
      ))}
    </Frame>
  );
}
