/**
 * Planning blocks (1.1.2): Gantt chart, month calendar, 2x2 priority matrix and tree.
 *
 * Like every block they only draw validated JSON. What the person does on them is kept in the
 * block's `values`: the task or event they opened, the zoom of the Gantt, the month on screen, the
 * quadrant each card was dragged to and the branches they folded. The agent reads those back.
 */
import React, { useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Diamond,
  GripVertical,
  MessageSquarePlus,
} from "lucide-react";
import type { Interaction } from "../types";
import { intlLocale, t } from "../i18n";
import "./planning.css";

type Base = { id: string; title: string };
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export type GanttTask = {
  id: string;
  label: string;
  start: string;
  end: string;
  progress?: number;
  group?: string;
  owner?: string;
  milestone?: boolean;
  depends_on?: string[];
};
export type CalendarEvent = {
  id: string;
  label: string;
  date: string;
  end?: string | null;
  time?: string | null;
  tone?: Tone;
  detail?: string;
};
export type MatrixItem = { id: string; label: string; quadrant: string; detail?: string };
export type TreeNode = {
  id: string;
  label: string;
  parent?: string | null;
  detail?: string;
  tone?: Tone;
};
export type PlanningBlock = Base &
  (
    | { type: "gantt"; tasks: GanttTask[]; today?: string | null }
    | { type: "calendar"; month?: string | null; events: CalendarEvent[] }
    | {
        type: "matrix";
        x_axis: string;
        y_axis: string;
        quadrants: { id: string; label: string; hint?: string }[];
        items: MatrixItem[];
      }
    | { type: "tree"; nodes: TreeNode[] }
  );

export const planningTypes = new Set(["gantt", "calendar", "matrix", "tree"]);
export function isPlanningBlock(block: { type: string }): block is PlanningBlock {
  return planningTypes.has(block.type);
}

type Props = {
  block: PlanningBlock;
  state: Interaction;
  change: (patch: Partial<Interaction>) => void;
  onAction?: (text: string) => void;
};

const DAY = 86_400_000;
/** Days since the epoch of an ISO date, read as UTC so a time zone never shifts it. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}
export function isoOfDay(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}
function formatDay(iso: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  return new Date(dayNumber(iso) * DAY).toLocaleDateString(intlLocale(), { timeZone: "UTC", ...options });
}
const todayIso = () => {
  const now = new Date();
  return isoOfDay(Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY));
};

function AskButton({ text, onAction, label }: { text: string; onAction?: (text: string) => void; label?: string }) {
  if (!onAction) return null;
  return (
    <button className="btn small ghost plan-ask" onClick={() => onAction(text)}>
      <MessageSquarePlus size={15} /> {label ?? t("Discutir no chat")}
    </button>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Gantt                                                                                      */
/* ------------------------------------------------------------------------------------------ */

type Scale = "day" | "week" | "month";
const PX_PER_DAY: Record<Scale, number> = { day: 30, week: 13, month: 4.5 };

/** The span the chart covers (padded by a day on each side) and the scale that fits it. */
export function ganttFrame(tasks: GanttTask[]) {
  const first = Math.min(...tasks.map((task) => dayNumber(task.start))) - 1;
  const last = Math.max(...tasks.map((task) => dayNumber(task.end))) + 1;
  const days = last - first + 1;
  const scale: Scale = days <= 24 ? "day" : days <= 150 ? "week" : "month";
  return { first, last, days, scale };
}

function ticks(first: number, last: number, scale: Scale) {
  const out: { day: number; label: string }[] = [];
  for (let day = first; day <= last; day++) {
    const iso = isoOfDay(day);
    const date = new Date(day * DAY);
    if (scale === "day") out.push({ day, label: String(date.getUTCDate()) });
    else if (scale === "week" && date.getUTCDay() === 1) out.push({ day, label: formatDay(iso) });
    else if (scale === "month" && date.getUTCDate() === 1)
      out.push({ day, label: formatDay(iso, { month: "short", year: "2-digit" }) });
  }
  return out;
}

