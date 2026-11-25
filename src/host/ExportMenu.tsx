/**
 * "Exportar" (1.1.2): one button with the formats a canvas can be saved as. Each host passes the
 * formats it can produce; the menu only lists those.
 */
import React, { useEffect, useRef, useState } from "react";
import { Braces, Download, FileCode2, FileImage, FileSpreadsheet, FileText, LoaderCircle, Printer } from "lucide-react";
import { t } from "../i18n";

export type ExportFormat = "png" | "pdf" | "csv" | "html" | "json" | "markdown" | "print";
export type ExportHandlers = Partial<Record<ExportFormat, () => void | Promise<void>>>;

const ICONS: Record<ExportFormat, React.ReactNode> = {
  png: <FileImage size={15} />,
  pdf: <FileText size={15} />,
  csv: <FileSpreadsheet size={15} />,
  html: <FileCode2 size={15} />,
  json: <Braces size={15} />,
  markdown: <FileText size={15} />,
  print: <Printer size={15} />,
};

function labelOf(format: ExportFormat) {
  switch (format) {
    case "png":
      return t("Imagem (PNG)");
    case "pdf":
      return t("Documento (PDF)");
    case "csv":
      return t("Dados (CSV)");
    case "html":
      return t("Página interativa (HTML)");
    case "json":
      return t("Arquivo do canvas (JSON)");
    case "markdown":
      return t("Texto (Markdown)");
    case "print":
      return t("Imprimir");
  }
}

export function ExportMenu({
  handlers,
  onError,
  compact = false,
}: {
  handlers: ExportHandlers;
  onError?: (message: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const formats = (Object.keys(ICONS) as ExportFormat[]).filter((format) => handlers[format]);
  if (!formats.length) return null;
  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(format);
    try {
      await handlers[format]?.();
    } catch (error) {
      onError?.(
        t("Não foi possível exportar: {detail}", { detail: error instanceof Error ? error.message : String(error) }),
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="export-wrap" ref={wrap} data-export-skip>
      <button
        className={compact ? "icon-button" : "btn small"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Exportar")}
        title={t("Exportar")}
        onClick={() => setOpen(!open)}
        disabled={!!busy}
      >
        {busy ? <LoaderCircle size={15} className="atlas-spin" /> : <Download size={15} />}
        {!compact && t("Exportar")}
      </button>
      {open && (
        <div className="atlas-menu" role="menu">
          {formats.map((format) => (
            <button key={format} role="menuitem" onClick={() => void run(format)}>
              {ICONS[format]} {labelOf(format)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
