import React from "react";
import {
  Activity,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
} from "lucide-react";
import { intlLocale, msg, t } from "../i18n";
import type { ActivityStep, Run, RunActivity } from "../types";
import "./run-activity.css";

// Portuguese source strings, marked with `msg()`; `t()` translates them where they are rendered.
const reasons: Record<NonNullable<ActivityStep["reason"]>, string> = {
  timeout: msg("Tempo limite atingido"),
  denied: msg("Permissão negada"),
  cancelled: msg("Cancelamento informado"),
  nonzero_exit: msg("A ferramenta retornou um código de saída diferente de zero"),
};
const names: Record<string, string> = {
  terminal: msg("Terminal"),
  execute_code: msg("Execução de código"),
  delegate_task: msg("Delegação de tarefa"),
  read_file: msg("Leitura de arquivo"),
  write_file: msg("Gravação de arquivo"),
  web_search: msg("Pesquisa na web"),
  atlas_render: msg("Criação de canvas"),
  atlas_update: msg("Atualização de canvas"),
  atlas_get: msg("Leitura de canvas"),
  atlas_list: msg("Consulta de canvases"),
  atlas_export: msg("Exportação de canvas"),
  atlas_components: msg("Consulta de blocos"),
  atlas_resources: msg("Medição de recursos do sistema"),
};
const labels: Record<ActivityStep["status"], string> = {
  running: msg("Em andamento"),
  succeeded: msg("Concluída"),
  failed: msg("Falhou"),
  unknown: msg("Sem confirmação"),
};
const runTitles: Record<string, string> = {
  failed: msg("Execução falhou"),
  interrupted: msg("Execução interrompida"),
  cancelled: msg("Execução cancelada"),
  unknown: msg("Execução sem desfecho confirmado"),
};
const stopped = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
  "unknown",
]);
const seconds = (value: number) =>
  new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(value);
function duration(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return undefined;
  if (value === 0) return "0 s";
  if (value < 0.1) return "< " + seconds(0.1) + " s";
  if (value < 60) return seconds(value) + " s";
  const rounded = Math.round(value);
  const rest = rounded % 60;
  return Math.floor(rounded / 60) + " min" + (rest ? " " + rest + " s" : "");
}
function stepName(step: ActivityStep) {
  if (step.kind === "tool")
    return Object.hasOwn(names, step.name)
      ? t(names[step.name])
      : step.name || t("Ferramenta");
  return step.name || t("Especialista");
}
function statusOf(step: ActivityStep, status: string) {
  return step.status === "running" && stopped.has(status)
    ? "unknown"
    : step.status;
}
export function RunActivityDetails({
  activity,
  status = "unknown",
  delivered = false,
}: {
  activity?: RunActivity;
  status?: string;
  delivered?: boolean;
}) {
  if (!activity || (!activity.steps.length && !activity.limited)) return null;
  const steps = activity.steps;
  const failures = steps.filter((s) => s.status === "failed").length;
  const unknown = steps.filter((s) => statusOf(s, status) === "unknown").length;
  const title =
    status === "completed"
      ? delivered
        ? t("Resposta entregue")
        : t("Execução concluída sem resposta de texto")
      : t(runTitles[status] ?? msg("Etapas da execução"));
  const severity =
    status === "failed"
      ? "failed"
      : failures || unknown || activity.limited
        ? "warning"
        : "normal";
  return (
    <details className="atlas-run-activity" data-severity={severity}>
      <summary>
        <Activity size={15} aria-hidden="true" />
        <strong>{title}</strong>
        <span className="atlas-activity-counts">
          <span>
            {steps.length} {steps.length === 1 ? t("etapa") : t("etapas")}
            {activity.limited &&
              (steps.length === 1 ? t(" registrada") : t(" registradas"))}
          </span>
          {failures > 0 && (
            <span className="atlas-count-warning">
              {failures} {failures === 1 ? t("falha") : t("falhas")}
            </span>
          )}
          {unknown > 0 && (
            <span>
              {unknown} {t("sem confirmação")}
            </span>
          )}
        </span>
        <ChevronRight
          size={15}
          className="atlas-disclosure-chevron"
          aria-hidden="true"
        />
      </summary>
      {activity.limited && (
        <p className="atlas-activity-note">
          {t("O registro de etapas está incompleto.")}
        </p>
      )}
      {steps.length > 0 && (
        <ol aria-label={t("Etapas registradas")}>
          {steps.map((step, i) => {
            const state = statusOf(step, status);
            const Icon =
              state === "succeeded"
                ? Check
                : state === "failed"
                  ? CircleAlert
                  : state === "running"
                    ? Activity
                    : CircleHelp;
            const elapsed = duration(step.duration);
            const reason =
              state === "failed" &&
              step.reason &&
              Object.hasOwn(reasons, step.reason)
                ? t(reasons[step.reason])
                : null;
            return (
              <li key={i} data-state={state}>
                <Icon size={15} aria-hidden="true" />
                <div className="atlas-activity-content">
                  <strong>{stepName(step)}</strong>
                  <span>{t(labels[state])}</span>
                  {reason && <small>{reason}</small>}
                </div>
                {elapsed && (
                  <span
                    className="atlas-step-duration"
                    aria-label={t("Duração da etapa: ") + elapsed}
                  >
                    {elapsed}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}

const eventLabels: Record<string, string> = {
  "tool.started": msg("Ferramenta iniciada"),
  "tool.completed": msg("Ferramenta encerrada"),
  "tool.failed": msg("Falha na ferramenta"),
  "subagent.start": msg("Especialista iniciado"),
  "subagent.complete": msg("Especialista retornou"),
  "approval.requested": msg("Aprovação solicitada"),
  "approval.resolved": msg("Aprovação respondida"),
  "clarify.requested": msg("Esclarecimento solicitado"),
  "clarify.resolved": msg("Esclarecimento respondido"),
};
/** Raw tool previews may contain command arguments, paths or stdout. Only display safe lifecycle labels. */
export function EventUpdates({
  events,
  normalized,
}: {
  events: Run["events"];
  normalized: boolean;
}) {
  const updates = events.flatMap((e) => {
    const kind = e.type || e.event || "";
    if (kind === "message.interim") {
      const text = e.text?.trim();
      return text ? [{ key: e.seq, label: text }] : [];
    }
    const tool = kind.startsWith("tool.");
    if (normalized && (tool || kind.startsWith("subagent."))) return [];
    if (!Object.hasOwn(eventLabels, kind)) return [];
    const name =
      tool && e.tool && /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(e.tool)
        ? e.tool
        : "";
    const label =
      kind === "tool.completed" && e.error === true
        ? t("Falha na ferramenta")
        : t(eventLabels[kind]);
    return [{ key: e.seq, label: name ? label + " · " + name : label }];
  });
  if (!updates.length) return null;
  return (
    <details className="atlas-event-updates">
      <summary>
        {t("Atualizações do agente")} ({updates.length})
      </summary>
      {updates.slice(-12).map((event, i) => (
        <div className="tool-event" key={event.key ?? i}>
          <Activity size={13} aria-hidden="true" />
          <span>{event.label}</span>
        </div>
      ))}
    </details>
  );
}
