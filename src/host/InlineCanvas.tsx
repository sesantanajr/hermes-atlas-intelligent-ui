/**
 * A saved canvas on its own: inside a Hermes Desktop conversation (the `::atlas{...}` directive)
 * or anywhere else a single canvas is embedded.
 *
 * It loads the revision the reply named, lets the person interact, and keeps what they do as a
 * draft on the server, without creating a revision until they save one. That draft is what the
 * agent reads back with `atlas_get`, so a tick here is visible to the agent on its next turn.
 *
 * Every write of a card (draft saves, a discard, a new version, the last change when the card
 * unmounts) runs through one queue, one after another: each reads the draft token and the revision
 * the previous one left, so two of them can never race each other into a conflict.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import "../theme";
import { Canvas } from "../blocks/Canvas";
import { getLocale, t, useLocale } from "../i18n";
import { canvasCsv } from "../blocks/tabular";
import { downloadTextFile, exportPdf, exportPng, safeName } from "../blocks/exporters";
import { ExportMenu, type ExportHandlers } from "./ExportMenu";
import type {
  Canvas as CanvasData,
  Draft,
  ExportedFile,
  Record as CanvasRecord,
} from "../types";
import {
  ApiError,
  CANVAS_NOT_FOUND,
  REVISION_NOT_FOUND,
  type Api,
  downloadText,
  isCanvasMissing,
} from "./client";
import { copyText, type Host } from "./context";
import { useResolvedTheme } from "./theme";

type Phase = "loading" | "ready" | "missing" | "error";
const SAVE_DELAY = 700;

/**
 * Other parts of the page announce a changed canvas here (Desktop events, a save elsewhere): its
 * id and, when known, the revision that was saved (none for a deletion).
 */
const changes = new Set<(id: string, revision?: number) => void>();
export function announceCanvasChange(id: string, revision?: number) {
  changes.forEach((listener) => listener(id, revision));
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The draft this card wrote was replaced by another window, or its revision is gone. */
const draftConflict = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 409 ||
    (error.status === 404 && [CANVAS_NOT_FOUND, REVISION_NOT_FOUND].includes(error.detail)));

