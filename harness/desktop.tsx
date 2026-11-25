/**
 * The built Desktop extension (`desktop/plugin.js`) in a Desktop-like page: a conversation whose
 * replies show a canvas both ways the agent can attach one (a `MEDIA:` page drawn by the tool
 * media renderer, and the `::atlas{…}` directive), the Atlas page, Desktop theme variables and a
 * composer that shows what a canvas puts in it. Development only.
 *
 * Query parameters: `canvas` (an id in the library; default: one built from catalogue examples),
 * `theme` (light | dark), `lang` (pt-BR | en), `route` (/chat | /atlas), `only` (file | directive),
 * `clean` (hide the harness's own buttons, for screenshots).
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type Contribution,
  composer,
  contributions,
  emit,
  pluginContext,
  route,
  TOOL_MEDIA_RENDERER_AREA,
  toasts,
  TRANSCRIPT_DIRECTIVE_AREA,
  useValue,
} from "./desktop-sdk";

const API = "/api/plugins/atlas-intelligent-ui";
const TITLE = "Viagem a Lisboa (harness)";
const params = new URLSearchParams(location.search);
type Target = { id: string; revision: number; title: string };

async function json(path: string, init?: RequestInit) {
  const response = await fetch(API + path, init);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

/** The canvas to show: `?canvas=<id>`, or one made of the catalogue's own examples. */
async function harnessCanvas(): Promise<Target> {
  const wanted = params.get("canvas");
  if (wanted) {
    const record = await json(`/canvases/${encodeURIComponent(wanted)}`);
    return { id: record.id, revision: record.revision, title: record.canvas.title };
  }
  const listing = await json(`/canvases?limit=50&q=${encodeURIComponent("harness")}`);
  const items = Array.isArray(listing) ? listing : (listing.items ?? listing.canvases ?? []);
  const found = items.find((item: { title: string }) => item.title === TITLE);
  if (found) return found;
  const blocks = [];
  for (const kind of ["checklist", "metric", "series", "form"]) {
    const { example } = await json(`/components/${kind}`);
    blocks.push({ ...example, id: `${kind}-1` });
  }
  return json("/canvases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "harness-trip", title: TITLE, description: "Exemplos do catálogo.", blocks }),
  });
}

type Draw = (props: unknown) => React.ReactNode;
const drawOf = (entry?: Contribution) => (entry?.data as { render?: Draw } | undefined)?.render;

function Transcript({ canvas, directive, media }: { canvas: Target; directive?: Contribution; media?: Contribution }) {
  const only = params.get("only");
  const english = document.documentElement.lang.startsWith("en");
  const path = `/home/me/.hermes/plugin-data/atlas-intelligent-ui/exports/${canvas.id}-v${canvas.revision}.html`;
  const fileCard = <pre className="file-card">MEDIA:{path}</pre>;
  const drawFile = drawOf(media);
  const drawDirective = drawOf(directive);
  const source = `::atlas{id="${canvas.id}" rev="${canvas.revision}"}`;
  return (
    <div className="transcript">
      <div className="bubble user">
        {english
          ? "Build a dashboard for the Microsoft 365 migration with the schedule, costs and risks."
          : "Monte um painel da migração para o Microsoft 365 com cronograma, custos e riscos."}
      </div>
      {only !== "directive" && (
        <div className="bubble assistant">
          <p>
            {english
              ? "Here it is. Tick what is done, edit the numbers and drag the risks; I will see your changes on your next message."
              : "Montei o painel. Marque o que já está pronto, edite os números e arraste os riscos; eu vejo suas mudanças na próxima mensagem."}
          </p>
          {drawFile
            ? drawFile({
                file: { path, name: path.split("/").pop(), kind: "file", mime: "text/html", resolveUrl: async () => "" },
                toolName: "atlas_render",
                toolCallId: "call-harness",
                args: {},
                result: JSON.stringify({ success: true, id: canvas.id, revision: canvas.revision, show: "file" }),
                sessionId: "harness-session",
                fallback: fileCard,
              })
            : fileCard}
        </div>
      )}
      {only !== "file" && (
        <div className="bubble assistant">
          <p>{english ? "The same canvas through the ::atlas directive:" : "O mesmo canvas pela diretiva ::atlas:"}</p>
          {drawDirective ? (
            drawDirective({ attrs: { id: canvas.id, rev: String(canvas.revision) }, source, streaming: false, sessionId: "harness-session" })
          ) : (
            <pre>{source}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({ canvas }: { canvas: Target }) {
  const items = useValue(contributions);
  const path = useValue(route);
  const text = useValue(composer);
  const notes = useValue(toasts);
  const [dark, setDark] = useState(
    params.get("theme") ? params.get("theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [lang, setLang] = useState(params.get("lang") || document.documentElement.lang || "pt-BR");
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const page = items.find((item) => item.area === "routes" && (item.data as { path?: string })?.path === path);
  const nav = items.filter((item) => item.area === "sidebar.nav");
  const directive = items.find((item) => item.area === TRANSCRIPT_DIRECTIVE_AREA);
  const media = items.find((item) => item.area === TOOL_MEDIA_RENDERER_AREA);
  return (
    <div className="desktop">
      <aside>
        <button className={path === "/chat" ? "active" : ""} onClick={() => route.set("/chat")}>
          Chat
        </button>
        {nav.map((item) => {
          const data = item.data as { path: string; label: string };
          return (
            <button key={item.id} className={path === data.path ? "active" : ""} onClick={() => route.set(data.path)}>
              {data.label}
            </button>
          );
        })}
        {!params.has("clean") && (
          <>
            <hr />
            <button onClick={() => setDark(!dark)}>{dark ? "Tema claro" : "Tema escuro"}</button>
            <button onClick={() => setLang(lang.startsWith("en") ? "pt-BR" : "en")}>
              {lang.startsWith("en") ? "Português" : "English"}
            </button>
            <button
              onClick={() =>
                emit("plugin.atlas-intelligent-ui.canvas.saved", { id: canvas.id, revision: canvas.revision })
              }
            >
              Evento: canvas salvo
            </button>
          </>
        )}
      </aside>
      <main>
        {path === "/chat" ? (
          <Transcript canvas={canvas} directive={directive} media={media} />
        ) : (
          (page?.render?.() as React.ReactNode)
        )}
        {path === "/chat" && (
          <textarea
            id="harness-composer"
            value={text}
            onChange={(event) => composer.set(event.target.value)}
            placeholder="Composer"
          />
        )}
        <div className="toasts">
          {notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        </div>
      </main>
    </div>
  );
}

async function boot() {
  if (params.get("lang")) document.documentElement.lang = params.get("lang")!;
  if (params.get("route")) route.set(params.get("route")!);
  const canvas = await harnessCanvas();
  const url = "/desktop/plugin.js";
  const plugin = (await import(/* @vite-ignore */ url)).default;
  if (plugin.id !== "atlas-intelligent-ui") throw new Error(`unexpected plugin id ${plugin.id}`);
  plugin.register(pluginContext());
  createRoot(document.getElementById("root")!).render(<Shell canvas={canvas} />);
}

boot().catch((error) => {
  document.getElementById("root")!.textContent = String(error);
});
