import React, { useState } from "react";
import {
  Check,
  Copy,
  Download,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Redo2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Canvas } from "../blocks/Canvas";
import { intlLocale, t } from "../i18n";
import type { Canvas as CanvasData, Summary } from "../types";

export type ExportFormat = "html" | "markdown" | "json";

/** The open canvas: toolbar, version history, and the canvas itself or its JSON. */
export function CanvasPane({
  canvas,
  revision,
  versions,
  saving,
  compact,
  expanded,
  setExpanded,
  canUndo,
  canRedo,
  undo,
  redo,
  change,
  action,
  save,
  close,
  remove,
  exportAs,
  openVersion,
  copy,
  htmlExport,
}: {
  canvas: CanvasData;
  revision: number;
  versions: Summary[];
  saving: boolean;
  compact: boolean;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  change: (canvas: CanvasData) => void;
  action: (text: string) => void;
  save: () => void;
  close: () => void;
  remove: () => void;
  exportAs: (format: ExportFormat) => void;
  openVersion: (revision: number) => void;
  copy: (text: string) => void;
  htmlExport: boolean;
}) {
  const [tab, setTab] = useState<"preview" | "json">("preview");
  const [menu, setMenu] = useState(false);
  const saved = revision > 0;
  const choose = (format: ExportFormat) => {
    setMenu(false);
    exportAs(format);
  };
  return (
    <aside className="canvas-pane">
      <div className="canvas-toolbar">
        <span>
          <LayoutGrid size={16} /> Canvas{" "}
          <small>{saved ? `v${revision}` : t("Rascunho")}</small>
        </span>
        <div>
          <button
            className="icon-button"
            aria-label={expanded ? t("Mostrar conversa e canvas") : t("Ampliar canvas")}
            title={expanded ? t("Mostrar conversa e canvas") : t("Ampliar canvas")}
            hidden={compact}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            className="icon-button"
            aria-label={t("Desfazer interação")}
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Refazer interação")}
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
          <div className="menu-anchor">
            <button
              className="icon-button"
              aria-label={t("Exportar canvas")}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Download size={17} />
            </button>
            {menu && (
              <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
                <button
                  role="menuitem"
                  disabled={!saved || !htmlExport}
                  title={
                    saved ? undefined : t("Salve uma versão para exportar em HTML ou Markdown.")
                  }
                  onClick={() => choose("html")}
                >
                  {t("Página HTML interativa")}
                </button>
                <button role="menuitem" disabled={!saved} onClick={() => choose("markdown")}>
                  Markdown
                </button>
                <button role="menuitem" onClick={() => choose("json")}>
                  JSON
                </button>
              </div>
            )}
          </div>
          {saved && (
            <button
              className="icon-button"
              aria-label={t("Excluir canvas da biblioteca")}
              title={t("Excluir canvas da biblioteca")}
              onClick={remove}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button className="icon-button" aria-label={t("Fechar canvas")} onClick={close}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="canvas-content">
        <div className="canvas-eyebrow">
          {saving ? t("SALVANDO INTERAÇÕES") : t("SEU CANVAS INTERATIVO")}
        </div>
        <h2>{canvas.title}</h2>
        <p>{canvas.description}</p>
        <div className="canvas-tabs">
          <div role="tablist" aria-label={t("Visualização do canvas")}>
            <button
              role="tab"
              aria-selected={tab === "preview"}
              onClick={() => setTab("preview")}
            >
              {t("Interagir")}
            </button>
            <button role="tab" aria-selected={tab === "json"} onClick={() => setTab("json")}>
              JSON
            </button>
          </div>
          <button className="btn small" onClick={save}>
            <Check size={14} /> {t("Salvar versão")}
          </button>
        </div>
        {versions.length > 1 && (
          <label className="version-picker">
            {t("Histórico")}{" "}
            <select
              aria-label={t("Versão do canvas")}
              value={revision}
              onChange={(e) => openVersion(Number(e.target.value))}
            >
              {versions.map((version) => (
                <option value={version.revision} key={version.revision}>
                  v{version.revision} · {new Date(version.updated).toLocaleString(intlLocale())}
                </option>
              ))}
            </select>
          </label>
        )}
        {tab === "preview" ? (
          <Canvas canvas={canvas} onChange={change} onAction={action} />
        ) : (
          <div className="json-view">
            <button className="btn small" onClick={() => copy(JSON.stringify(canvas, null, 2))}>
              <Copy size={15} /> {t("Copiar")}
            </button>
            <pre>{JSON.stringify(canvas, null, 2)}</pre>
          </div>
        )}
      </div>
    </aside>
  );
}
