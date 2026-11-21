type Base = { id: string; title: string };
type Quantity = { unit?: string };
export type Amount = { label: string; value: number };
export type Reading = { label: string; value: number | null };
export type Coordinate = { label: string; x: number; y: number };
export type SizedCoordinate = Coordinate & { size: number };
export type RadarAxis = Amount & { max: number };
export type DashboardPeriod = {
  id: string;
  label: string;
  metrics: (Reading & Quantity)[];
  breakdown: Amount[];
};
type ItemPlot = Quantity & { items: Amount[] };
type PointPlot = { x_label: string; y_label: string };
type Shapes = {
  pie: ItemPlot;
  donut: ItemPlot;
  treemap: ItemPlot;
  funnel: ItemPlot;
  ranking: ItemPlot;
  waterfall: ItemPlot & { start?: number };
  scatter: PointPlot & { points: Coordinate[] };
  bubble: PointPlot & { points: SizedCoordinate[] };
  radar: { axes: RadarAxis[] };
  heatmap: Quantity & {
    rows: string[];
    columns: string[];
    values: (number | null)[][];
  };
  histogram: Quantity & { samples: (number | null)[]; bins?: number };
  gauge: Quantity & { min?: number; max?: number; value: number };
  progress: Quantity & { completed: number; total: number };
  sparkline: Quantity & { points: Reading[] };
  dashboard: Quantity & { periods: DashboardPeriod[]; breakdown_label: string };
};
export type AnalyticsKind = keyof Shapes;
export type AnalyticsBlock<K extends AnalyticsKind = AnalyticsKind> = {
  [T in K]: Base & { type: T } & Shapes[T];
}[K];

const exact = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 15 });
const percentage = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});
export const percent = (fraction: number) => percentage.format(fraction);
export const fmt = (value: number | null, unit = "") =>
  value === null
    ? "Sem dado"
    : [exact.format(value), unit].filter(Boolean).join(" ");
export const totalOf = (items: Amount[]) =>
  items.reduce((sum, item) => sum + item.value, 0);
export const ranked = (items: Amount[]) =>
  [...items].sort((a, b) => b.value - a.value);
export function histogram(samples: (number | null)[], count: number) {
  const values = samples.filter((n): n is number => n !== null);
  if (!values.length) return [];
  const min = Math.min(...values),
    max = Math.max(...values);
  if (min === max)
    return [{ low: min, high: max, count: values.length, inclusive: true }];
  const edge = (i: number) =>
    i === count ? max : min + (i / count) * (max - min);
  const bins = Array.from({ length: count }, (_, i) => ({
    low: edge(i),
    high: edge(i + 1),
    count: 0,
    inclusive: i === count - 1,
  }));
  // Search the actual floating-point boundaries so table labels and membership agree.
  for (const n of values) {
    const bucket = bins.find((bin) => n < bin.high || bin.inclusive)!;
    bucket.count++;
  }
  return bins;
}
export function bucketLabel(bin: ReturnType<typeof histogram>[number]) {
  if (bin.low === bin.high) return fmt(bin.low);
  return (
    "[" + fmt(bin.low) + " … " + fmt(bin.high) + (bin.inclusive ? "]" : ")")
  );
}
export function waterfall(start: number, items: Amount[]) {
  let running = start;
  const steps = items.map(({ label, value }) => {
    const previous = running;
    running += value;
    return { label, from: previous, to: running, value, change: true };
  });
  return [
    { label: "Inicial", from: 0, to: start, value: start, change: false },
    ...steps,
    { label: "Final", from: 0, to: running, value: running, change: false },
  ];
}
export type Tile = Amount & { x: number; y: number; w: number; h: number };
export function treemap(items: Amount[], width = 480, height = 200): Tile[] {
  const portions = ranked(items.filter((p) => p.value > 0));
  const split = (
    group: Amount[],
    x: number,
    y: number,
    w: number,
    h: number,
  ): Tile[] => {
    if (!group.length) return [];
    if (group.length === 1) return [{ ...group[0], x, y, w, h }];
    const sum = totalOf(group);
    let amount = group[0].value,
      cut = 1;
    while (
      cut < group.length - 1 &&
      Math.abs(amount + group[cut].value - sum / 2) < Math.abs(amount - sum / 2)
    ) {
      amount += group[cut++].value;
    }
    const fraction = amount / sum;
    const first = group.slice(0, cut),
      second = group.slice(cut);
    if (w >= h)
      return [
        ...split(first, x, y, w * fraction, h),
        ...split(second, x + w * fraction, y, w * (1 - fraction), h),
      ];
    return [
      ...split(first, x, y, w, h * fraction),
      ...split(second, x, y + h * fraction, w, h * (1 - fraction)),
    ];
  };
  return split(portions, 0, 0, width, height);
}

