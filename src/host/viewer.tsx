/**
 * The exported page: one canvas, fully interactive, with no server behind it.
 *
 * Built into `hermes_atlas/assets/viewer.html` as a single self-contained file. The Python side
 * (`render/html.py`) writes the canvas into the `#atlas-data` element as inert JSON; this script
 * reads it and draws it with the same renderer the workspace uses. Interaction stays in the page
 * (nothing is saved or sent), and actions that would message the agent copy their text instead.
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Moon, Sun } from "lucide-react";
import "../theme";
import "./viewer.css";
import { Canvas } from "../blocks/Canvas";
import { normalizeLocale, setLocale, t, intlLocale } from "../i18n";
import type { Canvas as CanvasData } from "../types";

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

function Viewer({ data }: { data: Exported }) {
  const [canvas, setCanvas] = useState(data.canvas);
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  const when = data.updated ? new Date(data.updated) : null;
  return (
    <div className="atlas-app atlas-viewer" data-theme={theme}>
      <header className="viewer-head">
        <div>
          <h1>{canvas.title}</h1>
          {canvas.description && <p>{canvas.description}</p>}
        </div>
        <button
          className="icon-button"
          aria-label={theme === "dark" ? t("Usar tema claro") : t("Usar tema escuro")}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      {notice && (
        <p className="viewer-notice" role="status">
          {notice}
        </p>
      )}
      <main>
        <Canvas
          canvas={canvas}
          onChange={setCanvas}
          onAction={(text) => {
            void navigator.clipboard
              ?.writeText(text)
              .then(() => setNotice(t("Copiado. Cole na conversa para enviar ao Hermes.")))
              .catch(() => setNotice(text));
          }}
        />
      </main>
      <footer className="viewer-foot">
        {t("Exportado do Hermes Atlas {version}", { version: data.atlas })} · v{data.revision}
        {when && !Number.isNaN(when.getTime()) && (
          <> · {when.toLocaleDateString(intlLocale(), { dateStyle: "medium" })}</>
        )}
      </footer>
    </div>
  );
}

const data = read();
const root = document.getElementById("root");
if (data && root) {
  setLocale(normalizeLocale(data.locale));
  createRoot(root).render(<Viewer data={data} />);
} else if (root) {
  root.textContent = "This Atlas export is empty or damaged.";
}
