/**
 * The Atlas workspace: library, block catalogue, an optional chat with the agent, and the open
 * canvas beside them. The same component runs standalone, as the Hermes dashboard tab and as the
 * Hermes Desktop page; `host` carries what differs between them.
 *
 * State lives on the server (profile-scoped): the workspace draft, conversations, runs and
 * canvas revisions. This component polls and reconciles; it never assumes a request it lost.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import "../theme";
import "./shell.css";
import { examples } from "../blocks/examples";
import {
  canvasFromLocation,
  copyText,
  onCanvasRequested,
  standaloneHost,
  takeRequestedCanvas,
  type CanvasTarget,
  type Host,
} from "../host/context";
import { createClient, download, downloadText } from "../host/client";
import { sayHello } from "../host/hello";
import { useAvailableHeight, useResolvedTheme } from "../host/theme";
import { detectLocale, setLocale, t, useLocale } from "../i18n";
import type {
  Canvas as CanvasData,
  ChatSummary,
  Conversation,
  ExportedFile,
  Record as CanvasRecord,
  Run,
  Status,
  Summary,
  Transport,
  Workspace,
} from "../types";
import { CanvasPane, type ExportFormat } from "./CanvasPane";
import { ChatView, terminal } from "./ChatView";
import { Composer, messageLimit } from "./Composer";
import { HomeView } from "./HomeView";
import { LibraryView } from "./LibraryView";
import { activityEvents, assistantText, conversationMessages } from "./replyDelivery";
import { SettingsView } from "./SettingsView";
import { Sidebar, type View } from "./Sidebar";
import { useComposer } from "./useComposer";
import { useDirectory } from "./useDirectory";
import { useWorkspace, type WorkspaceSnapshot } from "./useWorkspace";

const BlockCatalog = React.lazy(() =>
  import("../blocks/BlockCatalog").then((module) => ({ default: module.BlockCatalog })),
);

function viewTitle(view: View): string {
  switch (view) {
    case "catalog":
      return t("Catálogo de blocos");
    case "library":
      return t("Biblioteca");
    case "settings":
      return t("Configurações");
    case "chat":
      return t("Conversa");
    default:
      return t("Descobrir");
  }
}

export function App({
  transport,
  host: hostProp,
  nativeContext,
}: {
  transport?: Transport;
  host?: Host;
  /** Earlier name for `host.native`; still accepted. */
  nativeContext?: { sessionId: string | null; send: (text: string) => Promise<void> };
} = {}) {
  useLocale();
  const host = hostProp ?? standaloneHost;
  const native = host.native ?? nativeContext;
  const client = useMemo(() => createClient(transport), [transport]);
  const api = client.request;
  const [view, setView] = useState<View>("home");
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 800);
  useEffect(() => {
    const overlay = window.matchMedia("(max-width: 650px)");
    const closeOnNarrowScreen = (event: MediaQueryListEvent) => {
      if (event.matches) setSidebar(false);
    };
    overlay.addEventListener?.("change", closeOnNarrowScreen);
    return () => overlay.removeEventListener?.("change", closeOnNarrowScreen);
  }, []);
  const [status, setStatus] = useState<Status | null>(null);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const sync = useWorkspace(api);
  const { workspace, setWorkspace, saving } = sync;
  const composer = useComposer();
  const { text: draft, setText: setDraft, attachments, setFiles: setAttachments } = composer;
  const [run, setRun] = useState<Run | null>(null);
  const [pollFailure, setPollFailure] = useState<{ id: string; detail: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const chats = useDirectory<ChatSummary>(api, "/conversations", loaded ? status?.scope || "" : "");
  const records = useDirectory<Summary>(api, "/canvases", loaded ? status?.scope || "" : "");
  const [versions, setVersions] = useState<Summary[]>([]);
  const [past, setPast] = useState<CanvasData[]>([]);
  const [future, setFuture] = useState<CanvasData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [appElement, setAppElement] = useState<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(() => window.innerWidth <= 900);
  const [canvasOnly, setCanvasOnly] = useState(false);
  const promptElement = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!appElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      setCompact(entries[0].contentRect.width <= 900),
    );
    observer.observe(appElement);
    return () => observer.disconnect();
  }, [appElement]);
  const theme = useResolvedTheme(workspace.theme, host.kind, appElement);
  const height = useAvailableHeight(appElement, host.kind);
  useEffect(() => {
    // An explicit language choice wins; "auto" leaves whatever the host entry point detected.
    if (workspace.locale && workspace.locale !== "auto") setLocale(detectLocale(workspace.locale));
  }, [workspace.locale]);

  const inFlight = useRef(false);
  const navigation = useRef(0);
  const mounted = useRef(true);
  const ready = useRef(false);
  const scope = useRef("");
  const scroller = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const wanted = useRef<CanvasTarget | null>(null);
  const canvas = workspace.canvas;
  const busy = submitting || !!(run && !terminal.has(run.status));
  const messages = useMemo(
    () => conversationMessages(current?.messages ?? []),
    [current?.messages],
  );
  const liveText = useMemo(() => {
    if (!run || terminal.has(run.status)) return "";
    const fence = /^```atlas[ \t]*\r?\n/m.exec(run.text);
    return assistantText(fence ? run.text.slice(0, fence.index) : run.text, true);
  }, [run?.text, run?.status]);
  const events = useMemo(() => activityEvents(run?.events ?? []), [run?.events]);
  const connectionIssue =
    (pollFailure && pollFailure.id === run?.id && pollFailure.detail) || run?.connection_error;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const refreshLists = async () => {
    await Promise.all([chats.refresh(), records.refresh()]);
  };
  const resetHistory = () => {
    setPast([]);
    setFuture([]);
    setVersions([]);
  };
  function showTerminal(r: Run) {
    const record = r.artifact;
    if (record) {
      setCanvasOnly(false);
      setWorkspace((w) => ({ ...w, canvas: record.canvas, revision: record.revision }));
      resetHistory();
    }
    if (r.warning) setNotice(r.warning);
  }
  const loadChat = async (id: string) => {
    const ticket = ++navigation.current;
    const c = await api<Conversation>(`/conversations/${id}`);
    const active = c.active_run ? await api<Run>(`/runs/${c.active_run}`) : null;
    if (!mounted.current || ticket !== navigation.current) return;
    composer.select(scope.current, id);
    followBottom.current = true;
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
  const openSaved = async (id: string, revision?: number) => {
    try {
      const r = await api<CanvasRecord>(
        `/canvases/${encodeURIComponent(id)}${revision ? `?revision=${revision}` : ""}`,
      );
      setWorkspace((w) => ({ ...w, canvas: r.canvas, revision: r.revision }));
      setCanvasOnly(compact);
      setPast([]);
      setFuture([]);
      setVersions(await api<Summary[]>(`/canvases/${id}/versions`));
    } catch (e) {
      fail(e);
    }
  };

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    let checking = true;
    // A canvas named in the address (`?canvas=…`) or handed over by an inline canvas.
    wanted.current = takeRequestedCanvas() ?? canvasFromLocation(window.location.search);
    const stopListening = onCanvasRequested((target) => {
      if (ready.current) void openSaved(target.id, target.revision);
      else wanted.current = target;
    });
    async function boot(knownStatus?: Status) {
      try {
        const s = knownStatus ?? (await api<Status>("/status"));
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
        sayHello(api, host.kind);
        const target = wanted.current;
        wanted.current = null;
        if (target) void openSaved(target.id, target.revision);
      } catch (e) {
        if (alive) fail(e);
      }
    }
    void boot().finally(() => {
      checking = false;
    });
    const timer = setInterval(async () => {
      if (document.hidden || checking) return;
      checking = true;
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
          await boot(s);
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
      } finally {
        checking = false;
      }
    }, 5000);
    return () => {
      alive = false;
      mounted.current = false;
      clearInterval(timer);
      stopListening();
    };
  }, [client]);

  useEffect(() => {
    if (!run || terminal.has(run.status)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let cursor = run.cursor;
    let failures = 0;
    setPollFailure(null);
    const recovered = () => {
      if (failures) setPollFailure(null);
      failures = 0;
    };
    const scopeAtStart = scope.current;
    const poll = async () => {
      const ticket = navigation.current;
      const stillCurrent = () =>
        alive && ticket === navigation.current && scope.current === scopeAtStart;
      let finished = false;
      try {
        const path =
          "/runs/" +
          encodeURIComponent(run.id) +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : "");
        const r = await api<Run | { id: string; unchanged: true; cursor: string }>(path);
        if (!stillCurrent()) return;
        if (r.id !== run.id) throw new Error(t("A execução recebida tem outra identificação."));
        if ("unchanged" in r) {
          recovered();
          cursor = r.cursor;
          return;
        }
        if (r.conversation_id !== run.conversation_id)
          throw new Error(t("A execução pertence a outra conversa."));
        if (terminal.has(r.status)) {
          const conversation = await api<Conversation>(`/conversations/${r.conversation_id}`);
          if (!stillCurrent()) return;
          if (conversation.id !== r.conversation_id)
            throw new Error(t("O histórico recebido pertence a outra conversa."));
          recovered();
          finished = true;
          setCurrent(conversation);
          setRun(r);
          showTerminal(r);
          await refreshLists();
          return;
        }
        recovered();
        cursor = r.cursor;
        setRun(r);
      } catch (e) {
        if (!stillCurrent()) return;
        failures++;
        const detail = e instanceof Error ? e.message : String(e);
        setPollFailure((previous) =>
          previous?.id === run.id && previous.detail === detail
            ? previous
            : { id: run.id, detail },
        );
      } finally {
        if (alive && !finished) {
          const delay = failures ? Math.min(8000, 900 * 2 ** Math.min(failures - 1, 4)) : 450;
          timer = setTimeout(poll, document.hidden ? Math.max(delay, 3000) : delay);
        }
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [run?.id, run?.conversation_id, client]);

  useEffect(() => {
    const panel = scroller.current;
    if (panel && followBottom.current) panel.scrollTop = panel.scrollHeight;
  }, [current?.id, messages.length, liveText, run?.preview?.blocks.length]);
  useEffect(() => {
    if (window.innerWidth <= 800) setSidebar(false);
  }, [view]);

  const go = (target: View) => {
    setCanvasOnly(false);
    setView(target);
    if (target === "library") void refreshLists().catch(fail);
  };
  const setCanvas = (next: CanvasData) => {
    if (canvas) setPast((p) => [...p.slice(-19), canvas]);
    setFuture([]);
    setWorkspace((w) => ({ ...w, canvas: next }));
  };
  const openExample = (i: number) => {
    setNotice("");
    setCanvasOnly(compact);
    setWorkspace((w) => ({
      ...w,
      canvas: {
        ...structuredClone(examples[i]),
        id: "canvas-" + crypto.randomUUID().replaceAll("-", ""),
      },
      revision: 0,
    }));
    resetHistory();
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
  function withinMessageLimit() {
    if (Array.from(draft.trim()).length <= messageLimit) return true;
    setError(
      t("A mensagem excede o limite de 12.000 caracteres. Reduza o texto antes de enviar."),
    );
    promptElement.current?.focus();
    return false;
  }
  const send = async () => {
    if (!draft.trim() || inFlight.current || busy) return;
    if (!withinMessageLimit()) return;
    if (!loaded || (!status?.connected && !composer.pending)) {
      setView("settings");
      setError(status?.detail || t("Conecte o Hermes antes de enviar."));
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
      const conversation = await api<Conversation>(`/conversations/${r.conversation_id}`);
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
        t("O pedido está no editor. Reenviar com o mesmo conteúdo consulta a mesma execução."),
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };
  const sendNative = async () => {
    if (!native?.sessionId || !draft.trim() || inFlight.current || !loaded) return;
    if (!withinMessageLimit()) return;
    const key = composer.key.current;
    const message = [
      draft.trim(),
      ...attachments.map((a) => `${t("Arquivo fornecido pelo usuário")}: ${a.name}\n${a.text}`),
    ];
    if (canvas) message.push(t("Canvas ativo") + ":\n" + JSON.stringify(canvas));
    inFlight.current = true;
    setSubmitting(true);
    try {
      await native.send(message.join("\n\n"));
      if (mounted.current && key === composer.key.current) {
        composer.clear();
        setNotice(
          t("Mensagem enviada à sessão ativa do Desktop. Acompanhe a resposta no chat nativo."),
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
          ? t("Interrupção solicitada; aguardando o Hermes confirmar.")
          : t("Decisão enviada ao Hermes."),
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
      setNotice(t("Versão salva com suas interações."));
      setVersions(await api<Summary[]>(`/canvases/${r.id}/versions`));
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };
  const copy = async (text: string) => {
    if (await copyText(host, text)) setNotice(t("Copiado."));
    else setError(t("Não foi possível copiar. Use a opção de exportação."));
  };
  const rename = async (title: string) => {
    if (!current) return;
    try {
      setCurrent(await api<Conversation>(`/conversations/${current.id}`, { title }, "PATCH"));
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };
  const remove = async () => {
    if (
      !current ||
      !window.confirm(t("Excluir esta conversa do Atlas? A sessão original permanece no Hermes."))
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
  const removeCanvas = async (target: { id: string; title: string }) => {
    if (
      !window.confirm(
        t('Excluir "{title}" e todas as suas versões da biblioteca? Não é possível desfazer.', {
          title: target.title,
        }),
      )
    )
      return;
    try {
      await api(`/canvases/${encodeURIComponent(target.id)}`, {}, "DELETE");
      if (canvas?.id === target.id) {
        setWorkspace((w) => ({ ...w, canvas: null, revision: 0 }));
        resetHistory();
      }
      setNotice(t("Canvas excluído da biblioteca."));
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };
  const exportCanvas = async (format: ExportFormat) => {
    if (!canvas) return;
    if (format === "json" || !workspace.revision) {
      download(`${canvas.id}.json`, canvas);
      return;
    }
    try {
      const file = await api<ExportedFile>(
        `/canvases/${encodeURIComponent(canvas.id)}/export?format=${format}&revision=${workspace.revision}`,
      );
      downloadText(file.filename, file.content, file.media_type);
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
          throw new Error(t("Use arquivos TXT, Markdown, CSV, JSON ou LOG de até 200 KB."));
        next.push({ name: file.name, text: await file.text() });
      }
      if (next.length + attachments.length > 4)
        throw new Error(t("O limite é de quatro arquivos por mensagem."));
      if (key === composer.key.current) setAttachments((a) => [...a, ...next]);
    } catch (e) {
      fail(e);
    }
  };
  const importCanvas = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 256000) throw new Error(t("O canvas deve ter até 256 KB."));
      const data = JSON.parse(await file.text());
      const raw = data.canvas || data;
      raw.id = "canvas-" + crypto.randomUUID().replaceAll("-", "");
      const r = await api<CanvasRecord>("/canvases", raw);
      setCanvasOnly(compact);
      resetHistory();
      setWorkspace((w) => ({ ...w, canvas: r.canvas, revision: r.revision }));
      await refreshLists();
    } catch (e) {
      fail(e);
    }
  };
  const canvasAction = async (text: string) => {
    // In Hermes Desktop a selection goes to the chat the person is in; elsewhere, to this editor.
    if (host.insertIntoChat && (await host.insertIntoChat(text, native?.sessionId))) {
      setNotice(t("Seleção adicionada à sua mensagem no Hermes. Revise e envie."));
      return;
    }
    setDraft(draft.trim() ? draft.trimEnd() + "\n\n" + text : text);
    setCanvasOnly(false);
    setView(current ? "chat" : "home");
    requestAnimationFrame(() => promptElement.current?.focus());
    setNotice(t("Seleção adicionada ao editor. Revise e envie ao Hermes."));
  };
  const addBlock = (
    sample: CanvasData["blocks"][number],
    interaction?: NonNullable<CanvasData["state"]>[string],
  ) => {
    const block = { ...structuredClone(sample), id: "b-" + crypto.randomUUID() };
    const state = interaction
      ? { ...canvas?.state, [block.id]: structuredClone(interaction) }
      : canvas?.state;
    if (canvas) {
      setCanvas({ ...canvas, state, blocks: [...canvas.blocks, block] });
    } else {
      setWorkspace((w) => ({
        ...w,
        revision: 0,
        canvas: {
          schema_version: "1.0",
          id: "canvas-" + crypto.randomUUID(),
          title: t("Meu canvas"),
          description: t("Exemplos do catálogo Atlas com dados ilustrativos."),
          state,
          blocks: [block],
        },
      }));
      resetHistory();
    }
    setCanvasOnly(compact);
    setNotice(t("Bloco adicionado ao canvas: {title}", { title: block.title }));
  };

  return (
    <div
      ref={setAppElement}
      className={`atlas-app atlas-shell ${sidebar ? "" : "sidebar-hidden"}`}
      data-theme={theme}
      data-host={host.kind === "standalone" ? undefined : host.kind}
      style={height ? ({ "--atlas-height": height + "px" } as React.CSSProperties) : undefined}
    >
      <Sidebar
        view={view}
        go={go}
        newChat={newChat}
        ready={loaded}
        submitting={submitting}
        chats={chats}
        currentChat={current?.id}
        openChat={(id) => {
          setCanvasOnly(false);
          void loadChat(id).catch(fail);
        }}
      />
      <main className="atlas-main">
        <header className="topbar">
          <div>
            <button
              className="icon-button"
              aria-label={t("Alternar menu")}
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </button>
            <span>Atlas</span>
            <ChevronRight size={14} />
            <b>{viewTitle(view)}</b>
          </div>
          <button className="connection" onClick={() => go("settings")}>
            <i className={status?.connected ? "online" : ""} />
            {status?.connected ? t("Hermes conectado") : t("Hermes desconectado")}
          </button>
        </header>
        {error && (
          <div className="alert error" role="alert">
            <span>{error}</span>
            <button aria-label={t("Fechar erro")} onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert" role="status">
            <span>{notice}</span>
            <button aria-label={t("Fechar aviso")} onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {sync.conflict ? (
          <div className="alert workspace-conflict" role="alert">
            <span>
              {t("Outra aba alterou o rascunho compartilhado. Suas edições estão preservadas nesta aba.")}
            </span>
            <button onClick={sync.keepLocal}>{t("Substituir pelo meu rascunho")}</button>
            <button
              onClick={() => {
                const remote = sync.acceptRemote();
                if (!remote) return;
                navigation.current++;
                resetHistory();
                setRun(null);
                setCurrent(null);
                composer.select(scope.current, remote.chat_id);
                setCanvasOnly(compact && !!remote.canvas);
                setView(remote.chat_id ? "chat" : "home");
                if (remote.chat_id) void loadChat(remote.chat_id).catch(fail);
              }}
            >
              {t("Usar rascunho da outra aba")}
            </button>
          </div>
        ) : (
          sync.error && (
            <div className="alert error workspace-conflict" role="alert">
              <span>
                {t("O rascunho aguarda sincronização.")} {sync.error}
              </span>
              <button onClick={sync.keepLocal}>{t("Tentar salvar novamente")}</button>
            </div>
          )
        )}
        {canvas && compact && (
          <div className="mobile-panes" role="group" aria-label={t("Painel visível")}>
            <button aria-pressed={!canvasOnly} onClick={() => setCanvasOnly(false)}>
              {view === "home" ? t("Conversa") : viewTitle(view)}
            </button>
            <button aria-pressed={canvasOnly} onClick={() => setCanvasOnly(true)}>
              Canvas
            </button>
          </div>
        )}
        <div
          className={`workspace ${canvas ? "with-canvas" : ""} ${compact ? "compact" : ""} ${canvasOnly ? "canvas-only" : ""}`}
        >
          <div className="conversation-pane">
            {view === "catalog" && (
              <React.Suspense fallback={<p role="status">{t("Carregando catálogo…")}</p>}>
                <BlockCatalog
                  disabled={busy || (canvas?.blocks.length ?? 0) >= 32}
                  onAdd={addBlock}
                />
              </React.Suspense>
            )}
            {view === "home" && (
              <HomeView
                ready={loaded}
                submitting={submitting}
                host={host.kind}
                useStarter={(prompt) => {
                  setDraft(prompt);
                  promptElement.current?.focus();
                }}
                openExample={openExample}
              />
            )}
            {view === "chat" && (
              <ChatView
                conversation={current}
                messages={messages}
                run={run}
                liveText={liveText}
                events={events}
                connectionIssue={connectionIssue}
                busy={busy}
                scroller={scroller}
                onScroll={() => {
                  const el = scroller.current;
                  if (el)
                    followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                }}
                rename={(title) => void rename(title)}
                exportChat={() =>
                  current && download("atlas-conversa.json", { ...current, messages })
                }
                remove={() => void remove()}
                copy={(text) => void copy(text)}
                reuse={setDraft}
                openCanvas={(id, revision) => void openSaved(id, revision)}
                control={control}
              />
            )}
            {view === "library" && (
              <LibraryView
                ready={loaded}
                records={records}
                open={(id) => void openSaved(id)}
                remove={(record) => void removeCanvas(record)}
                importCanvas={(file) => void importCanvas(file)}
                explore={() => setView("home")}
              />
            )}
            {view === "settings" && (
              <SettingsView
                status={status}
                workspace={workspace}
                ready={loaded}
                host={host.kind}
                setTheme={(value) => setWorkspace((w) => ({ ...w, theme: value }))}
                setLanguage={(value) => {
                  setWorkspace((w) => ({ ...w, locale: value }));
                  setLocale(detectLocale(value));
                }}
                recheck={() =>
                  void api<Status>("/status?force=true").then(setStatus).catch(fail)
                }
              />
            )}
            {(view === "home" || view === "chat") && (
              <Composer
                draft={draft}
                setDraft={setDraft}
                attachments={attachments}
                removeAttachment={(index) => setAttachments((v) => v.filter((_, j) => index !== j))}
                attach={(list) => void files(list)}
                send={() => void send()}
                stop={() => void control("stop")}
                canStop={!!run?.remote_id && run.status !== "unknown"}
                busy={busy}
                ready={loaded}
                submitting={submitting}
                context={
                  canvas
                    ? {
                        title: canvas.title,
                        state: saving
                          ? t("salvando…")
                          : sync.error || sync.conflict
                            ? t("alterações não salvas")
                            : t("rascunho salvo"),
                      }
                    : null
                }
                nativeSend={native?.sessionId ? () => void sendNative() : null}
                input={promptElement}
              />
            )}
          </div>
          {canvas && (
            <CanvasPane
              key={canvas.id}
              canvas={canvas}
              revision={workspace.revision}
              versions={versions}
              saving={saving}
              compact={compact}
              expanded={canvasOnly}
              setExpanded={setCanvasOnly}
              canUndo={!!past.length}
              canRedo={!!future.length}
              undo={() => {
                const previous = past[past.length - 1];
                setPast((p) => p.slice(0, -1));
                setFuture((f) => [canvas, ...f]);
                setWorkspace((w) => ({ ...w, canvas: previous }));
              }}
              redo={() => {
                const next = future[0];
                setPast((p) => [...p, canvas]);
                setFuture((f) => f.slice(1));
                setWorkspace((w) => ({ ...w, canvas: next }));
              }}
              change={setCanvas}
              action={(text) => void canvasAction(text)}
              save={() => void save()}
              close={() => setWorkspace((w) => ({ ...w, canvas: null, revision: 0 }))}
              remove={() => void removeCanvas({ id: canvas.id, title: canvas.title })}
              exportAs={(format) => void exportCanvas(format)}
              openVersion={(revision) => void openSaved(canvas.id, revision)}
              copy={(text) => void copy(text)}
              htmlExport={status?.exports?.html ?? false}
            />
          )}
        </div>
      </main>
    </div>
  );
}
