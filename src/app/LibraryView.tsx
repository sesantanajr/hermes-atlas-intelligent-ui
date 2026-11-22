import React from "react";
import { ChevronRight, LayoutGrid, Search, Trash2, Upload } from "lucide-react";
import { intlLocale, t } from "../i18n";
import type { Summary } from "../types";
import type { useDirectory } from "./useDirectory";

export function LibraryView({
  ready,
  records,
  open,
  remove,
  importCanvas,
  explore,
}: {
  ready: boolean;
  records: ReturnType<typeof useDirectory<Summary>>;
  open: (id: string) => void;
  remove: (record: Summary) => void;
  importCanvas: (file?: File) => void;
  explore: () => void;
}) {
  return (
    <div className="library">
      <div className="view-heading">
        <div>
          <h1>{t("Minha biblioteca")}</h1>
          <p>
            {t("As respostas mantêm a versão original. Salve suas mudanças como uma nova versão.")}
          </p>
        </div>
        <label className="btn file-button">
          <Upload size={16} /> {t("Importar canvas JSON")}
          <input
            type="file"
            accept=".json"
            className="hidden-file"
            disabled={!ready}
            onChange={(e) => {
              importCanvas(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <label className="library-search">
        <Search size={17} />
        <input
          aria-label={t("Buscar canvas")}
          placeholder={t("Buscar por título")}
          value={records.query}
          onChange={(e) => records.setQuery(e.target.value)}
        />
      </label>
      {records.error && <p role="alert">{records.error}</p>}
      <div className="saved-grid">
        {records.rows.map((record) => (
          <article key={record.id} className="saved-card">
            <button className="saved-open" onClick={() => open(record.id)}>
              <LayoutGrid size={20} />
              <h3>{record.title}</h3>
              <p>
                {t("Versão {n}", { n: record.revision })} ·{" "}
                {new Date(record.updated).toLocaleDateString(intlLocale())}
              </p>
              <span>
                {t("Abrir canvas")} <ChevronRight size={16} />
              </span>
            </button>
            <button
              className="icon-button saved-delete"
              aria-label={t("Excluir canvas {title}", { title: record.title })}
              title={t("Excluir canvas")}
              onClick={() => remove(record)}
            >
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>
      {!records.busy && !records.error && !records.rows.length && (
        <div className="empty">
          <LayoutGrid size={34} />
          <h2>
            {records.query ? t("Nenhum canvas encontrado") : t("Sua biblioteca está vazia")}
          </h2>
          <button className="primary" onClick={explore}>
            {t("Explorar exemplos")}
          </button>
        </div>
      )}
      {records.more && (
        <button
          className="btn"
          disabled={records.busy}
          onClick={() => void records.refresh(true)}
        >
          {t("Carregar mais")}
        </button>
      )}
    </div>
  );
}