export function InlineCanvas({
  canvasId,
  revision,
  api,
  host,
  sessionId,
  streaming = false,
  fallback,
}: {
  canvasId: string;
  revision?: number;
  api: Api;
  host: Host;
  sessionId?: string | null;
  streaming?: boolean;
  /** Drawn instead of the error notice when the canvas cannot be loaded for a reason other than
   *  having been deleted (Hermes Desktop's own file card for a `MEDIA:` page). */
  fallback?: React.ReactNode;
}) {
  useLocale();
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
  // A failure right after the person asked for a retry is announced; one on arrival is not.
  const [retried, setRetried] = useState(false);
  const token = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The person's latest change that no write has taken yet. */
  const latest = useRef<CanvasData | null>(null);
  /** The canvas on screen, including a change React has not rendered yet. */
  const shown = useRef<CanvasData | null>(null);
  /** The revision on screen. Writes read it here, never from a render's closure. */
  const current = useRef<CanvasRecord | null>(null);
  /** The revision this card loads: the reply's, then the one the person saved; none = the latest. */
  const target = useRef<number | undefined>(revision);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const loads = useRef(0);
  const alive = useRef(true);
  // Writes and loads go through the connection the card has now (Desktop hands a new one after a
  // gateway switch), including the last change written while the card unmounts.
  const client = useRef(api);
  client.current = api;
  const path = `/canvases/${encodeURIComponent(canvasId)}`;

  const showRecord = (next: CanvasRecord) => {
    current.current = next;
    setRecord(next);
  };
  const showCanvas = (next: CanvasData) => {
    shown.current = next;
    setCanvas(next);
  };

  /** Run `task` after every write queued before it, whatever their outcome. */
  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  };

  const load = useCallback(async () => {
    const ticket = ++loads.current;
    // What the person did reaches the server before the card reads it back.
    await queue.current;
    if (!alive.current || ticket !== loads.current) return;
    const call = client.current;
    const stale = () => !alive.current || ticket !== loads.current;
    try {
      const wanted = target.current;
      const found = await call<CanvasRecord>(wanted ? `${path}?revision=${wanted}` : path);
      const draft = await call<Draft | null>(`${path}/draft`).catch(() => null);
      if (stale()) return;
      const mine = draft && draft.base_revision === found.revision ? draft : null;
      token.current = mine?.token;
      showRecord(found);
      showCanvas(mine ? mine.canvas : found.canvas);
      setEdited(!!mine);
      setPhase("ready");
      if (!wanted) {
        setNewer(0);
        return;
      }
      const head = await call<CanvasRecord>(path).catch(() => null);
      if (!stale()) setNewer(head && head.revision > found.revision ? head.revision : 0);
    } catch (error) {
      if (stale()) return;
      // Only the server's own answer means the canvas is gone. Hermes answers 404 too while the
      // plugin's backend is off, and that is worth a retry, not a "deleted".
      setPhase(isCanvasMissing(error) ? "missing" : "error");
      setNotice(errorText(error));
    }
  }, [path]);

  /** Hand the person's latest change to the queue; the write reads the token the last one left. */
  const flush = () =>
    enqueue(async () => {
      const pending = latest.current;
      const base = current.current;
      if (!pending || !base) return;
      latest.current = null;
      if (alive.current) setSaving(true);
      try {
        const saved = await client.current<Draft>(
          `${path}/draft`,
          { canvas: pending, base_revision: base.revision, expected_token: token.current },
          "PUT",
        );
        token.current = saved.token;
        if (alive.current) setNotice("");
      } catch (error) {
        if (!alive.current) return;
        if (draftConflict(error)) {
          // Another window changed the draft, or the revision is gone: show what the server has,
          // and drop what this card had not written yet rather than lay it over theirs.
          clearTimeout(timer.current);
          latest.current = null;
          setNotice(t("Este canvas mudou em outra janela. Mostrando a versão atual."));
          void load();
        } else setNotice(errorText(error));
      } finally {
        if (alive.current) setSaving(false);
      }
    });

  useEffect(() => {
    alive.current = true;
    void load();
    const listener = (id: string, saved?: number) => {
      if (id !== canvasId) return;
      const showing = current.current?.revision;
      // The version on screen (the person's own save, announced back): nothing new to show.
      if (saved !== undefined && saved === showing) return;
      // A card that shows a given version keeps it, and so does one the person is changing: they
      // point at the newer version instead.
      if (saved !== undefined && (target.current !== undefined || latest.current)) {
        if (showing === undefined || saved > showing) setNewer((n) => Math.max(n, saved));
        return;
      }
      if (!latest.current) void load();
    };
    changes.add(listener);
    return () => {
      alive.current = false;
      changes.delete(listener);
      clearTimeout(timer.current);
      // A transcript unmounts cards it scrolls away from: write the last change instead of dropping
      // it, after whatever write is still under way.
      if (latest.current) void flush();
    };
  }, [load, api]);

  const change = (next: CanvasData) => {
    showCanvas(next);
    setEdited(true);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };

  const saveVersion = async () => {
    if (!current.current) return;
    clearTimeout(timer.current);
    setSaving(true);
    try {
      const saved = await enqueue(async () => {
        const base = current.current!;
        const snapshot = shown.current ?? base.canvas;
        latest.current = null; // the change goes into this version, not into a draft
        const result = await client.current<CanvasRecord>(
          `/canvases?expected_revision=${base.revision}`,
          snapshot,
        );
        token.current = undefined; // the server discarded the draft with the save
        current.current = result;
        // A card that showed the reply's version now shows the one the person saved; one that
        // follows the latest version keeps following it.
        if (target.current !== undefined) target.current = result.revision;
        return result;
      });
      if (!alive.current) return;
      showRecord(saved);
      // A change made while the version was being saved stays on screen, as a draft of it.
      if (latest.current) setEdited(true);
      else {
        showCanvas(saved.canvas);
        setEdited(false);
      }
      setNewer(0);
      setNotice(t("Versão {n} salva com suas alterações.", { n: saved.revision }));
    } catch (error) {
      if (alive.current) setNotice(errorText(error));
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  const discard = async () => {
    if (!current.current) return;
    clearTimeout(timer.current);
    latest.current = null;
    try {
      await enqueue(async () => {
        await client.current(`${path}/draft`, {}, "DELETE");
        token.current = undefined;
      });
    } catch (error) {
      // The draft is still on the server, and the agent still reads it: say so, keep it on screen.
      if (alive.current)
        setNotice(t("Não foi possível descartar suas alterações. {detail}", { detail: errorText(error) }));
      return;
    }
    if (!alive.current || !current.current) return;
    showCanvas(current.current.canvas);
    setEdited(false);
    setNotice("");
  };

  const retry = () => {
    setRetried(true);
    void load();
  };

  const exportFile = async (format: "html" | "markdown") => {
    if (!record) return;
    try {
      const file = await api<ExportedFile>(
        `${path}/export?format=${format}&revision=${record.revision}`,
      );
      downloadText(file.filename, file.content, file.media_type);
    } catch {
      downloadText(`${canvasId}.json`, JSON.stringify(canvas, null, 2));
    }
  };
  const sheet = useRef<HTMLDivElement>(null);
  const fileName = safeName(canvas?.title ?? canvasId);
  // 1.1.2: every format in one menu. PNG and PDF are drawn from what is on screen, edits included.
  const exports: ExportHandlers = {
    png: () => (sheet.current ? exportPng(sheet.current, fileName) : undefined),
    pdf: () => (sheet.current ? exportPdf(sheet.current, fileName, canvas?.title ?? "Atlas") : undefined),
    csv: () => {
      const text = canvas ? canvasCsv(canvas, getLocale() === "en" ? "," : ";") : null;
      if (!text) throw new Error(t("este canvas não tem dados em tabela"));
      downloadTextFile(`${fileName}.csv`, text, "text/csv;charset=utf-8");
    },
    html: () => exportFile("html"),
    markdown: () => exportFile("markdown"),
    json: () => downloadText(`${fileName}.json`, JSON.stringify(canvas, null, 2)),
  };

  const action = async (text: string) => {
    const taken = host.insertIntoChat
      ? await host.insertIntoChat(text, sessionId)
      : false;
    if (taken) {
      setNotice(t("Adicionado à sua mensagem. Revise e envie."));
      return;
    }
    if (await copyText(host, text))
      setNotice(t("Copiado. Cole na conversa para enviar ao Hermes."));
    else setNotice(t("Abra a conversa para enviar: {text}", { text }));
  };

  const frame = (children: React.ReactNode) => (
    <section
      ref={setElement}
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
  if (phase === "error" && fallback !== undefined) return <>{fallback}</>;
  if (phase !== "ready" || !canvas || !record)
    return frame(
      <p className="inline-status" role={retried ? "alert" : "status"}>
        <LayoutGrid size={16} />
        {phase === "missing"
          ? t("Este canvas não está mais na biblioteca do Atlas.")
          : t("Não foi possível carregar o canvas. {detail}", { detail: notice })}
        {phase === "error" && (
          <button className="btn small" onClick={retry}>
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
          <ExportMenu handlers={exports} onError={setNotice} compact />
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
        <div className="inline-body" ref={sheet}>
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
