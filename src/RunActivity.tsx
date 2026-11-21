import React from "react";
import {
  Activity,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
} from "lucide-react";
import type { ActivityStep, Run, RunActivity } from "./types";
import "./run-activity.css";

const reasons: Record<NonNullable<ActivityStep["reason"]>, string> = {
  timeout: "Tempo limite atingido",
  denied: "Permissão negada",
  cancelled: "Cancelamento informado",
  nonzero_exit: "A ferramenta retornou um código de saída diferente de zero",
};
const names: Record<string, string> = {
  terminal: "Terminal",
  execute_code: "Execução de código",
  delegate_task: "Delegação de tarefa",
  read_file: "Leitura de arquivo",
  write_file: "Gravação de arquivo",
  web_search: "Pesquisa na web",
  atlas_render: "Criação de canvas",
  atlas_get: "Leitura de canvas",
  atlas_list: "Consulta de canvases",
  atlas_components: "Consulta de blocos",
  atlas_resources: "Medição de recursos do sistema",
};
const labels: Record<ActivityStep["status"], string> = {
  running: "Em andamento",
  succeeded: "Concluída",
  failed: "Falhou",
  unknown: "Sem confirmação",
};
const runTitles: Record<string, string> = {
  failed: "Execução falhou",
  interrupted: "Execução interrompida",
  cancelled: "Execução cancelada",
  unknown: "Execução sem desfecho confirmado",
};
const stopped = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
  "unknown",
]);
const seconds = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
function duration(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return undefined;
  if (value === 0) return "0 s";
  if (value < 0.1) return "< 0,1 s";
  if (value < 60) return seconds.format(value) + " s";
  const rounded = Math.round(value);
  const rest = rounded % 60;
  return Math.floor(rounded / 60) + " min" + (rest ? " " + rest + " s" : "");
}
function stepName(step: ActivityStep) {
  if (step.kind === "tool")
    return Object.hasOwn(names, step.name)
      ? names[step.name]
      : step.name || "Ferramenta";
  return step.name || "Especialista";
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
        ? "Resposta entregue"
        : "Execução concluída sem resposta de texto"
      : (runTitles[status] ?? "Etapas da execução");
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
            {steps.length} {steps.length === 1 ? "etapa" : "etapas"}
            {activity.limited && (steps.length === 1 ? " registrada" : " registradas")}
          </span>
          {failures > 0 && (
            <span className="atlas-count-warning">
              {failures} {failures === 1 ? "falha" : "falhas"}
            </span>
          )}
          {unknown > 0 && <span>{unknown} sem confirmação</span>}
        </span>
        <ChevronRight
          size={15}
          className="atlas-disclosure-chevron"
          aria-hidden="true"
        />
      </summary>
      {activity.limited && (
        <p className="atlas-activity-note">
          O registro de etapas está incompleto.
        </p>
      )}
      {steps.length > 0 && (
        <ol aria-label="Etapas registradas">
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
                ? reasons[step.reason]
                : null;
            return (
              <li key={i} data-state={state}>
                <Icon size={15} aria-hidden="true" />
                <div className="atlas-activity-content">
                  <strong>{stepName(step)}</strong>
                  <span>{labels[state]}</span>
                  {reason && <small>{reason}</small>}
                </div>
                {elapsed && (
                  <span
                    className="atlas-step-duration"
                    aria-label={"Duração da etapa: " + elapsed}
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
  "tool.started": "Ferramenta iniciada",
  "tool.completed": "Ferramenta encerrada",
  "tool.failed": "Falha na ferramenta",
  "subagent.start": "Especialista iniciado",
  "subagent.complete": "Especialista retornou",
  "approval.requested": "Aprovação solicitada",
  "approval.resolved": "Aprovação respondida",
  "clarify.requested": "Esclarecimento solicitado",
  "clarify.resolved": "Esclarecimento respondido",
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
        ? "Falha na ferramenta"
        : eventLabels[kind];
    return [{ key: e.seq, label: name ? label + " · " + name : label }];
  });
  if (!updates.length) return null;
  return (
    <details className="atlas-event-updates">
      <summary>Atualizações do agente ({updates.length})</summary>
      {updates.slice(-12).map((event, i) => (
        <div className="tool-event" key={event.key ?? i}>
          <Activity size={13} aria-hidden="true" />
          <span>{event.label}</span>
        </div>
      ))}
    </details>
  );
}
