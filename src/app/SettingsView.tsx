import React from "react";
import { Activity, Globe, Layers, Palette, Settings2, Wrench } from "lucide-react";
import { locales, t } from "../i18n";
import type { HostKind } from "../host/context";
import type { Status, Workspace } from "../types";
import { VERSION } from "../version";

const REPOSITORY = "https://github.com/sesantanajr/hermes-atlas-intelligent-ui";

export function SettingsView({
  status,
  workspace,
  ready,
  host,
  setTheme,
  setLanguage,
  recheck,
}: {
  status: Status | null;
  workspace: Workspace;
  ready: boolean;
  host: HostKind;
  setTheme: (theme: Workspace["theme"]) => void;
  setLanguage: (locale: NonNullable<Workspace["locale"]>) => void;
  recheck: () => void;
}) {
  const yes = t("sim"),
    no = t("não");
  return (
    <div className="settings">
      <div className="eyebrow">
        <Settings2 size={14} /> {t("SEU AMBIENTE")}
      </div>
      <h1>{t("Configurações")}</h1>
      <p>{t("Execuções, ferramentas e decisões continuam sob controle do seu agente.")}</p>

      <section className="setting-card">
        <h2>
          <Activity size={18} /> {t("Conversa do Atlas")}
        </h2>
        <p>
          {status?.connected
            ? t("Conexão validada · modelo {model}", { model: status.model ?? "hermes-agent" })
            : status?.detail || t("Verificando conexão…")}
        </p>
        <p className="muted">
          {t("A conversa desta página usa o servidor de API do Hermes. Canvases, biblioteca e ferramentas do agente funcionam sem ele.")}
        </p>
        <button className="primary" onClick={recheck}>
          {t("Verificar conexão")}
        </button>
      </section>

      <section className="setting-card">
        <h2>
          <Globe size={18} /> {t("Idioma")}
        </h2>
        <label className="setting-row">
          {t("Idioma da interface")}
          <select
            aria-label={t("Idioma da interface")}
            value={workspace.locale ?? "auto"}
            disabled={!ready}
            onChange={(e) => setLanguage(e.target.value as NonNullable<Workspace["locale"]>)}
          >
            <option value="auto">{t("Automático")}</option>
            {locales.map((locale) => (
              <option value={locale.id} key={locale.id}>
                {locale.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {host === "standalone" ? (
        <section className="setting-card">
          <h2>
            <Palette size={18} /> {t("Aparência")}
          </h2>
          <label className="setting-row">
            {t("Tema")}
            <select
              aria-label={t("Tema")}
              value={workspace.theme}
              disabled={!ready}
              onChange={(e) => setTheme(e.target.value as Workspace["theme"])}
            >
              <option value="system">{t("Sistema")}</option>
              <option value="light">{t("Claro")}</option>
              <option value="dark">{t("Escuro")}</option>
            </select>
          </label>
        </section>
      ) : (
        <section className="setting-card">
          <h2>
            <Palette size={18} /> {t("Aparência")}
          </h2>
          <p>{t("O Atlas acompanha o tema do Hermes. Troque o tema no próprio Hermes.")}</p>
        </section>
      )}

      <section className="setting-card">
        <h2>
          <Layers size={18} /> {t("Seus dados")}
        </h2>
        <p>
          {t("Conversas, rascunhos e versões ficam no servidor, separados pelo perfil e pela conexão Hermes. Credenciais permanecem no servidor.")}
        </p>
        <p className="muted">
          {t("O texto e os anexos ainda não enviados ficam nesta aba por conversa e perfil.")}
        </p>
      </section>

      <section className="setting-card">
        <h2>
          <Wrench size={18} /> {t("Diagnóstico")}
        </h2>
        <dl className="diagnostics">
          <dt>{t("Interface")}</dt>
          <dd>{VERSION}</dd>
          <dt>{t("Servidor")}</dt>
          <dd>{status?.version ?? "—"}</dd>
          <dt>{t("Exportação em HTML")}</dt>
          <dd>{status?.exports ? (status.exports.html ? yes : no) : "—"}</dd>
          <dt>{t("Extensão do Desktop vista")}</dt>
          <dd>{status?.clients ? (status.clients.desktop ? yes : no) : "—"}</dd>
        </dl>
        {status?.version && status.version !== VERSION && VERSION !== "dev" && (
          <p className="muted" role="status">
            {t("A interface e o servidor são de versões diferentes. Atualize o plugin e recarregue.")}
          </p>
        )}
        <a href={REPOSITORY} target="_blank" rel="noreferrer">
          {t("Instalação e documentação")}
        </a>
      </section>
    </div>
  );
}
