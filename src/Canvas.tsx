import React from "react";
import { Check, Search, SlidersHorizontal } from "lucide-react";
import { Block, Canvas as CanvasData, Interaction } from "./types";

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
const number = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
type Props = {
  block: Block;
  state: Interaction;
  change: (block: Block, state: Interaction) => void;
  onAction?: (text: string) => void;
};
function Component({ block, state, change, onAction }: Props) {
  const set = (patch: Partial<Interaction>) =>
    change(block, { ...state, ...patch });
  const checked = state.checked || [],
    query = state.query || "";
  if (block.type === "metric")
    return (
      <section className="atlas-block metric">
        <p>{block.title}</p>
        <strong>{block.value}</strong>
        <span>{block.detail}</span>
      </section>
    );
  return (
    <section className={`atlas-block ${block.type}`}>
      <h3>{block.title}</h3>
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
            {checked.length} de {block.items.length} concluídos
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
      {block.type === "table" && (
        <>
          <label className="table-search">
            <Search size={16} />
            <input
              aria-label={`Filtrar ${block.title}`}
              placeholder="Filtrar linhas..."
              value={query}
              onChange={(e) => set({ query: e.target.value })}
            />
          </label>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {block.columns.map((c, i) => (
                    <th
                      key={i}
                      aria-sort={
                        state.sort_column === i
                          ? state.sort_reverse
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                    >
                      <button
                        onClick={() =>
                          set({
                            sort_column: i,
                            sort_reverse:
                              state.sort_column === i
                                ? !state.sort_reverse
                                : false,
                          })
                        }
                      >
                        {c}{" "}
                        {state.sort_column === i
                          ? state.sort_reverse
                            ? "↓"
                            : "↑"
                          : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows
                  .filter((r) =>
                    r.some((c) =>
                      c.toLowerCase().includes(query.toLowerCase()),
                    ),
                  )
                  .sort((a, b) =>
                    state.sort_column != null
                      ? (state.sort_reverse ? -1 : 1) *
                        a[state.sort_column].localeCompare(
                          b[state.sort_column],
                          "pt-BR",
                          { numeric: true },
                        )
                      : 0,
                  )
                  .map((row, i) => (
                    <tr key={i}>
                      {row.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
            <span>Resultado da simulação</span>
            <strong>
              {calculate(
                block.operation,
                block.inputs.map((x) => x.value),
              ) === null
                ? "Indefinido"
                : `${block.unit || ""} ${number(
                    calculate(
                      block.operation,
                      block.inputs.map((x) => x.value),
                    )!,
                  )}`}
            </strong>
            <small>Atualizado com os valores selecionados</small>
          </div>
        </div>
      )}
      {block.type === "form" && (
        <form
          className="atlas-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAction?.(
              `Formulário “${block.title}”:\n${block.fields.map((f) => `${f.label}: ${state.fields?.[f.id] || ""}`).join("\n")}`,
            );
          }}
        >
          {block.fields.map((f) => (
            <label key={f.id}>
              {f.label}
              {f.kind === "select" ? (
                <select
                  required={f.required}
                  value={state.fields?.[f.id] || ""}
                  onChange={(e) =>
                    set({ fields: { ...state.fields, [f.id]: e.target.value } })
                  }
                >
                  <option value="">Selecione</option>
                  {f.options?.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.kind}
                  required={f.required}
                  maxLength={4000}
                  value={state.fields?.[f.id] || ""}
                  onChange={(e) =>
                    set({ fields: { ...state.fields, [f.id]: e.target.value } })
                  }
                />
              )}
            </label>
          ))}
          <button className="primary" type="submit">
            {block.submit_label || "Enviar ao Hermes"}
          </button>
          <small>
            Os valores serão colocados na mensagem para você revisar antes de
            enviar.
          </small>
        </form>
      )}
    </section>
  );
}
export function Canvas({
  canvas,
  onChange,
  onAction,
}: {
  canvas: CanvasData;
  onChange?: (canvas: CanvasData) => void;
  onAction?: (text: string) => void;
}) {
  return (
    <>
      <div className="canvas-grid">
        {canvas.blocks.map((block) => (
          <Component
            key={block.id}
            block={block}
            state={canvas.state?.[block.id] || {}}
            onAction={onAction}
            change={(next, state) =>
              onChange?.({
                ...canvas,
                blocks: canvas.blocks.map((b) =>
                  b.id === block.id ? next : b,
                ),
                state: { ...canvas.state, [block.id]: state },
              })
            }
          />
        ))}
      </div>
      {!!canvas.sources?.length && (
        <section className="canvas-sources">
          <h3>Fontes</h3>
          {canvas.sources.map((s, i) => (
            <a
              key={i}
              href={/^https?:\/\//i.test(s.url) ? s.url : undefined}
              target="_blank"
              rel="noreferrer"
            >
              {i + 1}. {s.title}
            </a>
          ))}
        </section>
      )}
    </>
  );
}
