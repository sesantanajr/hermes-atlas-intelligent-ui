import React from "react";
import { ArrowUp, LayoutGrid, Paperclip, Square, X } from "lucide-react";
import { t } from "../i18n";

export const messageLimit = 12_000;

export function Composer({
  draft,
  setDraft,
  attachments,
  removeAttachment,
  attach,
  send,
  stop,
  canStop,
  busy,
  ready,
  submitting,
  context,
  nativeSend,
  input,
}: {
  draft: string;
  setDraft: (text: string) => void;
  attachments: { name: string; text: string }[];
  removeAttachment: (index: number) => void;
  attach: (files: FileList | null) => void;
  send: () => void;
  stop: () => void;
  canStop: boolean;
  busy: boolean;
  ready: boolean;
  submitting: boolean;
  /** The canvas travelling with the next message, and whether its draft is saved. */
  context?: { title: string; state: string } | null;
  /** Send to the chat session open in the host (Hermes Desktop) instead of the Atlas chat. */
  nativeSend?: (() => void) | null;
  input: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="composer-wrap">
      {context && (
        <div className="context-chip">
          <LayoutGrid size={14} /> {t("Canvas em contexto")}: {context.title} · {context.state}
        </div>
      )}
      {attachments.map((file, index) => (
        <button className="attachment" key={index} onClick={() => removeAttachment(index)}>
          {file.name} <X size={12} />
        </button>
      ))}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          id="atlas-prompt"
          disabled={!ready || submitting}
          aria-label={t("Mensagem para o Hermes")}
          placeholder={t("O que vamos explorar hoje?")}
          maxLength={messageLimit}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div>
          <span>
            <label className="icon-button" title={t("Anexar texto, Markdown, CSV ou JSON")}>
              <Paperclip size={18} />
              <input
                aria-label={t("Anexar arquivos")}
                disabled={!ready || submitting}
                className="hidden-file"
                type="file"
                multiple
                accept=".txt,.md,.csv,.json,.log"
                onChange={(e) => {
                  attach(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span>{t("Anexar texto")}</span>
          </span>
          {busy ? (
            <button
              type="button"
              className="send"
              aria-label={t("Interromper resposta")}
              disabled={!canStop}
              onClick={stop}
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="send"
              aria-label={t("Enviar mensagem")}
              disabled={!draft.trim() || !ready}
            >
              <ArrowUp size={19} />
            </button>
          )}
        </div>
      </form>
      {nativeSend && (
        <button
          className="native-send"
          disabled={!draft.trim() || submitting || !ready}
          onClick={nativeSend}
        >
          {t("Enviar à sessão ativa do Desktop")}
        </button>
      )}
      <p>
        {t("Enter para enviar · Shift + Enter para nova linha")}{" "}
        <span>{busy ? t("A execução continua no Hermes") : ""}</span>
      </p>
    </div>
  );
}
