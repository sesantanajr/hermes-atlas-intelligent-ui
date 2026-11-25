import React, { useContext, useLayoutEffect, useRef, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { Block, Canvas as CanvasData, Interaction } from "../types";
import { CollectionView } from "./collection";
import { SeriesView } from "./series";
import { ExploreView } from "./explore";
import { SpatialView } from "./spatial";
import { CanvasForm } from "./CanvasForm";
import { CanvasLink, PreviewContext } from "./CanvasLink";
import { StudyView } from "./study";
import { isEditorialBlock, EditorialView } from "./editorial";
import { isAnalyticsBlock, AnalyticsView } from "./analytics";
import { isControlBlock, ControlView } from "./controls";
import { isExperienceBlock } from "./experienceBlocks";
import { ExperienceView } from "./experienceView";
import { isPlanningBlock, PlanningView } from "./planning";
import { TableView } from "./table";
import { BlockTools } from "./BlockChrome";
import { blockTable, toCsv } from "./tabular";
import { downloadTextFile, safeName } from "./exporters";
import { formatNumber, getLocale, t } from "../i18n";

export function calculate(operation: string, values: number[]): number | null {
  let result: number;
  switch (operation) {
    case "sum":
      result = values.reduce((a, b) => a + b, 0);
      break;
    case "product":
      result = values.reduce((a, b) => a * b, 1);
      break;
    case "split":
      if (values[1] === 0) return null;
      result = values[0] / values[1];
      break;
    case "compound":
      result = values[0] * Math.pow(1 + values[1] / 100, values[2]);
      break;
    default:
      return null;
  }
  return Number.isFinite(result) ? result : null;
}
export function barGeometry(values: number[], value: number) {
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values),
    range = max - min || 1,
    zero = (-min / range) * 100;
  return {
    zero,
    left: value < 0 ? ((value - min) / range) * 100 : zero,
    width: (Math.abs(value) / range) * 100,
  };
}
const number = (value: number) => formatNumber(value, 2);
type Props = {
  block: Block;
  state: Interaction;
  change: (block: Block, state: Interaction) => void;
  onAction?: (text: string) => void;
};
type Frame = {
  index: number;
  chrome?: React.ReactNode;
  sectionProps?: React.HTMLAttributes<HTMLElement> & { draggable?: boolean };
  extraClass?: string;
};
/** Classes for the person's layout choices: width and folding (1.1.2). */
function layoutClass(state: Interaction, editable: boolean) {
  return [
    state.width === "half" ? "w-half" : state.width === "full" ? "w-full" : "",
    state.collapsed ? "collapsed" : "",
    editable ? "editable" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
function Component({ block, state, change, onAction, index, chrome, sectionProps, extraClass }: Props & Frame) {
  const set = (patch: Partial<Interaction>) =>
    change(block, { ...state, ...patch });
  const checked = state.checked || [];
  const classes = `atlas-block ${block.type} ${layoutClass(state, !!chrome)} ${extraClass ?? ""}`.trim();
  const style = { ["--atlas-i" as string]: index } as React.CSSProperties;
  if (block.type === "metric")
    return (
      <section className={classes} style={style} data-block-id={block.id} {...sectionProps}>
        {chrome}
        <p>{block.title}</p>
        {!state.collapsed && (
          <>
            <strong>{block.value}</strong>
            <span>{block.detail}</span>
          </>
        )}
      </section>
    );
  if (state.collapsed)
    return (
      <section className={classes} style={style} data-block-id={block.id} {...sectionProps}>
        {chrome}
        <h3>{block.title}</h3>
        <p className="block-folded">{t("Bloco recolhido. Expanda para ver o conteúdo.")}</p>
      </section>
    );
  return (
    <section className={classes} style={style} data-block-id={block.id} {...sectionProps}>
      {chrome}
      {block.type !== "heading" && <h3>{block.title}</h3>}
      {isEditorialBlock(block) && (
        <EditorialView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {isAnalyticsBlock(block) && (
        <AnalyticsView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {isControlBlock(block) && (
        <ControlView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {isExperienceBlock(block) && (
        <ExperienceView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {isPlanningBlock(block) && (
        <PlanningView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {block.type === "flashcards" && (
        <StudyView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {block.type === "series" && (
        <SeriesView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {(block.type === "timeline" || block.type === "tabs") && (
        <ExploreView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {(block.type === "diagram" || block.type === "route") && (
        <SpatialView
          block={block}
          active={state.active_item}
          select={(id) => set({ active_item: id })}
          onAction={onAction}
        />
      )}
      {block.type === "collection" && (
        <CollectionView
          block={block}
          state={state}
          change={set}
          onAction={onAction}
        />
      )}
      {block.type === "text" && <p className="prose">{block.text}</p>}
      {block.type === "chart" && (
        <div
          className="bars"
          role="img"
          aria-label={block.points
            .map((p) => `${p.label}: ${p.value} ${block.unit || ""}`)
            .join("; ")}
        >
          {block.points.map((p, i) => {
            const g = barGeometry(
              block.points.map((x) => x.value),
              p.value,
            );
            return (
              <div className="bar-row" key={i}>
                <span>{p.label}</span>
                <div className="bar-track">
                  <i className="zero-line" style={{ left: `${g.zero}%` }} />
                  <div
                    className={p.value < 0 ? "negative" : ""}
                    style={{ left: `${g.left}%`, width: `${g.width}%` }}
                  />
                </div>
                <b>
                  {number(p.value)} {block.unit}
                </b>
              </div>
            );
          })}
        </div>
      )}
      {block.type === "checklist" && (
        <div className="checks">
          {block.items.map((text, i) => (
            <label key={i} className={checked.includes(i) ? "done" : ""}>
              <input
                type="checkbox"
                checked={checked.includes(i)}
                onChange={() =>
                  set({
                    checked: checked.includes(i)
                      ? checked.filter((x) => x !== i)
                      : [...checked, i],
                  })
                }
              />
              <span>{text}</span>
            </label>
          ))}
          <small>
            {t("{n} de {total} concluídos", {
              n: checked.length,
              total: block.items.length,
            })}
          </small>
        </div>
      )}
      {block.type === "comparison" && (
        <div className="comparison-grid">
          {block.options.map((o, i) => (
            <button
              key={i}
              className={state.selected === i ? "selected" : ""}
              aria-pressed={state.selected === i}
              onClick={() => set({ selected: i })}
            >
              <strong>{o.name}</strong>
              <p>{o.description}</p>
              {o.features.map((f, j) => (
                <span key={j}>
                  <Check size={15} />
                  {f}
                </span>
              ))}
            </button>
          ))}
        </div>
      )}
      {block.type === "table" && <TableView block={block} state={state} set={set} />}
      {block.type === "calculator" && (
        <div className="calculator-body">
          <div>
            {block.inputs.map((input, i) => (
              <label className="slider" key={i}>
                <span>
                  {input.label}
                  <b>{number(input.value)}</b>
                </span>
                <input
                  aria-label={input.label}
                  type="range"
                  min={input.min}
                  max={input.max}
                  step={input.step}
                  value={input.value}
                  onChange={(e) =>
                    change(
                      {
                        ...block,
                        inputs: block.inputs.map((v, j) =>
                          i === j ? { ...v, value: Number(e.target.value) } : v,
                        ),
                      },
                      state,
                    )
                  }
                />
                <small>
                  {number(input.min)}
                  <span>{number(input.max)}</span>
                </small>
              </label>
            ))}
          </div>
          <div className="calc-result" aria-live="polite">
            <SlidersHorizontal size={22} />
            <span>{t("Resultado da simulação")}</span>
            <strong>
              {calculate(
                block.operation,
                block.inputs.map((x) => x.value),
              ) === null
                ? t("Indefinido")
                : `${block.unit || ""} ${number(
                    calculate(
                      block.operation,
                      block.inputs.map((x) => x.value),
                    )!,
                  )}`}
            </strong>
            <small>{t("Atualizado com os valores selecionados")}</small>
          </div>
        </div>
      )}
      {block.type === "form" && (
        <CanvasForm
          block={block}
          values={state.fields || {}}
          change={(fields) => set({ fields })}
          onAction={onAction}
        />
      )}
    </section>
  );
}
/** `blocks` with the block at `from` moved to `to` (indexes in the original order). */
export function moveBlock<T>(blocks: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= blocks.length) return blocks;
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * The blocks of a canvas. With `onChange` the canvas is editable: every block gets its controls
 * (1.1.2) and what the person does is handed back as a new canvas (state, edits, order).
 */
export function Canvas({
  canvas,
  onChange,
  onAction,
}: {
  canvas: CanvasData;
  onChange?: (canvas: CanvasData) => void;
  onAction?: (text: string) => void;
}) {
  const preview = useContext(PreviewContext);
  const editable = !!onChange && !preview;
  const grid = useRef<HTMLDivElement>(null);
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [said, setSaid] = useState("");
  const [landed, setLanded] = useState<string | null>(null);
  // Positions before a reorder, so blocks glide to their new place (FLIP) instead of jumping.
  const before = useRef<Map<string, DOMRect> | null>(null);
  const order = canvas.blocks.map((b) => b.id).join("|");
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    if (!previous || !grid.current || typeof grid.current.animate !== "function") return;
    if (matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (const node of Array.from(grid.current.children) as HTMLElement[]) {
      const id = node.dataset.blockId;
      const old = id ? previous.get(id) : undefined;
      if (!old || typeof node.animate !== "function") continue;
      const now = node.getBoundingClientRect();
      const dx = old.left - now.left,
        dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 240,
        easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
      });
    }
  }, [order]);
  const snapshot = () => {
    if (!grid.current) return;
    before.current = new Map(
      (Array.from(grid.current.children) as HTMLElement[])
        .filter((node) => node.dataset.blockId)
        .map((node) => [node.dataset.blockId!, node.getBoundingClientRect()]),
    );
  };
  const reorder = (from: number, to: number) => {
    if (!onChange || to < 0 || to >= canvas.blocks.length || from === to) return;
    snapshot();
    const moved = canvas.blocks[from];
    onChange({ ...canvas, blocks: moveBlock(canvas.blocks, from, to) });
    setSaid(t("Bloco “{title}” movido para a posição {n} de {total}.", {
      title: moved.title,
      n: to + 1,
      total: canvas.blocks.length,
    }));
    setLanded(moved.id);
    setTimeout(() => setLanded((current) => (current === moved.id ? null : current)), 800);
  };
  const setState = (block: Block, patch: Partial<Interaction>) =>
    onChange?.({
      ...canvas,
      state: { ...canvas.state, [block.id]: { ...(canvas.state?.[block.id] || {}), ...patch } },
    });
  return (
    <>
      <div className="canvas-grid" ref={grid}>
        {canvas.blocks.map((block, index) => {
          const state = canvas.state?.[block.id] || {};
          const half = state.width === "half" || (state.width !== "full" && block.type === "metric");
          const table = editable ? blockTable(block, state) : null;
          const chrome = editable ? (
            <BlockTools
              title={block.title}
              index={index}
              count={canvas.blocks.length}
              half={half}
              collapsed={!!state.collapsed}
              onMove={(delta) => reorder(index, index + delta)}
              onWidth={() => setState(block, { width: half ? "full" : "half" })}
              onCollapse={() => setState(block, { collapsed: !state.collapsed })}
              onCsv={
                table && table.rows.length
                  ? () =>
                      downloadTextFile(
                        `${safeName(block.title, "dados")}.csv`,
                        toCsv(table, getLocale() === "en" ? "," : ";"),
                        "text/csv;charset=utf-8",
                      )
                  : undefined
              }
              onAsk={
                onAction
                  ? () => onAction(t("Sobre o bloco “{block}” do canvas “{title}”: ", { block: block.title, title: canvas.title }))
                  : undefined
              }
              onDragHandle={(active) => setGrabbed(active ? block.id : null)}
            />
          ) : undefined;
          const sectionProps = editable
            ? {
                draggable: grabbed === block.id,
                onDragStart: (event: React.DragEvent) => {
                  event.dataTransfer.setData("application/x-atlas-block", block.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDragging(block.id);
                },
                onDragEnd: () => {
                  setDragging(null);
                  setGrabbed(null);
                  setDrop(null);
                },
                onDragOver: (event: React.DragEvent) => {
                  if (!dragging || dragging === block.id) return;
                  event.preventDefault();
                  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  const after =
                    box.width > box.height * 2.2
                      ? event.clientY > box.top + box.height / 2
                      : event.clientX > box.left + box.width / 2 || event.clientY > box.bottom - 12;
                  if (drop?.id !== block.id || drop.after !== after) setDrop({ id: block.id, after });
                },
                onDrop: (event: React.DragEvent) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("application/x-atlas-block") || dragging;
                  const from = canvas.blocks.findIndex((b) => b.id === id);
                  setDrop(null);
                  setDragging(null);
                  setGrabbed(null);
                  if (from < 0 || id === block.id) return;
                  let to = index + (drop?.after ? 1 : 0);
                  if (from < to) to -= 1;
                  reorder(from, to);
                },
              }
            : undefined;
          const extraClass = [
            dragging === block.id ? "dragging" : "",
            drop?.id === block.id ? (drop.after ? "drop-after" : "drop-before") : "",
            landed === block.id ? "dropping" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <Component
              key={block.id}
              block={block}
              state={state}
              index={index}
              chrome={chrome}
              sectionProps={sectionProps}
              extraClass={extraClass}
              onAction={onAction}
              change={(next, nextState) =>
                onChange?.({
                  ...canvas,
                  blocks: canvas.blocks.map((b) => (b.id === block.id ? next : b)),
                  state: { ...canvas.state, [block.id]: nextState },
                })
              }
            />
          );
        })}
      </div>
      {editable && (
        <p className="canvas-live" aria-live="polite" aria-atomic="true">
          {said}
        </p>
      )}
      {!!canvas.sources?.length && (
        <section className="canvas-sources">
          <h3>{t("Fontes")}</h3>
          {canvas.sources.map((s, i) => (
            <CanvasLink
              key={i}
              href={/^https?:\/\//i.test(s.url) ? s.url : undefined}
              target="_blank"
              rel="noreferrer"
            >
              {i + 1}. {s.title}
            </CanvasLink>
          ))}
        </section>
      )}
    </>
  );
}
