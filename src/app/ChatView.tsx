import React from "react";
import { Check, Copy, Download, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { LiveCanvasPreview } from "../blocks/LiveCanvasPreview";
import { intlLocale, serverText, t } from "../i18n";
import type { Conversation, Message, Run } from "../types";
import { Markdown } from "./Markdown";
import { EventUpdates, RunActivityDetails } from "./RunActivity";
import { RunControl } from "./RunControl";
import { AtlasMark } from "./Sidebar";

export const terminal = new Set(["completed", "failed", "cancelled", "interrupted"]);

/** Wording for each state of a run while it is still going. */
export function runStateLabel(status: string): string {
  switch (status) {
    case "submitting":
      return t("Enviando ao Hermes");
    case "queued":
      return t("Na fila do Hermes");
    case "started":
    case "running":
      return t("Hermes trabalhando");
    case "stopping":
      return t("Interrompendo com segurança");
    case "waiting_for_approval":
      return t("Aguardando sua decisão");
    case "unknown":
      return t("Execução sem desfecho confirmado");
    default:
      return status;
  }
}

function MessageItem({
  message,
  announce,
  copy,
  reuse,
  openCanvas,
}: {
  message: Message;
  announce: boolean;
  copy: (text: string) => void;
  reuse: (text: string) => void;
  openCanvas: (id: string, revision: number) => void;
}) {
  const m = message;
  const bare = !m.content.trim() && !m.artifact && !m.warning;
  if (m.role === "assistant" && (m.activity?.steps.length || m.activity?.limited) && bare)
    return <RunActivityDetails activity={m.activity} status={m.status} />;
  if (m.delivery === "silent" && !m.content && !m.artifact && !m.warning)
    return (
      <p className="message-receipt" role={announce ? "status" : undefined}>
        <Check size={15} aria-hidden="true" />
        {t("O Hermes concluiu o pedido sem enviar uma resposta.")}
      </p>
    );
  return (
    <article className={`message ${m.role}`}>
      <span className="avatar">{m.role === "user" ? t("Você") : <AtlasMark size={18} />}</span>
      <div>
        <div className="message-meta">
          <strong>{m.role === "user" ? t("Você") : "Hermes Atlas"}</strong>
          <time dateTime={m.created}>
            {new Date(m.created).toLocaleTimeString(intlLocale(), {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {m.content.trim() && (
            <button
              className="icon-button"
              aria-label={t("Copiar mensagem")}
              onClick={() => copy(m.content)}
            >
              <Copy size={14} />
            </button>
          )}
          {m.role === "user" && (
            <button
              className="icon-button"
              aria-label={t("Usar mensagem novamente")}
              onClick={() => reuse(m.content)}
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
        {m.role === "assistant" && (
          <RunActivityDetails
            activity={m.activity}
            status={m.status}
            delivered={!!(m.content.trim() || m.artifact)}
          />
        )}
        {!!m.content.trim() && <Markdown text={m.content} />}
        {m.warning && <p className="message-warning">{serverText(m.warning)}</p>}
        {m.artifact && (
          <button
            className="inline-action"
            onClick={() => openCanvas(m.artifact!.id, m.artifact!.revision)}
          >
            <LayoutGrid size={16} /> {t("Abrir canvas")} · v{m.artifact.revision}
          </button>
        )}
        {m.usage?.total_tokens != null && (
          <small>
            {m.usage.total_tokens.toLocaleString(intlLocale())} {t("tokens")}
          </small>
        )}
      </div>
    </article>
  );
}

export function ChatView({
  conversation,
  messages,
  run,
  liveText,
  events,
  connectionIssue,
  busy,
  scroller,
  onScroll,
  rename,
  exportChat,
  remove,
  copy,
  reuse,
  openCanvas,
  control,
}: {
  conversation: Conversation | null;
  messages: Message[];
  run: Run | null;
  liveText: string;
  events: Run["events"];
  connectionIssue?: string | null;
  busy: boolean;
  scroller: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  rename: () => void;
  exportChat: () => void;
  remove: () => void;
  copy: (text: string) => void;
  reuse: (text: string) => void;
  openCanvas: (id: string, revision: number) => void;
  control: (action: string, body?: unknown) => Promise<boolean>;
}) {
  const live = run && !terminal.has(run.status);
  return (
    <div className="messages" ref={scroller} onScroll={onScroll}>
      <div className="chat-heading">
        <span>{conversation?.title || t("Conversa")}</span>
        <div>
          {conversation && (
            <>
              <button
                className="icon-button"
                aria-label={t("Renomear conversa")}
                onClick={rename}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={t("Exportar conversa")}
                onClick={exportChat}
              >
                <Download size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={t("Excluir conversa")}
                disabled={busy}
                onClick={remove}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          announce={run?.status === "completed" && index === messages.length - 1}
          copy={copy}
          reuse={reuse}
          openCanvas={openCanvas}
        />
      ))}
      {live && (
        <article className="message assistant live">
          <span className="avatar">
            <AtlasMark size={18} />
          </span>
          <div>
            <div className="thinking" role="status">
              {runStateLabel(run.status)}
              <i />
            </div>
            <RunActivityDetails activity={run.activity} status={run.status} />
            {!!liveText.trim() && <Markdown text={liveText} />}
            <LiveCanvasPreview canvas={run.preview ?? undefined} />
            <EventUpdates events={events} normalized={!!run.activity} />
            {connectionIssue && (
              <p role="status">
                {connectionIssue} {t("Reconectando à mesma execução…")}
              </p>
            )}
            {run.pending_controls?.map((prompt) => (
              <RunControl
                key={`${run.id}:${prompt.execution_generation}:${prompt.prompt_id}`}
                prompt={prompt}
                respond={control}
              />
            ))}
            {run.status === "unknown" && (
              <button
                className="inline-action"
                onClick={() => {
                  if (
                    window.confirm(
                      t("Reconhecer que esta execução foi interrompida? Verifique seus efeitos no Hermes antes de continuar."),
                    )
                  )
                    void control(
                      "resolve-unknown",
                      run.remote_id
                        ? {
                            admission_id: run.admission_id,
                            execution_generation: run.execution_generation,
                          }
                        : {},
                    );
                }}
              >
                {t("Reconhecer interrupção")}
              </button>
            )}
          </div>
        </article>
      )}
    </div>
  );
}