export type TableData = { columns: string[]; rows: string[][] };
export function dataFor(block: AnalyticsBlock, periodId?: string): TableData {
  const unit = "unit" in block ? block.unit : "";
  const val = (n: number | null) => fmt(n, unit);
  switch (block.type) {
    case "donut":
    case "pie":
    case "treemap": {
      const total = totalOf(block.items);
      return {
        columns: ["Categoria", "Valor", "Participação"],
        rows: block.items.map((p) => [
          p.label,
          val(p.value),
          total > 0 ? percent(p.value / total) : "—",
        ]),
      };
    }
    case "ranking": {
      const sorted = ranked(block.items);
      return {
        columns: ["Posição", "Item", "Valor"],
        rows: sorted.map((p) => [
          String(sorted.findIndex((q) => q.value === p.value) + 1),
          p.label,
          val(p.value),
        ]),
      };
    }
    case "funnel":
      return {
        columns: ["Etapa", "Volume", "Conversão da etapa anterior"],
        rows: block.items.map((p, i) => [
          p.label,
          val(p.value),
          i && block.items[i - 1].value
            ? percent(p.value / block.items[i - 1].value)
            : "—",
        ]),
      };
    case "waterfall":
      return {
        columns: ["Etapa", "Variação", "Saldo"],
        rows: waterfall(block.start ?? 0, block.items).map((p) => [
          p.label,
          p.change ? val(p.value) : "—",
          val(p.to),
        ]),
      };
    case "scatter":
      return {
        columns: ["Ponto", block.x_label, block.y_label],
        rows: block.points.map((p) => [p.label, fmt(p.x), fmt(p.y)]),
      };
    case "bubble":
      return {
        columns: ["Ponto", block.x_label, block.y_label, "Tamanho"],
        rows: block.points.map((p) => [
          p.label,
          fmt(p.x),
          fmt(p.y),
          fmt(p.size),
        ]),
      };
    case "radar":
      return {
        columns: ["Eixo", "Valor", "Máximo", "Atingimento"],
        rows: block.axes.map((a) => [
          a.label,
          fmt(a.value),
          fmt(a.max),
          percent(a.value / a.max),
        ]),
      };
    case "heatmap":
      return {
        columns: ["Linha", ...block.columns],
        rows: block.rows.map((row, i) => [row, ...block.values[i].map(val)]),
      };
    case "histogram":
      return {
        columns: [unit ? "Faixa (" + unit + ")" : "Faixa", "Observações"],
        rows: [
          ...histogram(block.samples, block.bins ?? 8).map((b) => [
            bucketLabel(b),
            String(b.count),
          ]),
          ["Sem dado", String(block.samples.filter((n) => n === null).length)],
        ],
      };
    case "gauge":
      return {
        columns: ["Medida", "Valor"],
        rows: [
          ["Mínimo", val(block.min ?? 0)],
          ["Atual", val(block.value)],
          ["Máximo", val(block.max ?? 100)],
        ],
      };
    case "progress":
      return {
        columns: ["Medida", "Valor"],
        rows: [
          ["Concluído", val(block.completed)],
          ["Restante", val(block.total - block.completed)],
          ["Meta", val(block.total)],
        ],
      };
    case "sparkline":
      return {
        columns: ["Período", "Valor"],
        rows: block.points.map((p) => [p.label, val(p.value)]),
      };
    case "dashboard": {
      const period =
        block.periods.find((p) => p.id === periodId) ?? block.periods[0];
      return {
        columns: ["Grupo", "Indicador", "Valor"],
        rows: [
          ...period.metrics.map((m) => [
            "Indicadores",
            m.label,
            fmt(m.value, m.unit),
          ]),
          ...period.breakdown.map((m) => [
            block.breakdown_label,
            m.label,
            val(m.value),
          ]),
        ],
      };
    }
  }
}
