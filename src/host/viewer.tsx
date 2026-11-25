/**
 * The exported page: one canvas, fully interactive, with no server behind it.
 *
 * Built into `hermes_atlas/assets/viewer.html` as a single self-contained file. The Python side
 * (`render/html.py`) writes the canvas into the `#atlas-data` element as inert JSON; this script
 * reads it and draws it with the same renderer the workspace uses.
 *
 * 1.1.2: the same page is what the Atlas portal frames in its chat. Framed, it speaks the frame
 * protocol (`embed.ts`): it tells the host its height (no inner scroll bar), follows the host's
 * light or dark theme, hands the host what the person did (kept by the host across reloads, and
 * offered as a message to the agent) and sends the text of its "ask in the chat" buttons to the
 * chat composer. Opened on its own it keeps working as before, now with exports and print.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Maximize2, MessageSquarePlus, Moon, RotateCcw, Sun } from "lucide-react";
import "../theme";
import "./viewer.css";
import { Canvas } from "../blocks/Canvas";
import { canvasCsv } from "../blocks/tabular";
import { downloadTextFile, exportPdf, exportPng, safeName } from "../blocks/exporters";
import { normalizeLocale, setLocale, t, intlLocale } from "../i18n";
import type { Canvas as CanvasData } from "../types";
import { ExportMenu, type ExportHandlers } from "./ExportMenu";
import { canvasMessage, changesMessage, describeChanges, readHostMessage, restoreCanvas } from "./embed";

type Exported = {
  atlas: string;
  locale: string;
  id: string;
  revision: number;
  updated: string;
  canvas: CanvasData;
};

function read(): Exported | null {
  try {
    const data = JSON.parse(document.getElementById("atlas-data")?.textContent ?? "");
    return data && typeof data === "object" && data.canvas ? (data as Exported) : null;
  } catch {
    return null;
  }
}

/** JSON that is safe inside `<script type="application/json">` (as `render/html.py` writes it). */
function inert(value: unknown) {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** This page again, with the canvas as it is now: the person's ticks, edits and order included. */
function pageWith(data: Exported, canvas: CanvasData) {
  const copy = document.documentElement.cloneNode(true) as HTMLElement;
  const holder = copy.querySelector("#atlas-data");
  if (holder) holder.textContent = inert({ ...data, canvas });
  const root = copy.querySelector("#root");
  if (root) root.replaceChildren();
  copy.querySelectorAll("[data-atlas-runtime]").forEach((node) => node.remove());
  return "<!doctype html>\n" + copy.outerHTML;
}

const framed = (() => {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
})();

function post(type: string, payload: Record<string, unknown> = {}) {
  if (framed) window.parent.postMessage(canvasMessage(type, payload), "*");
}

function Viewer({ data }: { data: Exported }) {
  const original = data.canvas;
  const [canvas, setCanvas] = useState(original);
  const [notice, setNotice] = useState("");
  const [hosted, setHosted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const [hostTheme, setHostTheme] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const changes = useMemo(() => describeChanges(original, canvas), [original, canvas]);
  const changed = changes.length > 0;
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const name = safeName(canvas.title);
  const exports: ExportHandlers = {
    png: () => (sheet.current ? exportPng(sheet.current, name) : undefined),
    pdf: () => (sheet.current ? exportPdf(sheet.current, name, canvas.title) : undefined),
    csv: () => {
      const text = canvasCsv(canvas, data.locale === "en" ? "," : ";");
      if (!text) throw new Error(t("este canvas não tem dados em tabela"));
      downloadTextFile(`${name}.csv`, text, "text/csv;charset=utf-8");
    },
    html: () => downloadTextFile(`${name}.html`, pageWith(data, canvas), "text/html;charset=utf-8"),
    json: () =>
      downloadTextFile(
        `${name}.json`,
        JSON.stringify({ atlas: data.atlas, id: data.id, revision: data.revision, canvas }, null, 2) + "\n",
        "application/json",
      ),
    ...(framed ? {} : { print: () => window.print() }),
  };
  const runExport = useRef(exports);
  runExport.current = exports;

  // The host's messages: theme, the state it kept, export requests, reset.
  useEffect(() => {
    if (!framed) return;
    const listen = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const message = readHostMessage(event.data);
      if (!message) return;
      if (message.type === "hello") {
        setHosted(true);
        if (message.theme === "light" || message.theme === "dark") {
          setTheme(message.theme);
          setHostTheme(true);
        }
        if (message.state) setCanvas(restoreCanvas(original, message.state));
      } else if (message.type === "theme" && (message.theme === "light" || message.theme === "dark")) {
        setTheme(message.theme);
        setHostTheme(true);
      } else if (message.type === "export") {
        const format = message.format as keyof ExportHandlers;
        void Promise.resolve(runExport.current[format]?.()).catch((error) =>
          setNotice(t("Não foi possível exportar: {detail}", { detail: error instanceof Error ? error.message : String(error) })),
        );
      } else if (message.type === "reset") setCanvas(original);
    };
    window.addEventListener("message", listen);
    post("ready", { id: data.id, revision: data.revision, title: original.title, atlas: data.atlas });
    return () => window.removeEventListener("message", listen);
  }, [data, original]);

  // The height this page needs, so the host can size its frame and no inner scroll bar appears.
  useEffect(() => {
    if (!framed || typeof ResizeObserver === "undefined") return;
    let last = 0;
    const report = () => {
      const height = Math.ceil(document.documentElement.scrollHeight);
      if (Math.abs(height - last) < 2) return;
      last = height;
      post("height", { height });
    };
    const observer = new ResizeObserver(report);
    observer.observe(document.body);
    report();
    return () => observer.disconnect();
  }, []);

  // What the person did, for the host to keep (debounced: one message per pause).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!framed) return;
    const timer = setTimeout(() => post("state", { canvas, changes, changed }), 400);
    return () => clearTimeout(timer);
  }, [canvas, changes, changed]);

  const onAction = useCallback(
    (text: string) => {
      if (framed && hosted) {
        post("action", { text });
        setNotice(t("Texto colocado na caixa de mensagem do chat. Revise e envie."));
        return;
      }
      void navigator.clipboard
        ?.writeText(text)
        .then(() => setNotice(t("Copiado. Cole na conversa para enviar ao Hermes.")))
        .catch(() => setNotice(text));
    },
    [hosted],
  );
  const when = data.updated ? new Date(data.updated) : null;
  return (
    <div
      ref={sheet}
      className={`atlas-app atlas-viewer${framed ? " framed" : ""}`}
      data-theme={theme}
      data-host-connected={hosted ? "true" : undefined}
    >
      <header className="viewer-head">
        <div>
          <h1>{canvas.title}</h1>
          {canvas.description && <p>{canvas.description}</p>}
        </div>
        <div className="viewer-actions" data-export-skip>
          {changed && (
            <button className="btn small ghost" onClick={() => setCanvas(original)} title={t("Desfazer minhas alterações")}>
              <RotateCcw size={15} /> {t("Desfazer")}
            </button>
          )}
          {changed && hosted && (
            <button className="btn small primary" onClick={() => onAction(changesMessage(canvas, changes))}>
              <MessageSquarePlus size={15} /> {t("Enviar alterações ao chat")}
            </button>
          )}
          <ExportMenu handlers={exports} onError={setNotice} />
          {framed && hosted && (
            <button className="icon-button" aria-label={t("Tela cheia")} title={t("Tela cheia")} onClick={() => post("fullscreen")}>
              <Maximize2 size={17} />
            </button>
          )}
          {!hostTheme && (
            <button
              className="icon-button"
              aria-label={theme === "dark" ? t("Usar tema claro") : t("Usar tema escuro")}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
        </div>
      </header>
      {notice && (
        <p className="viewer-notice" role="status" data-export-skip>
          {notice}
        </p>
      )}
      <main>
        <Canvas canvas={canvas} onChange={setCanvas} onAction={onAction} />
      </main>
      <footer className="viewer-foot">
        {t("Feito com Atlas Intelligent UI {version}", { version: data.atlas })} · v{data.revision}
        {when && !Number.isNaN(when.getTime()) && <> · {when.toLocaleDateString(intlLocale(), { dateStyle: "medium" })}</>}
      </footer>
    </div>
  );
}

const data = read();
const root = document.getElementById("root");
if (data && root) {
  setLocale(normalizeLocale(data.locale));
  createRoot(root).render(<Viewer data={data} />);
  if (!framed && location.hash === "#print") setTimeout(() => window.print(), 600);
} else if (root) {
  root.textContent = "This Atlas export is empty or damaged.";
}
