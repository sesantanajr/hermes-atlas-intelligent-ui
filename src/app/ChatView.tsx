import React, { useState } from "react";
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
  /** Give the conversation a new name (already trimmed, never empty). */
  rename: (title: string) => void;
  exportChat: () => void;
  remove: () => void;
  copy: (text: string) => void;
  reuse: (text: string) => void;
  openCanvas: (id: string, revision: number) => void;
  control: (action: string, body?: unknown) => Promise<boolean>;
}) {
  const live = run && !terminal.has(run.status);
  // The new name being typed, in place of the title (Hermes Desktop has no `window.prompt`).
  const [naming, setNaming] = useState<string | null>(null);
  const editing = naming !== null && !!conversation;
  const typed = (naming ?? "").trim();
  return (
    <div className="messages" ref={scroller} onScroll={onScroll}>
      <div className="chat-heading">
        {editing ? (
          <form
            className="chat-rename"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed && typed !== conversation?.title) rename(typed);
              setNaming(null);
            }}
          >
            <input
              aria-label={t("Nome da conversa")}
              value={naming ?? ""}
              maxLength={160}
              autoFocus
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNaming(null);
              }}
            />
            <button type="submit" className="btn small" disabled={!typed}>
              {t("Salvar")}
            </button>
            <button type="button" className="btn small ghost" onClick={() => setNaming(null)}>
              {t("Cancelar")}
            </button>
          </form>
        ) : (
          <span>{conversation?.title || t("Conversa")}</span>
        )}
        <div>
          {conversation && !editing && (
            <>
              <button
                className="icon-button"
                aria-label={t("Renomear conversa")}
                onClick={() => setNaming(conversation.title || "")}
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
