/**
 * The frame protocol (1.1.2): how an exported canvas page talks to the page that frames it.
 *
 * The Atlas portal shows a canvas in a sandboxed iframe (no shared origin, no cookies, no storage).
 * The two sides exchange plain messages with `postMessage`:
 *
 *   canvas → host  { source: "atlas-canvas", version: 1, type, ... }
 *     ready      { id, revision, title, atlas }   the page is drawn and listening
 *     height     { height }                       the height the page needs, to size the frame
 *     state      { canvas, changes }              what the person did (state, edits, order) and
 *                                                 a readable summary of it, to keep and to send
 *     action     { text }                         text for the chat composer (never sent by itself)
 *     fullscreen {}                               the person asked for a bigger view
 *
 *   host → canvas  { source: "atlas-host", version: 1, type, ... }
 *     hello      { theme?, state?, locale? }      theme of the host and the state it kept
 *     theme      { theme }                        the host switched between light and dark
 *     export     { format }                       png | pdf | csv | html | json
 *     reset      {}                               back to the canvas as the agent wrote it
 *
 * Only messages from the parent window are read, and a restored state can change only what the
 * person could change by hand (interaction state, block order, calculator values); the blocks'
 * content always comes from the page itself.
 */
import type { Block, Canvas, Interaction } from "../types";
import { t } from "../i18n";

export const PROTOCOL = 1;
export type HostMessage =
  | { type: "hello"; theme?: string; state?: unknown; locale?: string }
  | { type: "theme"; theme?: string }
  | { type: "export"; format?: string }
  | { type: "reset" };

export function readHostMessage(data: unknown): HostMessage | null {
  if (!data || typeof data !== "object") return null;
  const message = data as { source?: unknown; version?: unknown; type?: unknown };
  if (message.source !== "atlas-host" || message.version !== PROTOCOL || typeof message.type !== "string") return null;
  if (!["hello", "theme", "export", "reset"].includes(message.type)) return null;
  return data as HostMessage;
}

