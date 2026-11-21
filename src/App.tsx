import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Aperture,
  Plus,
  Search,
  LayoutGrid,
  MessageSquare,
  Settings2,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  ChevronRight,
  ArrowUp,
  X,
  Check,
  Layers,
  Compass,
  Activity,
  Copy,
  Square,
  Undo2,
  Redo2,
  Paperclip,
  Upload,
  Pencil,
  Trash2,
} from "lucide-react";
import { Canvas } from "./Canvas";
import { examples } from "./examples";
import { createClient, download } from "./client";
import {
  Canvas as CanvasData,
  Conversation,
  Record as CanvasRecord,
  Summary,
  Run,
  Status,
  Transport,
  Workspace,
  ChatSummary,
} from "./types";
import "./style.css";
import "./readability.css";
import "./experience.css";

const terminal = new Set(["completed", "failed", "cancelled", "interrupted"]);
const stateLabel: Record<string, string> = {
  submitting: "Enviando ao Hermes",
  queued: "Na fila do Hermes",
  started: "Hermes trabalhando",
  running: "Hermes trabalhando",
  stopping: "Interrompendo com segurança",
  waiting_for_approval: "Aguardando sua decisão",
  unknown: "Execução sem desfecho confirmado",
};
const initialWorkspace: Workspace = {
  chat_id: null,
  canvas: null,
  revision: 0,
  theme: "system",
};
function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>[Imagem: {alt || "anexo"}]</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Aperture size={27} />
      </span>
      <div>
        hermes <b>atlas</b>
        <small>INTELLIGENT UI</small>
      </div>
    </div>
  );
}

