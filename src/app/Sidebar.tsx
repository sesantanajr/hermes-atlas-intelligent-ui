import React from "react";
import {
  Activity,
  Compass,
  Layers,
  LayoutGrid,
  MessageSquare,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { t } from "../i18n";
import type { ChatSummary } from "../types";
import { VERSION } from "../version";
import type { useDirectory } from "./useDirectory";

export type View = "home" | "chat" | "library" | "catalog" | "settings";

export function AtlasMark({ size = 22 }: { size?: number }) {
  // A compass rose inside a globe outline: where the agent's answers get mapped.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2.75c-2.6 2.5-3.9 5.6-3.9 9.25s1.3 6.75 3.9 9.25c2.6-2.5 3.9-5.6 3.9-9.25S14.6 5.25 12 2.75Z" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
      <path d="M2.75 12h18.5" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
      <path d="m15.4 8.6-2 4.8-4.8 2 2-4.8 4.8-2Z" fill="currentColor" />
    </svg>
  );
}

export function Sidebar({
  view,
  go,
  newChat,
  ready,
  submitting,
  chats,
  currentChat,
  openChat,
}: {
  view: View;
  go: (view: View) => void;
  newChat: () => void;
  ready: boolean;
  submitting: boolean;
  chats: ReturnType<typeof useDirectory<ChatSummary>>;
  currentChat?: string;
  openChat: (id: string) => void;
}) {
  const item = (target: View, icon: React.ReactNode, label: string) => (
    <button
      className={view === target ? "active" : ""}
      aria-current={view === target ? "page" : undefined}
      onClick={() => go(target)}
    >
      {icon} {label}
    </button>
  );
  return (
    <aside className="atlas-sidebar">
      <div className="brand">
        <span className="brand-mark">
          <AtlasMark />
        </span>
        <div>
          hermes <b>atlas</b>
          <small>INTELLIGENT UI</small>
        </div>
      </div>
      <button className="new-chat" onClick={newChat} disabled={!ready || submitting}>
        <Plus size={17} /> {t("Nova conversa")}
      </button>
      <nav aria-label={t("Navegação principal")}>
        {item("home", <Compass size={17} />, t("Descobrir"))}
        {item("library", <LayoutGrid size={17} />, t("Minha biblioteca"))}
        {item("catalog", <Layers size={17} />, t("Catálogo de blocos"))}
      </nav>
      <div className="sidebar-label">{t("CONVERSAS")}</div>
      <label className="search-chats">
        <Search size={15} />
        <input
          aria-label={t("Buscar conversas")}
          placeholder={t("Buscar conversas")}
          value={chats.query}
          onChange={(e) => chats.setQuery(e.target.value)}
        />
      </label>
      <div className="recent-chats">
        {chats.rows.map((c) => (
          <button
            key={c.id}
            disabled={submitting}
            className={currentChat === c.id ? "active" : ""}
            onClick={() => openChat(c.id)}
          >
            <MessageSquare size={15} />
            <span>{c.title}</span>
            {c.active_run && <Activity size={13} />}
          </button>
        ))}
        {chats.error && <p role="alert">{chats.error}</p>}
        {!chats.busy && !chats.error && chats.rows.length === 0 && (
          <p>
            {chats.query
              ? t("Nenhuma conversa encontrada.")
              : t("Nenhuma conversa neste perfil.")}
          </p>
        )}
        {chats.more && (
          <button disabled={chats.busy} onClick={() => void chats.refresh(true)}>
            {t("Carregar mais")}
          </button>
        )}
      </div>
      <div className="sidebar-bottom">
        {item("settings", <Settings2 size={17} />, t("Configurações"))}
        <p className="sidebar-version">
          Hermes Atlas <span>{VERSION}</span>
        </p>
      </div>
    </aside>
  );
}
