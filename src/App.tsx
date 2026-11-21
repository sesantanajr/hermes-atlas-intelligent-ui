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
  Maximize2,
  Minimize2,
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
import { LiveCanvasPreview } from "./LiveCanvasPreview";
import { RunControl } from "./RunControl";
import { useComposer } from "./useComposer";
import { useDirectory } from "./useDirectory";
import { useWorkspace, type WorkspaceSnapshot } from "./useWorkspace";
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
const messageLimit = 12_000;
const Markdown = React.memo(function Markdown({ text }: { text: string }) {
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
});
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
  const [current, setCurrent] = useState<Conversation | null>(null);
  const sync = useWorkspace(api);
  const { workspace, setWorkspace, saving } = sync;
  const composer = useComposer();
  const {
    text: draft,
    setText: setDraft,
    attachments,
    setFiles: setAttachments,
  } = composer;
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const chats = useDirectory<ChatSummary>(
    api,
    "/conversations",
    loaded ? status?.scope || "" : "",
  );
  const records = useDirectory<Summary>(
    api,
    "/canvases",
    loaded ? status?.scope || "" : "",
  );
  const [versions, setVersions] = useState<Summary[]>([]);
  const [tab, setTab] = useState<"preview" | "json">("preview");
  const [past, setPast] = useState<CanvasData[]>([]);
  const [future, setFuture] = useState<CanvasData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const appElement = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(() => window.innerWidth <= 900);
  const [canvasOnly, setCanvasOnly] = useState(false);
  const promptElement = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!appElement.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      setCompact(entries[0].contentRect.width <= 900),
    );
    observer.observe(appElement.current);
    return () => observer.disconnect();
  }, []);
  const inFlight = useRef(false);
  const navigation = useRef(0);
  const mounted = useRef(true);
  const ready = useRef(false);
  const scope = useRef("");
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const canvas = workspace.canvas;
  const busy = submitting || !!(run && !terminal.has(run.status));
  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  const refreshLists = async () => {
    await Promise.all([chats.refresh(), records.refresh()]);
  };
  function showTerminal(r: Run) {
    const record = r.artifact;
    if (record) {
      setCanvasOnly(false);
      setWorkspace((w) => ({
        ...w,
        canvas: record.canvas,
        revision: record.revision,
      }));
      setPast([]);
      setFuture([]);
      setVersions([]);
      setTab("preview");
    }
    if (r.warning) setNotice(r.warning);
  }
  const loadChat = async (id: string) => {
    const ticket = ++navigation.current;
    const c = await api<Conversation>(`/conversations/${id}`);
    const active = c.active_run
      ? await api<Run>(`/runs/${c.active_run}`)
      : null;
    if (!mounted.current || ticket !== navigation.current) return;
    composer.select(scope.current, id);
    setCurrent(c);
    setRun(active);
    setWorkspace((w) => ({ ...w, chat_id: id }));
    setView("chat");
    if (active && terminal.has(active.status)) {
      const complete = await api<Conversation>(`/conversations/${id}`);
      if (!mounted.current || ticket !== navigation.current) return;
      setCurrent(complete);
      showTerminal(active);
    }
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
        const remote = await api<WorkspaceSnapshot>("/workspace");
        if (!alive) return;
        const w = sync.hydrate(s.scope, remote);
        composer.select(s.scope, w.chat_id);
        if (w.chat_id) {
          try {
            await loadChat(w.chat_id);
          } catch {
            composer.select(s.scope, null);
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
          navigation.current++;
          ready.current = false;
          setLoaded(false);
          setCurrent(null);
          setRun(null);
          sync.disconnect();
          if (changedProfile) {
            composer.select("", null);
            chats.setQuery("");
            records.setQuery("");
          }
          setPast([]);
          setFuture([]);
          await boot();
        } else setStatus(s);
      } catch (e) {
        if (alive) {
          setStatus(null);
          ready.current = false;
          setLoaded(false);
          setCurrent(null);
          setRun(null);
          navigation.current++;
          sync.disconnect();
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
    if (!run || terminal.has(run.status)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await api<Run>(`/runs/${run.id}`);
        if (!alive) return;
        if (terminal.has(r.status)) {
          const conversation = await api<Conversation>(
            `/conversations/${r.conversation_id}`,
          );
          if (!alive) return;
          setCurrent(conversation);
          setRun(r);
          showTerminal(r);
          await refreshLists();
          return;
        }
        setRun(r);
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
      setCanvasOnly(compact);
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
    setCanvasOnly(compact);
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
    setCanvasOnly(false);
    navigation.current++;
    setCurrent(null);
    setRun(null);
    composer.select(scope.current, null);
    setWorkspace((w) => ({ ...w, chat_id: null, canvas: null, revision: 0 }));
    setView("home");
    setError("");
  };
  const send = async () => {
    if (!draft.trim() || inFlight.current || busy) return;
    if (!withinMessageLimit()) return;
    if (!loaded || (!status?.connected && !composer.pending)) {
      setView("settings");
      setError(status?.detail || "Conecte o Hermes antes de enviar.");
      return;
    }
    const ticket = navigation.current;
    const payload = composer.prepare(
      current?.id || null,
      canvas ? { canvas, revision: workspace.revision } : null,
    );
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      const r = await api<Run>("/runs", payload);
      const conversation = await api<Conversation>(
        `/conversations/${r.conversation_id}`,
      );
      if (!mounted.current || ticket !== navigation.current) return;
      setRun(r);
      setCurrent(conversation);
      setNotice("");
      setWorkspace((w) => ({ ...w, chat_id: r.conversation_id }));
      if (terminal.has(r.status)) showTerminal(r);
      composer.clear();
      composer.select(scope.current, r.conversation_id);
      setView("chat");
      followBottom.current = true;
      await refreshLists();
    } catch (e) {
      fail(e);
      setNotice(
        "O pedido está no editor. Reenviar com o mesmo conteúdo consulta a mesma execução.",
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };
  function withinMessageLimit() {
    if (Array.from(draft.trim()).length <= messageLimit) return true;
    setError(
      "A mensagem excede o limite de 12.000 caracteres. Reduza o texto antes de enviar.",
    );
    promptElement.current?.focus();
    return false;
  }
  const sendNative = async () => {
    if (
      !nativeContext?.sessionId ||
      !draft.trim() ||
      inFlight.current ||
      !loaded
    )
      return;
    if (!withinMessageLimit()) return;
    const key = composer.key.current;
    const message = [
      draft.trim(),
      ...attachments.map(
        (a) => `Arquivo fornecido pelo usuário: ${a.name}\n${a.text}`,
      ),
    ];
    if (canvas) message.push("Canvas ativo:\n" + JSON.stringify(canvas));
    inFlight.current = true;
    setSubmitting(true);
    try {
      await nativeContext.send(message.join("\n\n"));
      if (mounted.current && key === composer.key.current) {
        composer.clear();
        setNotice(
          "Mensagem enviada à sessão ativa do Desktop. Acompanhe a resposta no chat nativo.",
        );
      }
    } catch (e) {
      fail(e);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };
  const control = async (action: string, body: unknown = {}) => {
    if (!run) return false;
    try {
      await api(`/runs/${run.id}/${action}`, body);
      setNotice(
        action === "stop"
          ? "Interrupção solicitada; aguardando o Hermes confirmar."
          : "Decisão enviada ao Hermes.",
      );
      return true;
    } catch (e) {
      fail(e);
      return false;
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
      composer.clear();
      newChat();
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };
  const files = async (list: FileList | null) => {
    if (!list) return;
    const key = composer.key.current;
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
      if (key === composer.key.current) setAttachments((a) => [...a, ...next]);
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
      setCanvasOnly(compact);
      setPast([]);
      setFuture([]);
      setVersions([]);
      setWorkspace((w) => ({ ...w, canvas: r.canvas, revision: r.revision }));
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div
      ref={appElement}
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
        <button
          className="new-chat"
          onClick={newChat}
          disabled={!loaded || submitting}
        >
          <Plus size={18} /> Nova conversa
        </button>
        <nav aria-label="Navegação principal">
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => {
              setCanvasOnly(false);
              setView("home");
            }}
          >
            <Compass size={18} /> Descobrir
          </button>
          <button
            className={view === "library" ? "active" : ""}
            onClick={() => {
              setCanvasOnly(false);
              setView("library");
              void refreshLists().catch(fail);
            }}
          >
            <LayoutGrid size={18} /> Minha biblioteca{" "}
          </button>
        </nav>
        <div className="sidebar-label">CONVERSAS</div>
        <label className="search-chats">
          <Search size={15} />
          <input
            aria-label="Buscar conversas"
            placeholder="Buscar conversas"
            value={chats.query}
            onChange={(e) => chats.setQuery(e.target.value)}
          />
        </label>
        <div className="recent-chats">
          {chats.rows.map((c) => (
            <button
              key={c.id}
              disabled={submitting}
              className={current?.id === c.id ? "active" : ""}
              onClick={() => {
                setCanvasOnly(false);
                void loadChat(c.id).catch(fail);
              }}
            >
              <MessageSquare size={16} />
              <span>{c.title}</span>
              {c.active_run && <Activity size={13} />}
            </button>
          ))}
          {chats.error && <p role="alert">{chats.error}</p>}
          {!chats.busy && !chats.error && chats.rows.length === 0 && (
            <p>
              {chats.query
                ? "Nenhuma conversa encontrada."
                : "Nenhuma conversa neste perfil."}
            </p>
          )}
          {chats.more && (
            <button
              disabled={chats.busy}
              onClick={() => void chats.refresh(true)}
            >
              Carregar mais
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            onClick={() => {
              setCanvasOnly(false);
              setView("settings");
            }}
          >
            <Settings2 size={18} /> Configurações
          </button>
          <div className="profile">
            <span>HA</span>
            <div>
              Atlas Intelligent UI<small>Versão 0.3.0</small>
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
          <button
            className="connection"
            onClick={() => {
              setCanvasOnly(false);
              setView("settings");
            }}
          >
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
        {sync.conflict ? (
          <div className="alert workspace-conflict" role="alert">
            <span>
              Outra aba alterou o rascunho compartilhado. Suas edições estão
              preservadas nesta aba.
            </span>
            <button onClick={sync.keepLocal}>
              Substituir pelo meu rascunho
            </button>
            <button
              onClick={() => {
                const remote = sync.acceptRemote();
                if (!remote) return;
                navigation.current++;
                setPast([]);
                setFuture([]);
                setVersions([]);
                setRun(null);
                setCurrent(null);
                composer.select(scope.current, remote.chat_id);
                setCanvasOnly(compact && !!remote.canvas);
                setView(remote.chat_id ? "chat" : "home");
                if (remote.chat_id) void loadChat(remote.chat_id).catch(fail);
              }}
            >
              Usar rascunho da outra aba
            </button>
          </div>
        ) : (
          sync.error && (
            <div className="alert error workspace-conflict" role="alert">
              <span>O rascunho aguarda sincronização. {sync.error}</span>
              <button onClick={sync.keepLocal}>Tentar salvar novamente</button>
            </div>
          )
        )}
        {canvas && compact && (
          <div
            className="mobile-panes"
            role="group"
            aria-label="Painel visível"
          >
            <button
              aria-pressed={!canvasOnly}
              onClick={() => setCanvasOnly(false)}
            >
              {view === "library"
                ? "Biblioteca"
                : view === "settings"
                  ? "Configurações"
                  : "Conversa"}
            </button>
            <button
              aria-pressed={canvasOnly}
              onClick={() => setCanvasOnly(true)}
            >
              Canvas
            </button>
          </div>
        )}
        <div
          className={`workspace ${canvas ? "with-canvas" : ""} ${compact ? "compact" : ""} ${canvasOnly ? "canvas-only" : ""}`}
        >
          <div className="conversation-pane">
            {view === "home" && (
              <div className="welcome">
                <h1>O que vamos explorar?</h1>
                <div className="suggestions">
                  {[
                    "Crie uma calculadora para dividir uma conta.",
                    "Compare duas opções de projeto em um canvas.",
                    "Crie um formulário para planejar minha semana.",
                    "Crie um catálogo de livros fictícios para eu escolher e comparar.",
                  ].map((s, i) => (
                    <button
                      key={s}
                      disabled={!loaded || submitting}
                      onClick={() => {
                        setDraft(s);
                        promptElement.current?.focus();
                      }}
                    >
                      <span aria-hidden="true">{["◷", "◈", "▤", "▦"][i]}</span>
                      <b>
                        {
                          [
                            "Calcular",
                            "Comparar",
                            "Planejar",
                            "Escolher itens",
                          ][i]
                        }
                      </b>
                      <small>{s}</small>
                    </button>
                  ))}
                </div>
                <div className="section-heading">
                  <div>
                    <h2>Exemplos interativos</h2>
                  </div>
                </div>
                <div className="example-grid">
                  {examples.map((e, i) => (
                    <button
                      className={`example example-${i}`}
                      key={e.id}
                      disabled={!loaded || submitting}
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
                        ) : i === 3 ? (
                          <div className="mini-collection">
                            {["Crônicas", "Ensaios", "Poesia"].map((s) => (
                              <span key={s}>{s}</span>
                            ))}
                          </div>
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
                              "Catálogo com seleção",
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
                      <LiveCanvasPreview canvas={run.preview ?? undefined} />
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
                        <RunControl
                          key={`${run.id}:${p.execution_generation}:${p.prompt_id}`}
                          prompt={p}
                          respond={control}
                        />
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
                              void control(
                                "resolve-unknown",
                                run.remote_id
                                  ? {
                                      admission_id: run.admission_id,
                                      execution_generation:
                                        run.execution_generation,
                                    }
                                  : {},
                              );
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
                    disabled={!loaded}
                    onChange={(e) => {
                      void importCanvas(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="library-search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar canvas"
                    placeholder="Buscar por título"
                    value={records.query}
                    onChange={(e) => records.setQuery(e.target.value)}
                  />
                </label>
                {records.error && <p role="alert">{records.error}</p>}
                <div className="saved-grid">
                  {records.rows.map((r) => (
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
                {!records.busy && !records.error && !records.rows.length && (
                  <div className="empty">
                    <LayoutGrid size={38} />
                    <h2>
                      {records.query
                        ? "Nenhum canvas encontrado"
                        : "Sua biblioteca está vazia"}
                    </h2>
                    <button className="primary" onClick={() => setView("home")}>
                      Explorar exemplos
                    </button>
                  </div>
                )}
                {records.more && (
                  <button
                    disabled={records.busy}
                    onClick={() => void records.refresh(true)}
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
                <h1>Configurações</h1>
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
                      void api<Status>("/status?force=true")
                        .then(setStatus)
                        .catch(fail)
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
                      disabled={!loaded}
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
                    O texto e os anexos ainda não enviados ficam nesta aba por
                    conversa e perfil.
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
                    ·{" "}
                    {saving
                      ? "salvando…"
                      : sync.error || sync.conflict
                        ? "alterações não salvas"
                        : "rascunho salvo"}
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
                    ref={promptElement}
                    id="atlas-prompt"
                    disabled={!loaded || submitting}
                    aria-label="Mensagem para o Hermes"
                    placeholder="O que vamos explorar hoje?"
                    maxLength={messageLimit}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
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
                          disabled={!loaded || submitting}
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
                      <span>Anexar texto</span>
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
                    disabled={!draft.trim() || submitting || !loaded}
                    onClick={() => void sendNative()}
                  >
                    Enviar à sessão ativa do Desktop
                  </button>
                )}
                <p>
                  Enter para enviar · Shift + Enter para nova linha{" "}
                  <span>{busy ? "A execução continua no Hermes" : ""}</span>
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
                    aria-label={
                      canvasOnly
                        ? "Mostrar conversa e canvas"
                        : "Ampliar canvas"
                    }
                    title={
                      canvasOnly
                        ? "Mostrar conversa e canvas"
                        : "Ampliar canvas"
                    }
                    hidden={compact}
                    onClick={() => setCanvasOnly(!canvasOnly)}
                  >
                    {canvasOnly ? (
                      <Minimize2 size={16} />
                    ) : (
                      <Maximize2 size={16} />
                    )}
                  </button>
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
                      setDraft(
                        draft.trim() ? draft.trimEnd() + "\n\n" + text : text,
                      );
                      setCanvasOnly(false);
                      setView(current ? "chat" : "home");
                      requestAnimationFrame(() =>
                        promptElement.current?.focus(),
                      );
                      setNotice(
                        "Seleção adicionada ao editor. Revise e envie ao Hermes.",
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
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
