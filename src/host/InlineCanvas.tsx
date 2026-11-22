/**
 * A saved canvas on its own: inside a Hermes Desktop conversation (the `::atlas{...}` directive)
 * or anywhere else a single canvas is embedded.
 *
 * It loads the revision the reply named, lets the person interact, and keeps what they do as a
 * draft on the server, without creating a revision until they save one. That draft is what the
 * agent reads back with `atlas_get`, so a tick here is visible to the agent on its next turn.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  LayoutGrid,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import "../theme";
import { Canvas } from "../blocks/Canvas";
import { t, useLocale } from "../i18n";
import type {
  Canvas as CanvasData,
  Draft,
  ExportedFile,
  Record as CanvasRecord,
} from "../types";
import { ApiError, type Api, downloadText } from "./client";
import type { Host } from "./context";
import { useResolvedTheme } from "./theme";

type Phase = "loading" | "ready" | "missing" | "error";
const SAVE_DELAY = 700;

/** Other parts of the page announce a changed canvas here (Desktop events, a save elsewhere). */
const changes = new Set<(id: string) => void>();
export function announceCanvasChange(id: string) {
  changes.forEach((listener) => listener(id));
}

export function InlineCanvas({
  canvasId,
  revision,
  api,
  host,
  sessionId,
  streaming = false,
}: {
  canvasId: string;
  revision?: number;
  api: Api;
  host: Host;
  sessionId?: string | null;
  streaming?: boolean;
}) {
  useLocale();
  const root = useRef<HTMLElement>(null);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const theme = useResolvedTheme("system", host.kind, element);
  const [phase, setPhase] = useState<Phase>("loading");
  const [record, setRecord] = useState<CanvasRecord | null>(null);
  const [canvas, setCanvas] = useState<CanvasData | null>(null);
  const [edited, setEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(true);
  const [newer, setNewer] = useState(0);
  const token = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<CanvasData | null>(null);
  const alive = useRef(true);
  const current = useRef<CanvasRecord | null>(null);
  current.current = record;

  const load = useCallback(async () => {
    try {
      const query = revision ? `?revision=${revision}` : "";
      const found = await api<CanvasRecord>(
        `/canvases/${encodeURIComponent(canvasId)}${query}`,
      );
      const draft = await api<Draft | null>(
        `/canvases/${encodeURIComponent(canvasId)}/draft`,
      ).catch(() => null);
      if (!alive.current) return;
      const mine = draft && draft.base_revision === found.revision ? draft : null;
      token.current = mine?.token;
      setRecord(found);
      setCanvas(mine ? mine.canvas : found.canvas);
      setEdited(!!mine);
      setPhase("ready");
      if (revision) {
        const head = await api<CanvasRecord>(
          `/canvases/${encodeURIComponent(canvasId)}`,
        ).catch(() => null);
        if (alive.current && head && head.revision > found.revision)
          setNewer(head.revision);
      }
    } catch (error) {
      if (!alive.current) return;
      setPhase(error instanceof ApiError && error.status === 404 ? "missing" : "error");
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [api, canvasId, revision]);

  useEffect(() => {
    alive.current = true;
    void load();
    const stop = (id: string) => {
      if (id === canvasId && !latest.current) void load();
    };
    changes.add(stop);
    return () => {
      alive.current = false;
      changes.delete(stop);
      clearTimeout(timer.current);
      // A transcript unmounts cards it scrolls away from: send the last change instead of
      // dropping it with the delayed save.
      const pending = latest.current;
      const base = current.current;
      latest.current = null;
      if (pending && base)
        void api(
          `/canvases/${encodeURIComponent(canvasId)}/draft`,
          { canvas: pending, base_revision: base.revision, expected_token: token.current },
          "PUT",
        ).catch(() => null);
    };
  }, [load, canvasId, api]);

  const flush = async () => {
    const pending = latest.current;
    if (!pending || !record) return;
    latest.current = null;
    setSaving(true);
    try {
      const saved = await api<Draft>(
        `/canvases/${encodeURIComponent(canvasId)}/draft`,
        { canvas: pending, base_revision: record.revision, expected_token: token.current },
        "PUT",
      );
      token.current = saved.token;
      if (alive.current) setNotice("");
    } catch (error) {
      if (!alive.current) return;
      // Another window changed the draft, or the revision is gone: show what the server has.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        setNotice(t("Este canvas mudou em outra janela. Mostrando a versão atual."));
        void load();
      } else setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      if (alive.current) setSaving(false);
      if (latest.current) timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    }
  };

  const change = (next: CanvasData) => {
    setCanvas(next);
    setEdited(true);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };

  const saveVersion = async () => {
    if (!canvas || !record) return;
    clearTimeout(timer.current);
    latest.current = null;
    setSaving(true);
    try {
      const saved = await api<CanvasRecord>(
        `/canvases?expected_revision=${record.revision}`,
        canvas,
      );
      token.current = undefined;
      setRecord(saved);
      setCanvas(saved.canvas);
      setEdited(false);
      setNewer(0);
      setNotice(t("Versão {n} salva com suas alterações.", { n: saved.revision }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (!record) return;
    clearTimeout(timer.current);
    latest.current = null;
    await api(`/canvases/${encodeURIComponent(canvasId)}/draft`, {}, "DELETE").catch(
      () => null,
    );
    token.current = undefined;
    setCanvas(record.canvas);
    setEdited(false);
    setNotice("");
  };

  const exportHtml = async () => {
    if (!record) return;
    try {
      const file = await api<ExportedFile>(
        `/canvases/${encodeURIComponent(canvasId)}/export?format=html&revision=${record.revision}`,
      );
      downloadText(file.filename, file.content, file.media_type);
    } catch {
      downloadText(`${canvasId}.json`, JSON.stringify(canvas, null, 2));
    }
  };

  const action = async (text: string) => {
    const taken = host.insertIntoChat
      ? await host.insertIntoChat(text, sessionId)
      : false;
    if (taken) {
      setNotice(t("Adicionado à sua mensagem. Revise e envie."));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t("Copiado. Cole na conversa para enviar ao Hermes."));
    } catch {
      setNotice(t("Abra a conversa para enviar: {text}", { text }));
    }
  };

  const attach = (node: HTMLElement | null) => {
    (root as React.MutableRefObject<HTMLElement | null>).current = node;
    setElement(node);
  };
  const frame = (children: React.ReactNode) => (
    <section
      ref={attach}
      className="atlas-app atlas-inline"
      data-host={host.kind === "standalone" ? undefined : host.kind}
      data-theme={theme}
      aria-label={t("Canvas do Atlas")}
    >
      {children}
    </section>
  );

  if (phase === "loading")
    return frame(
      <p className="inline-status" role="status">
        <LoaderCircle size={16} className="atlas-spin" />
        {streaming ? t("Preparando o canvas…") : t("Carregando o canvas…")}
      </p>,
    );
  if (phase !== "ready" || !canvas || !record)
    return frame(
      <p className="inline-status" role="alert">
        <LayoutGrid size={16} />
        {phase === "missing"
          ? t("Este canvas não está mais na biblioteca do Atlas.")
          : t("Não foi possível carregar o canvas. {detail}", { detail: notice })}
        {phase === "error" && (
          <button className="btn small" onClick={() => void load()}>
            {t("Tentar novamente")}
          </button>
        )}
      </p>,
    );

  return frame(
    <>
      <header className="inline-head">
        <button
          className="icon-button"
          aria-expanded={open}
          aria-label={open ? t("Recolher canvas") : t("Expandir canvas")}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </button>
        <div className="inline-title">
          <h2>{canvas.title}</h2>
          {!open && canvas.description && <p>{canvas.description}</p>}
        </div>
        <span className="chip">v{record.revision}</span>
        <div className="inline-actions">
          {edited && (
            <>
              <button
                className="icon-button"
                aria-label={t("Descartar minhas alterações")}
                title={t("Descartar minhas alterações")}
                onClick={() => void discard()}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="btn small"
                disabled={saving}
                onClick={() => void saveVersion()}
              >
                <Check size={14} /> {t("Salvar versão")}
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label={t("Baixar como página HTML")}
            title={t("Baixar como página HTML")}
            onClick={() => void exportHtml()}
          >
            <Download size={16} />
          </button>
          {host.openWorkspace && (
            <button
              className="icon-button"
              aria-label={t("Abrir no Atlas")}
              title={t("Abrir no Atlas")}
              onClick={() => host.openWorkspace?.(canvasId, record.revision)}
            >
              <ExternalLink size={16} />
            </button>
          )}
        </div>
      </header>
      {open && (
        <div className="inline-body">
          {canvas.description && (
            <p className="inline-description">{canvas.description}</p>
          )}
          <Canvas canvas={canvas} onChange={change} onAction={(text) => void action(text)} />
        </div>
      )}
      {(notice || saving || edited || newer > 0) && (
        <footer className="inline-foot" role="status">
          <span>
            {notice ||
              (saving
                ? t("Salvando suas alterações…")
                : edited
                  ? t("Alterações guardadas como rascunho. O Hermes já consegue vê-las.")
                  : "")}
          </span>
          {newer > 0 && (
            <button
              className="btn small ghost"
              onClick={() => host.openWorkspace?.(canvasId, newer)}
              disabled={!host.openWorkspace}
            >
              {t("Existe a versão {n}", { n: newer })}
            </button>
          )}
        </footer>
      )}
    </>,
  );
}