export function App({
  transport,
  nativeContext,
}: {
  transport?: Transport;
  nativeContext?: {
    sessionId: string | null;
    send: (text: string) => Promise<void>;
  };
} = {}) {
  const client = useMemo(() => createClient(transport), [transport]);
  const api = client.request;
  const [view, setView] = useState<"home" | "chat" | "library" | "settings">(
    "home",
  );
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 800);
  const [status, setStatus] = useState<Status | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [draft, setDraft] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<Summary[]>([]);
  const [versions, setVersions] = useState<Summary[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"preview" | "json">("preview");
  const [past, setPast] = useState<CanvasData[]>([]);
  const [future, setFuture] = useState<CanvasData[]>([]);
  const [attachments, setAttachments] = useState<
    { name: string; text: string }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<{
    request_id: string;
    conversation_id: string;
    input: string;
    context: unknown;
    attachments: unknown;
  } | null>(null);
  const inFlight = useRef(false);
  const navigation = useRef(0);
  const mounted = useRef(true);
  const ready = useRef(false);
  const scope = useRef("");
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const newestWorkspace = useRef<Workspace | null>(null);
  const savingWorkspace = useRef(false);
  const canvas = workspace.canvas;
  const busy = submitting || !!(run && !terminal.has(run.status));
  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  const refreshLists = async () => {
    const [c, r] = await Promise.all([
      api<ChatSummary[]>("/conversations"),
      api<Summary[]>("/canvases"),
    ]);
    if (mounted.current) {
      setChats(c);
      setRecords(r);
    }
  };
  const loadChat = async (id: string) => {
    const ticket = ++navigation.current;
    const c = await api<Conversation>(`/conversations/${id}`);
    const active = c.active_run
      ? await api<Run>(`/runs/${c.active_run}`)
      : null;
    if (!mounted.current || ticket !== navigation.current) return;
    setCurrent(c);
    setRun(active);
    setWorkspace((w) => ({ ...w, chat_id: id }));
    setView("chat");
  };

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    async function boot() {
      try {
        const s = await api<Status>("/status");
        if (!alive) return;
        scope.current = s.scope;
        client.scope(s.scope);
        setStatus(s);
        const [w, c, r] = await Promise.all([
          api<Workspace>("/workspace"),
          api<ChatSummary[]>("/conversations"),
          api<Summary[]>("/canvases"),
        ]);
        if (!alive) return;
        setWorkspace(w);
        setChats(c);
        setRecords(r);
        if (w.chat_id) {
          try {
            await loadChat(w.chat_id);
          } catch {
            setWorkspace((x) => ({ ...x, chat_id: null }));
          }
        }
        setLoaded(true);
        ready.current = true;
      } catch (e) {
        if (alive) fail(e);
      }
    }
    void boot();
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const s = await api<Status>("/status");
        if (!alive) return;
        if (!ready.current || (scope.current && s.scope !== scope.current)) {
          const changedProfile = scope.current && s.scope !== scope.current;
          ready.current = false;
          setLoaded(false);
          setCurrent(null);
          setRun(null);
          setChats([]);
          setRecords([]);
          setWorkspace(initialWorkspace);
          if (changedProfile) {
            pending.current = null;
            setDraft("");
            setAttachments([]);
          }
          setPast([]);
          setFuture([]);
          newestWorkspace.current = null;
          await boot();
        } else setStatus(s);
      } catch (e) {
        if (alive) {
          setStatus(null);
          ready.current = false;
          setLoaded(false);
          setCurrent(null);
          setChats([]);
          setRun(null);
          setRecords([]);
          newestWorkspace.current = null;
          setWorkspace(initialWorkspace);
          fail(e);
        }
      }
    }, 5000);
    return () => {
      alive = false;
      mounted.current = false;
      clearInterval(timer);
    };
  }, [client]);

  useEffect(() => {
    if (!loaded) return;
    newestWorkspace.current = workspace;
    const timer = setTimeout(async () => {
      if (savingWorkspace.current) return;
      savingWorkspace.current = true;
      setSaving(true);
      try {
        while (newestWorkspace.current) {
          const snapshot = newestWorkspace.current;
          newestWorkspace.current = null;
          await api("/workspace", snapshot, "PUT");
        }
      } catch (e) {
        fail(e);
        setNotice(
          "Não foi possível salvar o rascunho. Exporte o canvas antes de sair.",
        );
      } finally {
        savingWorkspace.current = false;
        if (mounted.current) setSaving(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [workspace, loaded, client]);

  useEffect(() => {
    if (!run || terminal.has(run.status)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await api<Run>(`/runs/${run.id}`);
        if (!alive) return;
        setRun(r);
        if (terminal.has(r.status)) {
          const conversation = await api<Conversation>(
            `/conversations/${r.conversation_id}`,
          );
          if (!alive) return;
          setCurrent(conversation);
          if (r.artifact) {
            setWorkspace((w) => ({
              ...w,
              canvas: r.artifact!.canvas,
              revision: r.artifact!.revision,
            }));
            setPast([]);
            setFuture([]);
            setTab("preview");
          }
          if (r.warning) setNotice(r.warning);
          pending.current = null;
          await refreshLists();
          return;
        }
      } catch (e) {
        if (alive) fail(e);
      }
      if (alive) timer = setTimeout(poll, document.hidden ? 3000 : 450);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [run?.id, client]);

  useEffect(() => {
    if (followBottom.current) end.current?.scrollIntoView({ block: "end" });
  }, [current?.messages.length, run?.text]);
  useEffect(() => {
    if (window.innerWidth <= 800) setSidebar(false);
  }, [view]);
  const openSaved = async (id: string, revision?: number) => {
    try {
      const r = await api<CanvasRecord>(
        `/canvases/${encodeURIComponent(id)}${revision ? `?revision=${revision}` : ""}`,
      );
      setWorkspace((w) => ({ ...w, canvas: r.canvas, revision: r.revision }));
      setPast([]);
      setFuture([]);
      setTab("preview");
      setVersions(await api<Summary[]>(`/canvases/${id}/versions`));
    } catch (e) {
      fail(e);
    }
  };
  const setCanvas = (next: CanvasData) => {
    if (canvas) setPast((p) => [...p.slice(-19), canvas]);
    setFuture([]);
    setWorkspace((w) => ({ ...w, canvas: next }));
  };
  const openExample = (i: number) => {
    setWorkspace((w) => ({
      ...w,
      canvas: {
        ...structuredClone(examples[i]),
        id: "canvas-" + crypto.randomUUID().replaceAll("-", ""),
      },
      revision: 0,
    }));
    setPast([]);
    setFuture([]);
    setVersions([]);
    setTab("preview");
  };
  const newChat = () => {
    navigation.current++;
    setCurrent(null);
    setRun(null);
    pending.current = null;
    setWorkspace((w) => ({ ...w, chat_id: null, canvas: null, revision: 0 }));
    setView("home");
    setError("");
    setDraft("");
    setAttachments([]);
  };
  const send = async () => {
    if (!draft.trim() || inFlight.current || busy) return;
    if (!status?.connected) {
      setView("settings");
      setError(status?.detail || "Conecte o Hermes antes de enviar.");
      return;
    }
    const text = draft.trim();
    const payload =
      pending.current && pending.current.input === text
        ? pending.current
        : {
            request_id: crypto.randomUUID(),
            conversation_id: current?.id || crypto.randomUUID(),
            input: text,
            context: canvas ? { canvas, revision: workspace.revision } : null,
            attachments,
          };
    pending.current = payload;
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      const r = await api<Run>("/runs", payload);
      if (!mounted.current) return;
      setRun(r);
      setCurrent(
        await api<Conversation>(`/conversations/${r.conversation_id}`),
      );
      setWorkspace((w) => ({ ...w, chat_id: r.conversation_id }));
      setDraft("");
      setAttachments([]);
      setView("chat");
      followBottom.current = true;
      await refreshLists();
    } catch (e) {
      fail(e);
      setNotice(
        "A mensagem foi preservada. Enviar novamente repete a mesma identidade, sem iniciar uma cópia da execução.",
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };
  const control = async (action: string, body: unknown = {}) => {
    if (!run) return;
    try {
      await api(`/runs/${run.id}/${action}`, body);
      setNotice(
        action === "stop"
          ? "Interrupção solicitada; aguardando o Hermes confirmar."
          : "Decisão enviada ao Hermes.",
      );
    } catch (e) {
      fail(e);
    }
  };
  const save = async () => {
    if (!canvas) return;
    try {
      const r = await api<CanvasRecord>(
        `/canvases?expected_revision=${workspace.revision}`,
        canvas,
      );
      setWorkspace((w) => ({ ...w, canvas: r.canvas, revision: r.revision }));
      setNotice("Versão salva com suas interações.");
      setVersions(await api<Summary[]>(`/canvases/${r.id}/versions`));
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copiado.");
    } catch {
      setError("Não foi possível copiar. Use a opção de exportação.");
    }
  };
  const rename = async () => {
    if (!current) return;
    const title = window.prompt("Nome da conversa", current.title);
    if (!title?.trim()) return;
    try {
      setCurrent(
        await api<Conversation>(
          `/conversations/${current.id}`,
          { title: title.trim() },
          "PATCH",
        ),
      );
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };
  const remove = async () => {
    if (
      !current ||
      !window.confirm(
        "Excluir esta conversa do Atlas? A sessão original permanece no Hermes.",
      )
    )
      return;
    try {
      await api(`/conversations/${current.id}`, {}, "DELETE");
      newChat();
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };
  const files = async (list: FileList | null) => {
    if (!list) return;
    try {
      const next: { name: string; text: string }[] = [];
      for (const file of Array.from(list)) {
        if (file.size > 200000 || !/\.(txt|md|csv|json|log)$/i.test(file.name))
          throw new Error(
            "Use arquivos TXT, Markdown, CSV, JSON ou LOG de até 200 KB.",
          );
        next.push({ name: file.name, text: await file.text() });
      }
      if (next.length + attachments.length > 4)
        throw new Error("O limite é de quatro arquivos por mensagem.");
      setAttachments((a) => [...a, ...next]);
    } catch (e) {
      fail(e);
    }
  };
  const importCanvas = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 256000) throw new Error("O canvas deve ter até 256 KB.");
      const data = JSON.parse(await file.text());
      const raw = data.canvas || data;
      raw.id = "canvas-" + crypto.randomUUID().replaceAll("-", "");
      const r = await api<CanvasRecord>("/canvases", raw);
      setWorkspace((w) => ({ ...w, canvas: r.canvas, revision: r.revision }));
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div
      className={`atlas-app ${sidebar ? "" : "sidebar-hidden"}`}
      data-theme={
        workspace.theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : workspace.theme
      }
    >
      <aside className="atlas-sidebar">
        <Logo />
        <button className="new-chat" onClick={newChat} disabled={submitting}>
          <Plus size={18} /> Nova conversa
        </button>
        <nav aria-label="Navegação principal">
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => setView("home")}
          >
            <Compass size={18} /> Descobrir
          </button>
          <button
            className={view === "library" ? "active" : ""}
            onClick={() => {
              setView("library");
              void refreshLists().catch(fail);
            }}
          >
            <LayoutGrid size={18} /> Minha biblioteca{" "}
            <span>{records.length}</span>
          </button>
        </nav>
        <div className="sidebar-label">CONVERSAS</div>
        <label className="search-chats">
          <Search size={15} />
          <input
            aria-label="Buscar conversas"
            placeholder="Buscar conversas"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="recent-chats">
          {chats
            .filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
            .map((c) => (
              <button
                key={c.id}
                className={current?.id === c.id ? "active" : ""}
                onClick={() => void loadChat(c.id).catch(fail)}
              >
                <MessageSquare size={16} />
                <span>{c.title}</span>
                {c.active_run && <Activity size={13} />}
              </button>
            ))}
          {chats.length === 0 && (
            <p>
              Seu histórico fica no perfil Hermes.
              <br />
              Comece uma conversa.
            </p>
          )}
          {chats.length >= 50 && (
            <button
              onClick={() =>
                void api<ChatSummary[]>(`/conversations?offset=${chats.length}`)
                  .then((c) => setChats((old) => [...old, ...c]))
                  .catch(fail)
              }
            >
              Carregar mais
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-card">
            <Layers size={19} />
            <div>
              Seu espaço, seu Hermes<small>Estado e versões preservados</small>
            </div>
          </div>
          <button onClick={() => setView("settings")}>
            <Settings2 size={18} /> Configurações
          </button>
          <div className="profile">
            <span>HA</span>
            <div>
              Atlas Intelligent UI<small>Versão 0.2.0</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="atlas-main">
        <header className="topbar">
          <div>
            <button
              className="icon-button"
              aria-label="Alternar menu"
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? (
                <PanelLeftClose size={19} />
              ) : (
                <PanelLeftOpen size={19} />
              )}
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>
              {view === "library"
                ? "Biblioteca"
                : view === "settings"
                  ? "Configurações"
                  : view === "chat"
                    ? "Conversa"
                    : "Descobrir"}
            </b>
          </div>
          <button className="connection" onClick={() => setView("settings")}>
            <i className={status?.connected ? "online" : ""} />
            {status?.connected ? "Hermes conectado" : "Hermes desconectado"}
          </button>
        </header>
        {error && (
          <div className="alert error" role="alert">
            {error}
            <button aria-label="Fechar erro" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert" role="status">
            {notice}
            <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className={`workspace ${canvas ? "with-canvas" : ""}`}>
          <div className="conversation-pane">
            {view === "home" && (
              <div className="welcome">
                <div className="eyebrow">
                  <Sparkles size={14} /> PENSE. EXPLORE. CONSTRUA.
                </div>
                <h1>
                  Mais que respostas.
                  <br />
                  <span>Ideias com as quais interagir.</span>
                </h1>
                <p>
                  Seu Hermes, em um espaço para conversar,
                  <br className="desktop-break" /> comparar caminhos e
                  transformar ideias.
                </p>
                <div className="suggestions">
                  {[
                    "Crie uma calculadora para dividir uma conta.",
                    "Compare duas opções de projeto em um canvas.",
                    "Crie um formulário para planejar minha semana.",
                  ].map((s, i) => (
                    <button
                      key={s}
                      onClick={() => {
                        setDraft(s);
                        document.getElementById("atlas-prompt")?.focus();
                      }}
                    >
                      <span>{["◷", "◈", "▤"][i]}</span>
                      <b>
                        {
                          [
                            "Explorar possibilidades",
                            "Decidir com clareza",
                            "Do plano à ação",
                          ][i]
                        }
                      </b>
                      <small>{s}</small>
                    </button>
                  ))}
                </div>
                <div className="section-heading">
                  <div>
                    <h2>Um pouco do que é possível</h2>
                    <p>Exemplos ilustrativos para experimentar.</p>
                  </div>
                  <span>GALERIA INTERATIVA</span>
                </div>
                <div className="example-grid">
                  {examples.map((e, i) => (
                    <button
                      className={`example example-${i}`}
                      key={e.id}
                      onClick={() => openExample(i)}
                    >
                      <div className="example-art" aria-hidden="true">
                        {i === 0 ? (
                          <div className="mini-bars">
                            {[40, 64, 90, 56, 76, 44, 68].map((h, j) => (
                              <i style={{ height: h }} key={j} />
                            ))}
                          </div>
                        ) : i === 1 ? (
                          <svg viewBox="0 0 260 110">
                            <path
                              d="M0 100 Q70 100 110 65 T260 0"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            />
                          </svg>
                        ) : (
                          <div className="mini-compare">
                            <div>
                              <i />
                              <i />
                              <i />
                            </div>
                            <div>
                              <i />
                              <i />
                              <i />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="example-caption">
                        <span>
                          {
                            [
                              "Planejamento visual",
                              "Simulação ao vivo",
                              "Comparação interativa",
                            ][i]
                          }
                        </span>
                        <ChevronRight size={17} />
                      </div>
                      <small>Abrir e interagir</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {view === "chat" && (
              <div
                className="messages"
                ref={scroller}
                onScroll={() => {
                  const el = scroller.current;
                  if (el)
                    followBottom.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                }}
              >
                <div className="chat-heading">
                  <span>{current?.title || "Conversa"}</span>
                  <div>
                    {current && (
                      <>
                        <button
                          className="icon-button"
                          aria-label="Renomear conversa"
                          onClick={() => void rename()}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Exportar conversa"
                          onClick={() =>
                            download("atlas-conversa.json", current)
                          }
                        >
                          <Download size={17} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Excluir conversa"
                          disabled={busy}
                          onClick={() => void remove()}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {current?.messages.map((m) => (
                  <article key={m.id} className={`message ${m.role}`}>
                    <span className="avatar">
                      {m.role === "user" ? "Você" : <Aperture size={18} />}
                    </span>
                    <div>
                      <div className="message-meta">
                        <strong>
                          {m.role === "user" ? "Você" : "Hermes Atlas"}
                        </strong>
                        <time dateTime={m.created}>
                          {new Date(m.created).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                        <button
                          className="icon-button"
                          aria-label="Copiar mensagem"
                          onClick={() => void copy(m.content)}
                        >
                          <Copy size={14} />
                        </button>
                        {m.role === "user" && (
                          <button
                            className="icon-button"
                            aria-label="Usar mensagem novamente"
                            onClick={() => setDraft(m.content)}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                      </div>
                      <Markdown text={m.content} />
                      {m.warning && (
                        <p className="message-warning">{m.warning}</p>
                      )}
                      {m.artifact && (
                        <button
                          className="inline-action"
                          onClick={() =>
                            void openSaved(m.artifact!.id, m.artifact!.revision)
                          }
                        >
                          <LayoutGrid size={16} /> Abrir canvas · v
                          {m.artifact.revision}
                        </button>
                      )}
                      {m.usage?.total_tokens != null && (
                        <small>
                          {m.usage.total_tokens.toLocaleString("pt-BR")} tokens
                        </small>
                      )}
                    </div>
                  </article>
                ))}
                {run && !terminal.has(run.status) && (
                  <article className="message assistant live">
                    <span className="avatar">
                      <Aperture size={18} />
                    </span>
                    <div>
                      <div className="thinking" role="status">
                        {stateLabel[run.status] || run.status}
                        <i />
                      </div>
                      {run.text && (
                        <Markdown
                          text={run.text.replace(
                            /\n```atlas[\s\S]*$/,
                            "\n\n*Construindo o canvas…*",
                          )}
                        />
                      )}
                      <details open={!!run.events.length}>
                        <summary>
                          Atividade do agente ({run.events.length})
                        </summary>
                        {run.events.slice(-12).map((e, i) => (
                          <div className="tool-event" key={e.seq ?? i}>
                            <Activity size={13} />
                            <span>
                              {e.tool || e.text || e.event || e.type}
                              {e.preview && <small>{e.preview}</small>}
                            </span>
                          </div>
                        ))}
                      </details>
                      {run.connection_error && (
                        <p role="status">
                          {run.connection_error} Reconectando à mesma execução…
                        </p>
                      )}
                      {run.pending_controls?.map((p) => (
                        <form
                          className="approval-card"
                          key={p.prompt_id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const answer = new FormData(e.currentTarget).get(
                              "answer",
                            );
                            void control("clarify", {
                              request_id: p.prompt_id,
                              execution_generation: p.execution_generation,
                              answer,
                            });
                          }}
                        >
                          <strong>
                            {p.kind === "approval"
                              ? "O Hermes solicita aprovação"
                              : "O Hermes precisa de uma resposta"}
                          </strong>
                          <p>
                            {p.description ||
                              p.question ||
                              p.prompt ||
                              p.command ||
                              p.prompt_id}
                          </p>
                          {p.kind === "approval" ? (
                            <div>
                              <button
                                type="button"
                                onClick={() =>
                                  void control("approval", {
                                    request_id: p.prompt_id,
                                    execution_generation:
                                      p.execution_generation,
                                    choice: "once",
                                  })
                                }
                              >
                                Permitir uma vez
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void control("approval", {
                                    request_id: p.prompt_id,
                                    execution_generation:
                                      p.execution_generation,
                                    choice: "deny",
                                  })
                                }
                              >
                                Recusar
                              </button>
                            </div>
                          ) : (
                            <>
                              <input
                                name="answer"
                                aria-label="Resposta ao Hermes"
                                required
                                maxLength={12000}
                              />
                              <button type="submit">Responder</button>
                            </>
                          )}
                        </form>
                      ))}
                      {run.status === "unknown" && (
                        <button
                          className="inline-action"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Reconhecer que esta execução foi interrompida? Verifique seus efeitos no Hermes antes de continuar.",
                              )
                            )
                              void control("resolve-unknown", {
                                admission_id: run.admission_id,
                                execution_generation: run.execution_generation,
                              });
                          }}
                        >
                          Reconhecer interrupção
                        </button>
                      )}
                    </div>
                  </article>
                )}
                <div ref={end} />
              </div>
            )}
            {view === "library" && (
              <div className="library">
                <div className="eyebrow">
                  <Layers size={14} /> SEU REPERTÓRIO VISUAL
                </div>
                <h1>Minha biblioteca</h1>
                <p>
                  As respostas mantêm a versão original. Salve suas mudanças
                  como uma nova versão.
                </p>
                <label className="file-button">
                  <Upload size={16} /> Importar canvas JSON
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      void importCanvas(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="saved-grid">
                  {records.map((r) => (
                    <button key={r.id} onClick={() => void openSaved(r.id)}>
                      <LayoutGrid size={24} />
                      <h3>{r.title}</h3>
                      <p>
                        Versão {r.revision} ·{" "}
                        {new Date(r.updated).toLocaleDateString("pt-BR")}
                      </p>
                      <span>
                        Abrir canvas <ChevronRight size={16} />
                      </span>
                    </button>
                  ))}
                </div>
                {!records.length && (
                  <div className="empty">
                    <LayoutGrid size={38} />
                    <h2>Espaço para suas próximas ideias.</h2>
                    <button className="primary" onClick={() => setView("home")}>
                      Explorar exemplos
                    </button>
                  </div>
                )}
                {records.length >= 50 && (
                  <button
                    onClick={() =>
                      void api<Summary[]>(`/canvases?offset=${records.length}`)
                        .then((r) => setRecords((old) => [...old, ...r]))
                        .catch(fail)
                    }
                  >
                    Carregar mais
                  </button>
                )}
              </div>
            )}
            {view === "settings" && (
              <div className="settings">
                <div className="eyebrow">
                  <Settings2 size={14} /> SEU AMBIENTE
                </div>
                <h1>Conectado ao seu Hermes.</h1>
                <p>
                  Execuções, ferramentas e decisões continuam sob controle do
                  seu agente.
                </p>
                <section className="setting-card">
                  <h2>
                    <Activity size={19} /> Gateway
                  </h2>
                  <p>
                    {status?.connected
                      ? `Conexão validada · modelo ${status.model}`
                      : status?.detail || "Verificando conexão…"}
                  </p>
                  <p>
                    Streaming, continuidade de sessão, cancelamento e repetição
                    segura são verificados pelas capacidades anunciadas pelo
                    Hermes.
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      void api<Status>("/status").then(setStatus).catch(fail)
                    }
                  >
                    Verificar conexão
                  </button>
                </section>
                <section className="setting-card">
                  <h2>Aparência</h2>
                  <label>
                    Tema{" "}
                    <select
                      aria-label="Tema"
                      value={workspace.theme}
                      onChange={(e) =>
                        setWorkspace((w) => ({
                          ...w,
                          theme: e.target.value as Workspace["theme"],
                        }))
                      }
                    >
                      <option value="system">Sistema</option>
                      <option value="light">Claro</option>
                      <option value="dark">Escuro</option>
                    </select>
                  </label>
                </section>
                <section className="setting-card">
                  <h2>
                    <Layers size={19} /> Seus dados
                  </h2>
                  <p>
                    Conversas, rascunhos e versões ficam no servidor, separados
                    pelo perfil e pela conexão Hermes. Credenciais permanecem no
                    servidor. O Atlas não carrega o histórico antigo de outros
                    perfis do navegador.
                  </p>
                  <p>
                    Arquivos de texto, Markdown, CSV e JSON podem ser anexados à
                    conversa. Formulários preparam uma mensagem para sua
                    revisão.
                  </p>
                  <a
                    href="https://github.com/sesantanajr/hermes-atlas-intelligent-ui"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Instalação e documentação
                  </a>
                </section>
              </div>
            )}
            {(view === "home" || view === "chat") && (
              <div className="composer-wrap">
                {canvas && (
                  <div className="context-chip">
                    <LayoutGrid size={14} /> Canvas em contexto: {canvas.title}{" "}
                    · {saving ? "salvando rascunho…" : "rascunho atualizado"}
                  </div>
                )}
                {attachments.map((a, i) => (
                  <button
                    className="attachment"
                    key={i}
                    onClick={() =>
                      setAttachments((v) => v.filter((_, j) => i !== j))
                    }
                  >
                    {a.name} <X size={12} />
                  </button>
                ))}
                <form
                  className="composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    id="atlas-prompt"
                    aria-label="Mensagem para o Hermes"
                    placeholder="O que vamos explorar hoje?"
                    maxLength={12000}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      if (pending.current?.input !== e.target.value.trim())
                        pending.current = null;
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div>
                    <span>
                      <label
                        className="icon-button"
                        title="Anexar texto, Markdown, CSV ou JSON"
                      >
                        <Paperclip size={18} />
                        <input
                          aria-label="Anexar arquivos"
                          className="hidden-file"
                          type="file"
                          multiple
                          accept=".txt,.md,.csv,.json,.log"
                          onChange={(e) => {
                            void files(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <Sparkles size={15} /> Interface inteligente
                    </span>
                    {busy ? (
                      <button
                        type="button"
                        aria-label="Interromper resposta"
                        disabled={!run?.remote_id || run.status === "unknown"}
                        onClick={() => void control("stop")}
                      >
                        <Square size={17} />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        aria-label="Enviar mensagem"
                        disabled={!draft.trim() || !loaded}
                      >
                        <ArrowUp size={20} />
                      </button>
                    )}
                  </div>
                </form>
                {nativeContext?.sessionId && (
                  <button
                    className="native-send"
                    disabled={!draft.trim()}
                    onClick={() =>
                      void nativeContext
                        .send(
                          draft +
                            (canvas
                              ? "\n\nCanvas ativo:\n" + JSON.stringify(canvas)
                              : ""),
                        )
                        .then(() => {
                          setDraft("");
                          setNotice(
                            "Mensagem enviada à sessão ativa do Desktop. Acompanhe a resposta no chat nativo.",
                          );
                        })
                        .catch(fail)
                    }
                  >
                    Enviar à sessão ativa do Desktop
                  </button>
                )}
                <p>
                  Enter para enviar · Shift + Enter para nova linha{" "}
                  <span>
                    {busy
                      ? "A execução continua no Hermes"
                      : "Seu agente. Seu espaço."}
                  </span>
                </p>
              </div>
            )}
          </div>
          {canvas && (
            <aside className="canvas-pane">
              <div className="canvas-toolbar">
                <span>
                  <LayoutGrid size={16} /> Canvas{" "}
                  <small>
                    {workspace.revision ? `v${workspace.revision}` : "Rascunho"}
                  </small>
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Desfazer interação"
                    disabled={!past.length}
                    onClick={() => {
                      const c = past[past.length - 1];
                      setPast((p) => p.slice(0, -1));
                      setFuture((f) => [canvas, ...f]);
                      setWorkspace((w) => ({ ...w, canvas: c }));
                    }}
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Refazer interação"
                    disabled={!future.length}
                    onClick={() => {
                      const c = future[0];
                      setPast((p) => [...p, canvas]);
                      setFuture((f) => f.slice(1));
                      setWorkspace((w) => ({ ...w, canvas: c }));
                    }}
                  >
                    <Redo2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Exportar JSON"
                    onClick={() => download(`${canvas.id}.json`, canvas)}
                  >
                    <Download size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Fechar canvas"
                    onClick={() =>
                      setWorkspace((w) => ({ ...w, canvas: null, revision: 0 }))
                    }
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="canvas-content">
                <div className="canvas-eyebrow">
                  {saving ? "SALVANDO INTERAÇÕES" : "SEU CANVAS INTERATIVO"}
                </div>
                <h2>{canvas.title}</h2>
                <p>{canvas.description}</p>
                <div className="canvas-tabs">
                  <div role="tablist" aria-label="Visualização do canvas">
                    <button
                      role="tab"
                      aria-selected={tab === "preview"}
                      onClick={() => setTab("preview")}
                    >
                      Interagir
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "json"}
                      onClick={() => setTab("json")}
                    >
                      JSON
                    </button>
                  </div>
                  <button onClick={() => void save()}>
                    <Check size={14} /> Salvar versão
                  </button>
                </div>
                {versions.length > 1 && (
                  <label className="version-picker">
                    Histórico{" "}
                    <select
                      aria-label="Versão do canvas"
                      value={workspace.revision}
                      onChange={(e) =>
                        void openSaved(canvas.id, Number(e.target.value))
                      }
                    >
                      {versions.map((v) => (
                        <option value={v.revision} key={v.revision}>
                          v{v.revision} ·{" "}
                          {new Date(v.updated).toLocaleString("pt-BR")}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {tab === "preview" ? (
                  <Canvas
                    canvas={canvas}
                    onChange={setCanvas}
                    onAction={(text) => {
                      setDraft(text);
                      setView(current ? "chat" : "home");
                      setNotice(
                        "Revise os valores na mensagem e envie quando estiver pronto.",
                      );
                    }}
                  />
                ) : (
                  <div className="json-view">
                    <button
                      onClick={() => void copy(JSON.stringify(canvas, null, 2))}
                    >
                      <Copy size={15} /> Copiar
                    </button>
                    <pre>{JSON.stringify(canvas, null, 2)}</pre>
                  </div>
                )}
                <div className="canvas-footer">
                  <Layers size={13} /> Interações preservadas · Componentes
                  validados
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
