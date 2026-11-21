import React, { useEffect, useId, useState } from "react";
import type { Interaction } from "./types";
import "./controls.css";

type Option = { id: string; label: string; detail?: string };
type Dates = { earliest?: string | null; latest?: string | null };
type Options = { options: Option[] };
type Base = { id: string; title: string };
export type ControlBlock = Base &
  (
    | { type: "short_answer"; placeholder?: string }
    | { type: "long_answer"; placeholder?: string }
    | {
        type: "number_input";
        min?: number | null;
        max?: number | null;
        unit?: string;
      }
    | ({ type: "date_picker" } & Dates)
    | ({ type: "date_range" } & Dates)
    | ({ type: "single_choice" } & Options)
    | ({ type: "multi_choice" } & Options)
    | ({ type: "segmented" } & Options)
    | { type: "toggle"; initial?: boolean }
    | {
        type: "slider";
        min?: number;
        max?: number;
        step?: number;
        initial?: number | null;
        unit?: string;
      }
    | { type: "rating"; stars?: number }
    | {
        type: "checklist_group";
        groups: { id: string; label: string; tasks: Option[] }[];
      }
    | ({ type: "poll" } & Options)
    | ({
        type: "quiz";
        question: string;
        answer_id: string;
        explanation: string;
      } & Options)
    | { type: "timer"; seconds: number }
  );

type Values = Record<string, string>;
const controlTypes = {
  short_answer: true,
  long_answer: true,
  number_input: true,
  date_picker: true,
  date_range: true,
  single_choice: true,
  multi_choice: true,
  segmented: true,
  toggle: true,
  slider: true,
  rating: true,
  checklist_group: true,
  poll: true,
  quiz: true,
  timer: true,
} satisfies Record<ControlBlock["type"], true>;
export function isControlBlock(block: { type: string }): block is ControlBlock {
  return Object.hasOwn(controlTypes, block.type);
}
type ControlProps = {
  block: ControlBlock;
  state: Interaction;
  change: (patch: Partial<Interaction>) => void;
  onAction?: (draft: string) => void;
};

function selection(raw: string | undefined, options: Option[]): string[] {
  try {
    const ids: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(ids)
      ? options.filter((o) => ids.includes(o.id)).map((o) => o.id)
      : [];
  } catch {
    return [];
  }
}

function validDate(raw: string, bounds: Dates) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw.startsWith("0000")) return false;
  const day = new Date(raw + "T00:00:00Z");
  return (
    Number.isFinite(day.getTime()) &&
    day.toISOString().slice(0, 10) === raw &&
    (!bounds.earliest || raw >= bounds.earliest) &&
    (!bounds.latest || raw <= bounds.latest)
  );
}

function withUnit(value: string, unit?: string) {
  return unit ? value + " " + unit : value;
}