export function canvasMessage(type: string, payload: Record<string, unknown> = {}) {
  return { source: "atlas-canvas", version: PROTOCOL, type, ...payload };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * `original` with what a saved copy says the person did: their block order (when it names exactly
 * the same blocks), the interaction state of known blocks and calculator values within bounds.
 */
export function restoreCanvas(original: Canvas, saved: unknown): Canvas {
  if (!isObject(saved) || saved.id !== original.id || !Array.isArray(saved.blocks)) return original;
  const known = new Map(original.blocks.map((block) => [block.id, block]));
  const savedBlocks = saved.blocks.filter(isObject);
  const ids = savedBlocks.map((block) => block.id);
  const sameSet = ids.length === known.size && ids.every((id) => typeof id === "string" && known.has(id));
  const ordered = sameSet ? ids.map((id) => known.get(id as string)!) : original.blocks;
  const blocks = ordered.map((block): Block => {
    if (block.type !== "calculator") return block;
    const copy = savedBlocks.find((b) => b.id === block.id && b.type === "calculator");
    const inputs = Array.isArray(copy?.inputs) ? copy!.inputs : [];
    return {
      ...block,
      inputs: block.inputs.map((input, i) => {
        const value = isObject(inputs[i]) ? Number(inputs[i].value) : NaN;
        return Number.isFinite(value) && value >= input.min && value <= input.max ? { ...input, value } : input;
      }),
    };
  });
  const state: { [key: string]: Interaction } = {};
  if (isObject(saved.state))
    for (const [id, value] of Object.entries(saved.state))
      if (known.has(id) && isObject(value)) state[id] = value as Interaction;
  return { ...original, blocks, state: { ...original.state, ...state } };
}

function label(block: Block) {
  return `“${block.title}”`;
}

/** What only changes the view (a filter, a sort, the task or month on screen, folded branches):
 *  worth keeping for the person, not worth a message to the agent. */
const VIEW_KEYS = ["query", "sort_column", "sort_reverse", "series_view", "active_item", "collection_sort", "hidden_series"];
const VIEW_VALUES = new Set(["gantt", "calendar", "tree"]);
function meaningful(block: Block, state: Interaction): Record<string, unknown> {
  const out: Record<string, unknown> = { ...state };
  for (const key of VIEW_KEYS) delete out[key];
  if (VIEW_VALUES.has(block.type)) delete out.values;
  for (const [key, value] of Object.entries(out)) if (value === undefined) delete out[key];
  return out;
}

/**
 * What the person changed, in a few readable lines, for the message they can send to the agent.
 * Unknown kinds of change fall back to "changed the block".
 */
export function describeChanges(original: Canvas, current: Canvas): string[] {
  const lines: string[] = [];
  const before = new Map(original.blocks.map((block) => [block.id, block]));
  const orderBefore = original.blocks.map((block) => block.id).join("|");
  const orderNow = current.blocks.map((block) => block.id).join("|");
  if (orderBefore !== orderNow)
    lines.push(t("Reorganizei os blocos: {order}.", { order: current.blocks.map((block) => block.title).join(" → ") }));
  for (const block of current.blocks) {
    const now: Interaction = current.state?.[block.id] ?? {};
    const was: Interaction = original.state?.[block.id] ?? {};
    if (JSON.stringify(now) === JSON.stringify(was) && JSON.stringify(block) === JSON.stringify(before.get(block.id)))
      continue;
    const name = label(block);
    if (now.collapsed !== was.collapsed && now.collapsed) lines.push(t("Recolhi o bloco {block}.", { block: name }));
    if (now.width !== was.width && now.width && now.width !== "auto")
      lines.push(
        now.width === "half"
          ? t("Deixei o bloco {block} em meia largura.", { block: name })
          : t("Deixei o bloco {block} em largura total.", { block: name }),
      );
    if (block.type === "checklist" && JSON.stringify(now.checked ?? []) !== JSON.stringify(was.checked ?? [])) {
      const done = (now.checked ?? []).map((i) => block.items[i]).filter(Boolean);
      lines.push(
        done.length
          ? t("Em {block}, marquei: {items}.", { block: name, items: done.join("; ") })
          : t("Em {block}, desmarquei todos os itens.", { block: name }),
      );
      continue;
    }
    if (block.type === "table" && JSON.stringify(now.cells ?? {}) !== JSON.stringify(was.cells ?? {})) {
      const edits = Object.entries(now.cells ?? {}).map(([key, value]) => {
        const [row, column] = key.split(":").map(Number);
        return t("linha {row}, {column}: “{value}”", {
          row: row + 1,
          column: block.columns[column] ?? column + 1,
          value,
        });
      });
      lines.push(
        edits.length
          ? t("Editei a tabela {block}: {edits}.", { block: name, edits: edits.join("; ") })
          : t("Restaurei a tabela {block} ao original.", { block: name }),
      );
      continue;
    }
    if (block.type === "form" && JSON.stringify(now.fields ?? {}) !== JSON.stringify(was.fields ?? {})) {
      const answers = Object.entries(now.fields ?? {})
        .filter(([, value]) => String(value).trim())
        .map(([id, value]) => `${block.fields.find((f) => f.id === id)?.label ?? id}: ${value}`);
      lines.push(t("Preenchi o formulário {block}: {answers}.", { block: name, answers: answers.join("; ") || "—" }));
      continue;
    }
    if ((block.type === "kanban" || block.type === "matrix") && JSON.stringify(now.values ?? {}) !== JSON.stringify(was.values ?? {})) {
      const moves = Object.entries(now.values ?? {}).map(([id, target]) => {
        if (block.type === "kanban") {
          const task = block.tasks.find((item) => item.id === id)?.label ?? id;
          return `${task} → ${block.columns.find((c) => c.id === target)?.label ?? target}`;
        }
        const item = block.items.find((entry) => entry.id === id)?.label ?? id;
        return `${item} → ${block.quadrants.find((q) => q.id === target)?.label ?? target}`;
      });
      lines.push(t("Em {block}, movi: {moves}.", { block: name, moves: moves.join("; ") || "—" }));
      continue;
    }
    if (block.type === "comparison" && now.selected !== was.selected && now.selected != null) {
      lines.push(t("Em {block}, escolhi {option}.", { block: name, option: block.options[now.selected]?.name ?? "" }));
      continue;
    }
    if (block.type === "calculator") {
      const old = before.get(block.id);
      if (old && old.type === "calculator" && JSON.stringify(old.inputs) !== JSON.stringify(block.inputs)) {
        lines.push(
          t("Ajustei a simulação {block}: {values}.", {
            block: name,
            values: block.inputs.map((input) => `${input.label} = ${input.value}`).join("; "),
          }),
        );
        continue;
      }
    }
    const rest = (state: Interaction) => ({ ...meaningful(block, state), width: undefined, collapsed: undefined });
    if (JSON.stringify(rest(now)) !== JSON.stringify(rest(was))) lines.push(t("Mexi no bloco {block}.", { block: name }));
  }
  return lines;
}

/** The message the person can send: a header naming the canvas, then the changes. */
export function changesMessage(canvas: Canvas, lines: string[]) {
  if (!lines.length) return "";
  return `${t("Atualizei o canvas “{title}”:", { title: canvas.title })}\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