function GanttView({ block, state, change, onAction }: Props & { block: Extract<PlanningBlock, { type: "gantt" }> }) {
  const values = state.values ?? {};
  const frame = useMemo(() => ganttFrame(block.tasks), [block.tasks]);
  const scale = (["day", "week", "month"] as Scale[]).includes(values.scale as Scale)
    ? (values.scale as Scale)
    : frame.scale;
  const px = PX_PER_DAY[scale];
  const width = Math.max(320, Math.round(frame.days * px));
  const selected = block.tasks.find((task) => task.id === values.task);
  const labels = new Map(block.tasks.map((task) => [task.id, task.label]));
  const today = block.today ?? todayIso();
  const todayDay = dayNumber(today);
  const showToday = todayDay >= frame.first && todayDay <= frame.last;
  const set = (key: string, value: string) => change({ values: { ...values, [key]: value } });
  // Rows in the order given, with a group header each time the group changes.
  const rows: ({ kind: "group"; label: string } | { kind: "task"; task: GanttTask })[] = [];
  let group: string | undefined;
  for (const task of block.tasks) {
    if ((task.group ?? "") !== (group ?? "") && task.group) rows.push({ kind: "group", label: task.group });
    group = task.group ?? "";
    rows.push({ kind: "task", task });
  }
  // Positions as a share of the span: the chart fills the block and, zoomed in, scrolls sideways.
  const pct = (days: number) => `${(days / frame.days) * 100}%`;
  const left = (iso: string) => pct(dayNumber(iso) - frame.first);
  const done = block.tasks.filter((task) => (task.progress ?? 0) >= 100).length;
  return (
    <div className="plan-gantt">
      <div className="plan-toolbar">
        <span className="chip">
          {t("{n} de {total} concluídas", { n: done, total: block.tasks.length })}
        </span>
        <div className="atlas-segmented" role="group" aria-label={t("Escala do cronograma")}>
          {(["day", "week", "month"] as Scale[]).map((option) => (
            <button
              key={option}
              aria-pressed={scale === option}
              className={scale === option ? "active" : ""}
              onClick={() => set("scale", option)}
            >
              {option === "day" ? t("Dias") : option === "week" ? t("Semanas") : t("Meses")}
            </button>
          ))}
        </div>
      </div>
      <div className="gantt-scroll" tabIndex={0} aria-label={t("Cronograma de {title}", { title: block.title })}>
        <div className="gantt-grid" style={{ ["--gantt-width" as string]: `${width}px` }}>
          <div className="gantt-corner">{t("Tarefa")}</div>
          <div className="gantt-axis" aria-hidden="true">
            {ticks(frame.first, frame.last, scale).map((tick) => (
              <span key={tick.day} style={{ left: pct(tick.day - frame.first) }}>
                {tick.label}
              </span>
            ))}
          </div>
          {rows.map((row, index) =>
            row.kind === "group" ? (
              <div className="gantt-group" key={`g${index}`}>
                {row.label}
              </div>
            ) : (
              <React.Fragment key={row.task.id}>
                <div className={`gantt-label${selected?.id === row.task.id ? " active" : ""}`}>
                  <span>{row.task.label}</span>
                  {row.task.owner && <small>{row.task.owner}</small>}
                </div>
                <div className="gantt-lane">
                  {showToday && <i className="gantt-today" style={{ left: pct(todayDay - frame.first + 0.5) }} />}
                  <button
                    className={`gantt-bar${row.task.milestone ? " milestone" : ""}${
                      selected?.id === row.task.id ? " active" : ""
                    }${(row.task.progress ?? 0) >= 100 ? " done" : ""}`}
                    style={{
                      left: left(row.task.start),
                      width: row.task.milestone ? undefined : pct(dayNumber(row.task.end) - dayNumber(row.task.start) + 1),
                      ["--progress" as string]: `${row.task.progress ?? 0}%`,
                      animationDelay: `${Math.min(index, 12) * 35}ms`,
                    }}
                    aria-pressed={selected?.id === row.task.id}
                    aria-label={t("{task}: {start} a {end}, {progress}% concluído", {
                      task: row.task.label,
                      start: formatDay(row.task.start),
                      end: formatDay(row.task.end),
                      progress: row.task.progress ?? 0,
                    })}
                    onClick={() => set("task", row.task.id)}
                  >
                    {row.task.milestone ? <Diamond size={14} /> : <span className="gantt-fill" />}
                  </button>
                </div>
              </React.Fragment>
            ),
          )}
        </div>
      </div>
      {selected && (
        <div className="plan-detail" aria-live="polite">
          <strong>{selected.label}</strong>
          <span>
            {selected.milestone
              ? formatDay(selected.start, { dateStyle: "medium" })
              : t("{start} a {end} · {days} dias", {
                  start: formatDay(selected.start, { dateStyle: "medium" }),
                  end: formatDay(selected.end, { dateStyle: "medium" }),
                  days: dayNumber(selected.end) - dayNumber(selected.start) + 1,
                })}
          </span>
          <span>{t("{progress}% concluído", { progress: selected.progress ?? 0 })}</span>
          {selected.owner && <span>{t("Responsável: {owner}", { owner: selected.owner })}</span>}
          {!!selected.depends_on?.length && (
            <span>
              {t("Depende de: {tasks}", {
                tasks: selected.depends_on.map((id) => labels.get(id) ?? id).join(", "),
              })}
            </span>
          )}
          <AskButton
            onAction={onAction}
            text={t("Sobre a tarefa “{task}” do cronograma “{title}”: ", { task: selected.label, title: block.title })}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Calendar                                                                                   */
/* ------------------------------------------------------------------------------------------ */

const monthOf = (iso: string) => iso.slice(0, 7);
/** First letter in capitals, the rest as the locale wrote it ("dezembro de 2026" → "Dezembro de 2026"). */
const capitalise = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
/** Every day an event covers (a multi-day event appears on each of its days). */
export function eventDays(event: CalendarEvent): string[] {
  const start = dayNumber(event.date);
  const end = event.end ? Math.min(dayNumber(event.end), start + 62) : start;
  const out: string[] = [];
  for (let day = start; day <= end; day++) out.push(isoOfDay(day));
  return out;
}

function CalendarView({ block, state, change, onAction }: Props & { block: Extract<PlanningBlock, { type: "calendar" }> }) {
  const values = state.values ?? {};
  const sorted = useMemo(
    () => [...block.events].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? ""))),
    [block.events],
  );
  const month = /^\d{4}-\d{2}$/.test(values.month ?? "") ? values.month! : block.month ?? monthOf(sorted[0].date);
  const set = (patch: { [key: string]: string }) => change({ values: { ...values, ...patch } });
  const first = dayNumber(month + "-01");
  const lead = new Date(first * DAY).getUTCDay(); // Sunday first, as Brazilian calendars print it
  const length = dayNumber(shiftMonth(month, 1) + "-01") - first;
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of sorted)
    for (const day of eventDays(event)) byDay.set(day, [...(byDay.get(day) ?? []), event]);
  const inMonth = sorted.filter((event) => eventDays(event).some((day) => monthOf(day) === month));
  const selected = block.events.find((event) => event.id === values.event);
  const title = capitalise(
    new Date(first * DAY).toLocaleDateString(intlLocale(), { timeZone: "UTC", month: "long", year: "numeric" }),
  );
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 10, 1 + i)).toLocaleDateString(intlLocale(), { timeZone: "UTC", weekday: "short" }),
  );
  const today = todayIso();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, i) => isoOfDay(first + i)),
  ];
  while (cells.length % 7) cells.push(null);
  const chip = (event: CalendarEvent) => (
    <button
      key={event.id}
      className={`cal-event tone-${event.tone ?? "neutral"}${selected?.id === event.id ? " active" : ""}`}
      aria-pressed={selected?.id === event.id}
      onClick={() => set({ event: event.id })}
      title={event.label}
    >
      {event.time && <b>{event.time}</b>} {event.label}
    </button>
  );
  return (
    <div className="plan-calendar">
      <div className="plan-toolbar">
        <button className="icon-button" aria-label={t("Mês anterior")} onClick={() => set({ month: shiftMonth(month, -1) })}>
          <ChevronLeft size={18} />
        </button>
        <strong className="cal-title" aria-live="polite">
          {title}
        </strong>
        <button className="icon-button" aria-label={t("Próximo mês")} onClick={() => set({ month: shiftMonth(month, 1) })}>
          <ChevronRight size={18} />
        </button>
        <span className="chip">
          <CalendarDays size={13} /> {t("{n} eventos neste mês", { n: inMonth.length })}
        </span>
      </div>
      <div className="cal-grid" role="grid" aria-label={title}>
        {weekdays.map((day) => (
          <div className="cal-weekday" role="columnheader" key={day}>
            {day}
          </div>
        ))}
        {cells.map((day, index) =>
          day ? (
            <div
              role="gridcell"
              key={day}
              className={`cal-day${day === today ? " today" : ""}${byDay.get(day)?.length ? " busy" : ""}`}
            >
              <span className="cal-number">{Number(day.slice(8))}</span>
              {byDay.get(day)?.slice(0, 3).map(chip)}
              {(byDay.get(day)?.length ?? 0) > 3 && (
                <small>{t("+{n} mais", { n: byDay.get(day)!.length - 3 })}</small>
              )}
            </div>
          ) : (
            <div role="gridcell" className="cal-day blank" key={`e${index}`} aria-hidden="true" />
          ),
        )}
      </div>
      <ol className="cal-agenda" aria-label={t("Agenda do mês")}>
        {inMonth.length === 0 && <li className="muted">{t("Nenhum evento neste mês.")}</li>}
        {inMonth.map((event) => (
          <li key={event.id}>
            <span className="cal-when">
              {capitalise(formatDay(event.date, { weekday: "short", day: "2-digit", month: "short" }))}
              {event.time && ` · ${event.time}`}
            </span>
            {chip(event)}
          </li>
        ))}
      </ol>
      {selected && (
        <div className="plan-detail" aria-live="polite">
          <strong>{selected.label}</strong>
          <span>
            {formatDay(selected.date, { dateStyle: "full" })}
            {selected.end && selected.end !== selected.date && ` → ${formatDay(selected.end, { dateStyle: "medium" })}`}
            {selected.time && ` · ${selected.time}`}
          </span>
          {selected.detail && <p>{selected.detail}</p>}
          <AskButton
            onAction={onAction}
            text={t("Sobre o evento “{event}” ({date}) do calendário “{title}”: ", {
              event: selected.label,
              date: selected.date,
              title: block.title,
            })}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Matrix                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Where an arrow key moves a card: quadrants are 0 1 / 2 3 in reading order. */
export function neighbour(index: number, key: string): number {
  const row = Math.floor(index / 2),
    col = index % 2;
  if (key === "ArrowLeft") return row * 2 + Math.max(0, col - 1);
  if (key === "ArrowRight") return row * 2 + Math.min(1, col + 1);
  if (key === "ArrowUp") return Math.max(0, row - 1) * 2 + col;
  if (key === "ArrowDown") return Math.min(1, row + 1) * 2 + col;
  return index;
}

function MatrixView({ block, state, change, onAction }: Props & { block: Extract<PlanningBlock, { type: "matrix" }> }) {
  const values = state.values ?? {};
  const [over, setOver] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const where = (item: MatrixItem) =>
    block.quadrants.some((q) => q.id === values[item.id]) ? values[item.id] : item.quadrant;
  const move = (item: MatrixItem, quadrant: string) => {
    if (where(item) === quadrant) return;
    const next = { ...values };
    if (quadrant === item.quadrant) delete next[item.id];
    else next[item.id] = quadrant;
    change({ values: next });
    const label = block.quadrants.find((q) => q.id === quadrant)?.label ?? quadrant;
    setSaid(t("{item} movido para {quadrant}", { item: item.label, quadrant: label }));
  };
  const summary = block.quadrants
    .map((q) => `${q.label}: ${block.items.filter((item) => where(item) === q.id).map((item) => item.label).join(", ") || "—"}`)
    .join("\n");
  const help = `${block.id}-matrix-help`;
  return (
    <div className="plan-matrix">
      <p className="sr-only" id={help}>
        {t("Arraste os cartões entre os quadrantes, ou use as setas do teclado num cartão.")}
      </p>
      <div className="matrix-frame">
        <div className="matrix-y" aria-hidden="true">
          <span>{block.y_axis} ↑</span>
        </div>
        <div className="matrix-grid">
          {block.quadrants.map((quadrant, index) => {
            const items = block.items.filter((item) => where(item) === quadrant.id);
            return (
              <section
                key={quadrant.id}
                className={`matrix-cell q${index}${over === quadrant.id ? " over" : ""}`}
                aria-label={t("{quadrant}: {n} itens", { quadrant: quadrant.label, n: items.length })}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes("application/x-atlas-matrix")) return;
                  event.preventDefault();
                  setOver(quadrant.id);
                }}
                onDragLeave={() => setOver((current) => (current === quadrant.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setOver(null);
                  const id = event.dataTransfer.getData("application/x-atlas-matrix");
                  const item = block.items.find((candidate) => candidate.id === id);
                  if (item) move(item, quadrant.id);
                }}
              >
                <header>
                  <strong>{quadrant.label}</strong>
                  <small>{items.length}</small>
                </header>
                {quadrant.hint && <p className="matrix-hint">{quadrant.hint}</p>}
                <div className="matrix-items">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="matrix-card"
                      draggable
                      tabIndex={0}
                      role="button"
                      aria-describedby={help}
                      title={item.detail || item.label}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-atlas-matrix", item.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onKeyDown={(event) => {
                        const target = neighbour(index, event.key);
                        if (target === index) return;
                        event.preventDefault();
                        move(item, block.quadrants[target].id);
                      }}
                    >
                      <GripVertical size={13} aria-hidden="true" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="matrix-x" aria-hidden="true">
          {block.x_axis} →
        </div>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
      <AskButton
        onAction={onAction}
        label={t("Analisar a matriz no chat")}
        text={`${t("Analise a matriz “{title}” como está agora:", { title: block.title })}\n${summary}`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Tree                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export function treeChildren(nodes: TreeNode[]) {
  const children = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const key = node.parent ?? null;
    children.set(key, [...(children.get(key) ?? []), node]);
  }
  return children;
}

function TreeView({ block, state, change, onAction }: Props & { block: Extract<PlanningBlock, { type: "tree" }> }) {
  const values = state.values ?? {};
  const children = useMemo(() => treeChildren(block.nodes), [block.nodes]);
  const parents = block.nodes.filter((node) => children.get(node.id)?.length);
  const closed = (id: string) => values[id] === "closed";
  const toggle = (id: string) => {
    const next = { ...values };
    if (closed(id)) delete next[id];
    else next[id] = "closed";
    change({ values: next });
  };
  const all = (fold: boolean) =>
    change({ values: fold ? Object.fromEntries(parents.map((node) => [node.id, "closed"])) : {} });
  const descendants = (id: string): number =>
    (children.get(id) ?? []).reduce((sum, child) => sum + 1 + descendants(child.id), 0);
  const focus = useRef<string | null>(null);
  const render = (parent: string | null, depth: number): React.ReactNode =>
    (children.get(parent) ?? []).map((node) => {
      const kids = children.get(node.id) ?? [];
      const open = kids.length > 0 && !closed(node.id);
      return (
        <li
          key={node.id}
          role="treeitem"
          aria-expanded={kids.length ? open : undefined}
          aria-level={depth + 1}
          className={`tree-node depth-${Math.min(depth, 4)}`}
        >
          <div className={`tree-card tone-${node.tone ?? "neutral"}`}>
            {kids.length > 0 ? (
              <button
                className="icon-button tree-toggle"
                aria-label={open ? t("Recolher {node}", { node: node.label }) : t("Expandir {node}", { node: node.label })}
                onClick={() => {
                  focus.current = node.id;
                  toggle(node.id);
                }}
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="tree-leaf" aria-hidden="true" />
            )}
            <div>
              <strong>{node.label}</strong>
              {node.detail && <small>{node.detail}</small>}
            </div>
            {kids.length > 0 && !open && <span className="chip">+{descendants(node.id)}</span>}
          </div>
          {open && (
            <ul role="group" className="tree-children">
              {render(node.id, depth + 1)}
            </ul>
          )}
        </li>
      );
    });
  return (
    <div className="plan-tree">
      {parents.length > 0 && (
        <div className="plan-toolbar">
          <button className="btn small ghost" onClick={() => all(false)}>
            <ChevronsUpDown size={15} /> {t("Expandir tudo")}
          </button>
          <button className="btn small ghost" onClick={() => all(true)}>
            <ChevronsDownUp size={15} /> {t("Recolher tudo")}
          </button>
        </div>
      )}
      <ul role="tree" aria-label={block.title} className="tree-root">
        {render(null, 0)}
      </ul>
      <AskButton
        onAction={onAction}
        text={t("Sobre a estrutura “{title}”: ", { title: block.title })}
      />
    </div>
  );
}

export function PlanningView(props: Props) {
  switch (props.block.type) {
    case "gantt":
      return <GanttView {...props} block={props.block} />;
    case "calendar":
      return <CalendarView {...props} block={props.block} />;
    case "matrix":
      return <MatrixView {...props} block={props.block} />;
    case "tree":
      return <TreeView {...props} block={props.block} />;
  }
}