function RadioOptions({
  options,
  selected,
  set,
  label,
  disabled,
  compact,
}: {
  options: Option[];
  selected?: string;
  set: (id: string) => void;
  label: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const name = useId();
  return (
    <fieldset
      className={compact ? "atlas-control-segments" : "atlas-control-options"}
      disabled={disabled}
    >
      <legend>{label}</legend>
      {options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={name}
            checked={option.id === selected}
            onChange={() => set(option.id)}
          />
          <span>
            {option.label}
            {!compact && option.detail && <small>{option.detail}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function countdown(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  const parts = [Math.floor(seconds / 60) % 60, seconds % 60];
  if (seconds >= 3600) parts.unshift(Math.floor(seconds / 3600));
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

function TimerView({
  block,
  values,
  save,
}: {
  block: Extract<ControlBlock, { type: "timer" }>;
  values: Values;
  save: (v: Values) => void;
}) {
  const [now, setNow] = useState(Date.now);
  const duration = block.seconds * 1000;
  const deadline = Number(values.deadline_ms) || 0;
  const paused = values.remaining_ms !== undefined;
  const remaining = deadline
    ? Math.max(0, Math.min(duration, deadline - now))
    : paused
      ? Math.max(0, Math.min(duration, Number(values.remaining_ms) || 0))
      : duration;
  const running = deadline > 0 && remaining > 0;
  const finished = remaining === 0;
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [deadline, running]);
  function start() {
    const timestamp = Date.now();
    setNow(timestamp);
    save({
      deadline_ms: String(timestamp + (finished ? duration : remaining)),
    });
  }
  return (
    <div className="atlas-control-timer">
      <span role="timer" aria-label={block.title} aria-live="off">
        {countdown(remaining)}
      </span>
      <span role="status">
        {finished
          ? "Tempo esgotado"
          : running
            ? "Em andamento"
            : paused
              ? "Pausado"
              : "Pronto"}
      </span>
      <div className="atlas-control-buttons">
        {running ? (
          <button
            type="button"
            onClick={() =>
              save({ remaining_ms: String(Math.max(0, deadline - Date.now())) })
            }
          >
            Pausar
          </button>
        ) : (
          <button type="button" onClick={start}>
            {finished ? "Reiniciar" : paused ? "Retomar" : "Iniciar"}
          </button>
        )}
        {(paused || running) && (
          <button type="button" onClick={() => save({})}>
            Redefinir
          </button>
        )}
      </div>
    </div>
  );
}

export function ControlView({ block, state, change, onAction }: ControlProps) {
  const radioName = useId();
  const values: Values = state.values ?? {};
  const save = (next: Values) => change({ values: next });
  const raw = values.value ?? "";
  const setValue = (value: string) => save({ value });
  const draft = (answer?: string) =>
    onAction && (
      <button
        className="atlas-control-draft"
        type="button"
        disabled={!answer}
        onClick={() => answer && onAction(block.title + "\n" + answer)}
      >
        Usar resposta no chat
      </button>
    );
  let body: React.ReactNode;
  switch (block.type) {
    case "short_answer":
    case "long_answer": {
      const limit = block.type === "short_answer" ? 240 : 4000;
      const props = {
        "aria-label": block.title,
        value: raw,
        maxLength: limit,
        placeholder: block.placeholder,
        onChange: (
          event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
        ) => setValue(event.currentTarget.value),
      };
      body = (
        <>
          {block.type === "short_answer" ? (
            <input type="text" {...props} />
          ) : (
            <>
              <textarea rows={4} {...props} />
              <small className="atlas-control-counter">
                {raw.length} / {limit}
              </small>
            </>
          )}
          {draft(raw.trim())}
        </>
      );
      break;
    }
    case "number_input": {
      const min = block.min ?? -1e12,
        max = block.max ?? 1e12;
      const number = Number(raw);
      const valid =
        !!raw && Number.isFinite(number) && number >= min && number <= max;
      body = (
        <>
          <label className="atlas-control-field">
            <input
              type="number"
              step="any"
              aria-label={block.title}
              min={min}
              max={max}
              value={raw}
              aria-invalid={!!raw && !valid}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (
                  !v ||
                  (v.length <= 64 &&
                    Math.abs(Number(v)) <= 1e12 &&
                    /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]{1,3})?$/.test(
                      v,
                    ))
                )
                  setValue(v);
              }}
            />
            {block.unit}
          </label>
          {raw && !valid && (
            <small role="status">
              Informe um valor entre {min} e {max}.
            </small>
          )}
          {draft(valid ? withUnit(raw, block.unit) : "")}
        </>
      );
      break;
    }
    case "date_picker":
    case "date_range": {
      const range = block.type === "date_range";
      const start = values.start ?? "",
        end = values.end ?? "";
      const reversed = !!start && !!end && start > end;
      const dateInput = (key: string, label: string) => (
        <label className="atlas-control-field">
          {range && label}
          <input
            type="date"
            aria-label={label}
            min={block.earliest ?? undefined}
            max={block.latest ?? undefined}
            value={values[key] ?? ""}
            aria-invalid={
              !!values[key] &&
              (!validDate(values[key], block) || (range && reversed))
            }
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (!v || validDate(v, {})) save({ ...values, [key]: v });
            }}
          />
        </label>
      );
      body = (
        <>
          <div className="atlas-control-dates">
            {range ? (
              <>
                {dateInput("start", "Data inicial")}
                {dateInput("end", "Data final")}
              </>
            ) : (
              dateInput("value", block.title)
            )}
          </div>
          {range && reversed && (
            <small role="status">
              A data final deve ser igual ou posterior à inicial.
            </small>
          )}
          {Object.values(values).some((v) => v && !validDate(v, block)) && (
            <small role="status">
              Selecione uma data dentro dos limites definidos.
            </small>
          )}
          {draft(
            range
              ? validDate(start, block) && validDate(end, block) && !reversed
                ? start + " – " + end
                : ""
              : validDate(raw, block)
                ? raw
                : "",
          )}
        </>
      );
      break;
    }
    case "single_choice":
    case "segmented": {
      const choice =
        block.options.find((option) => option.id === raw) ??
        (block.type === "segmented" ? block.options[0] : undefined);
      body = (
        <>
          {block.type === "single_choice" ? (
            <select
              aria-label={block.title}
              value={choice?.id ?? ""}
              onChange={(e) => setValue(e.currentTarget.value)}
            >
              <option value="">Selecione uma opção</option>
              {block.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <RadioOptions
              compact
              options={block.options}
              selected={choice?.id}
              label={block.title}
              set={setValue}
            />
          )}
          {choice?.detail && <p>{choice.detail}</p>}
          {draft(choice?.label)}
        </>
      );
      break;
    }
    case "multi_choice": {
      const ids = selection(values.selected, block.options);
      body = (
        <>
          <fieldset className="atlas-control-options">
            <legend>Selecione as opções desejadas</legend>
            {block.options.map((o) => (
              <label key={o.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(o.id)}
                  onChange={(e) =>
                    save({
                      selected: JSON.stringify(
                        e.currentTarget.checked
                          ? [...ids, o.id]
                          : ids.filter((id) => id !== o.id),
                      ),
                    })
                  }
                />
                <span>
                  {o.label}
                  {o.detail && <small>{o.detail}</small>}
                </span>
              </label>
            ))}
          </fieldset>
          {draft(
            block.options
              .filter((o) => ids.includes(o.id))
              .map((o) => o.label)
              .join(", "),
          )}
        </>
      );
      break;
    }
    case "toggle": {
      const enabled = raw === "" ? !!block.initial : raw === "true";
      body = (
        <>
          <label className="atlas-control-toggle">
            <input
              type="checkbox"
              role="switch"
              aria-label={block.title}
              checked={enabled}
              onChange={(e) => setValue(String(e.currentTarget.checked))}
            />
            <span>{enabled ? "Ativado" : "Desativado"}</span>
          </label>
          {draft(enabled ? "Ativado" : "Desativado")}
        </>
      );
      break;
    }
    case "slider": {
      const min = block.min ?? 0,
        max = block.max ?? 100;
      const number = Number(raw);
      const value =
        raw && Number.isFinite(number) && number >= min && number <= max
          ? number
          : (block.initial ?? min);
      body = (
        <>
          <div className="atlas-control-slider">
            <output>{withUnit(String(value), block.unit)}</output>
            <input
              type="range"
              aria-label={block.title}
              aria-valuetext={withUnit(String(value), block.unit)}
              min={min}
              max={max}
              step={block.step ?? 1}
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
            />
            <div>
              <small>{min}</small>
              <small>{max}</small>
            </div>
          </div>
          {draft(withUnit(String(value), block.unit))}
        </>
      );
      break;
    }
    case "rating": {
      const stars = block.stars ?? 5;
      const options = Array.from({ length: stars }, (_, i) => ({
        id: String(i + 1),
        label: String(i + 1),
      }));
      const choice = options.find((o) => o.id === raw);
      body = (
        <>
          <fieldset className="atlas-control-stars">
            <legend>Escolha uma nota de 1 a {stars}</legend>
            {options.map((option) => (
              <label
                key={option.id}
                data-filled={Number(option.id) <= Number(choice?.id ?? 0)}
              >
                <input
                  type="radio"
                  name={radioName}
                  aria-label={option.id + " de " + stars}
                  checked={option.id === choice?.id}
                  onChange={() => setValue(option.id)}
                />
                <span aria-hidden="true">★</span>
              </label>
            ))}
          </fieldset>
          {choice && (
            <button type="button" onClick={() => setValue("")}>
              Limpar avaliação
            </button>
          )}
          {draft(choice && choice.label + " / " + stars)}
        </>
      );
      break;
    }
    case "checklist_group": {
      const tasks = block.groups.flatMap((group) => group.tasks);
      const checked = selection(values.selected, tasks);
      body = (
        <>
          <label className="atlas-control-progress">
            <progress
              max={tasks.length}
              value={checked.length}
              aria-label="Progresso das tarefas"
            />
            {checked.length} de {tasks.length} concluídas
          </label>
          {block.groups.map((group) => (
            <fieldset key={group.id} className="atlas-control-options">
              <legend>{group.label}</legend>
              {group.tasks.map((task) => (
                <label key={task.id}>
                  <input
                    type="checkbox"
                    checked={checked.includes(task.id)}
                    onChange={(e) =>
                      save({
                        selected: JSON.stringify(
                          e.currentTarget.checked
                            ? [...checked, task.id]
                            : checked.filter((id) => id !== task.id),
                        ),
                      })
                    }
                  />
                  <span>
                    {task.label}
                    {task.detail && <small>{task.detail}</small>}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
          {draft(
            checked.length
              ? "Concluídas (" +
                  checked.length +
                  "/" +
                  tasks.length +
                  "): " +
                  tasks
                    .filter((t) => checked.includes(t.id))
                    .map((t) => t.label)
                    .join(", ")
              : "",
          )}
        </>
      );
      break;
    }
    case "poll":
    case "quiz": {
      const quiz = block.type === "quiz";
      const key = quiz ? "answer" : "vote";
      const submitted = block.options.find((o) => o.id === values[key]);
      const choice =
        submitted ?? block.options.find((o) => o.id === values.choice);
      const correct = quiz && submitted?.id === block.answer_id;
      const result =
        submitted &&
        (quiz
          ? (correct ? "Resposta correta. " : "Resposta incorreta. ") +
            block.explanation
          : "Seu voto: " + submitted.label);
      body = (
        <>
          <RadioOptions
            options={block.options}
            selected={choice?.id}
            label={quiz ? block.question : "Seu voto"}
            disabled={!!submitted}
            set={(id) => save({ choice: id })}
          />
          {result && (
            <p className="atlas-control-result" role="status">
              {result}
            </p>
          )}
          {submitted ? (
            <button
              type="button"
              onClick={() => save(quiz ? {} : { choice: submitted.id })}
            >
              {quiz ? "Tentar novamente" : "Alterar voto"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!choice}
              onClick={() =>
                choice && save({ choice: choice.id, [key]: choice.id })
              }
            >
              {quiz ? "Corrigir resposta" : "Registrar meu voto"}
            </button>
          )}
          {draft(
            submitted &&
              (quiz ? submitted.label + ". " + result : submitted.label),
          )}
        </>
      );
      break;
    }
    case "timer":
      body = <TimerView block={block} values={values} save={save} />;
      break;
  }
  return <div className="atlas-control">{body}</div>;
}
