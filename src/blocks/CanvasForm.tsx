import React, { useId } from "react";
import type { Block } from "../types";
import { t } from "../i18n";
import "./canvas-form.css";

type Form = Extract<Block, { type: "form" }>;
type Values = { [id: string]: string };
function visibleValue(field: Form["fields"][number], raw = "") {
  if (field.kind === "radio" || field.kind === "select")
    return field.options?.includes(raw) ? raw : "";
  if (field.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw.startsWith("0000")) return "";
    const day = new Date(raw + "T00:00:00Z");
    return Number.isFinite(day.getTime()) &&
      day.toISOString().slice(0, 10) === raw
      ? raw
      : "";
  }
  if (
    field.kind === "number" &&
    raw &&
    (!/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) ||
      !Number.isFinite(Number(raw)))
  )
    return "";
  return raw;
}
export function CanvasForm({
  block,
  values,
  change,
  onAction,
}: {
  block: Form;
  values: Values;
  change: (next: Values) => void;
  onAction?: (draft: string) => void;
}) {
  const group = useId();
  function update(id: string, value: string) {
    change({ ...values, [id]: value });
  }
  return (
    <form
      className="atlas-form"
      onSubmit={(e) => {
        e.preventDefault();
        const answers = block.fields.map((f) => {
          const raw = visibleValue(f, values[f.id]);
          const answer =
            f.kind === "checkbox"
              ? raw === "true"
                ? t("Sim")
                : t("Não")
              : raw;
          return `${f.label}: ${answer}`;
        });
        onAction?.(
          `${t("Formulário “{title}”:", { title: block.title })}\n${answers.join("\n")}`,
        );
      }}
    >
      {block.fields.map((f) => {
        const value = visibleValue(f, values[f.id]);
        if (f.kind === "radio")
          return (
            <fieldset className="atlas-choice-group" key={f.id}>
              <legend>{f.label}</legend>
              {f.options?.map((opt) => (
                <label key={opt}>
                  <input
                    type="radio"
                    name={group + "-" + f.id}
                    required={f.required}
                    checked={value === opt}
                    onChange={() => update(f.id, opt)}
                  />
                  {opt}
                </label>
              ))}
            </fieldset>
          );
        if (f.kind === "checkbox")
          return (
            <label className="atlas-choice-check" key={f.id}>
              <input
                type="checkbox"
                required={f.required}
                checked={value === "true"}
                onChange={(e) => update(f.id, String(e.target.checked))}
              />
              {f.label}
            </label>
          );
        return (
          <label key={f.id}>
            {f.label}
            {f.kind === "select" ? (
              <select
                required={f.required}
                value={value}
                onChange={(e) => update(f.id, e.target.value)}
              >
                <option value="">{t("Selecione")}</option>
                {f.options?.map((opt, i) => (
                  <option key={i}>{opt}</option>
                ))}
              </select>
            ) : f.kind === "textarea" ? (
              <textarea
                rows={3}
                maxLength={4000}
                required={f.required}
                value={value}
                onChange={(e) => update(f.id, e.target.value)}
              />
            ) : (
              <input
                type={f.kind || "text"}
                step={f.kind === "number" ? "any" : undefined}
                required={f.required}
                maxLength={4000}
                value={value}
                onChange={(e) => update(f.id, e.target.value)}
              />
            )}
          </label>
        );
      })}
      {onAction && (
        <>
          <button className="primary" type="submit">
            {block.submit_label || t("Enviar ao Hermes")}
          </button>
          <small>
            {t(
              "Os valores serão colocados na mensagem para você revisar antes de enviar.",
            )}
          </small>
        </>
      )}
    </form>
  );
}
