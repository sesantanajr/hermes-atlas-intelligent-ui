import React, { useId, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CanvasLink } from "./CanvasLink";
import type { Interaction } from "../types";
import { intlLocale, msg, t } from "../i18n";
import "./editorial.css";

type Section = { id: string; title: string; body: string };
type Fact = { label: string; value: string };
type Tone = "neutral" | "info" | "success" | "warning";
type Atom =
  | { kind: "text"; text: string }
  | { kind: "fraction"; numerator: string; denominator: string }
  | { kind: "power"; base: string; exponent: string }
  | { kind: "root"; radicand: string };
export type EditorialBlock = { id: string; title: string } & (
  | { type: "heading"; level?: 2 | 3 | 4 | 5; subtitle?: string }
  | { type: "callout"; tone?: Tone; body: string }
  | { type: "quote"; quote: string; attribution: string; url?: string | null }
  | { type: "glossary"; entries: { term: string; definition: string }[] }
  | { type: "code"; language?: string; code: string }
  | { type: "markdown"; body: string }
  | { type: "equation"; expression: Atom[]; description: string }
  | { type: "badges"; items: { label: string; tone?: Tone }[] }
  | { type: "facts"; entries: Fact[] }
  | { type: "article"; byline?: string; lead?: string; sections: Section[] }
  | { type: "accordion"; items: Section[] }
  | { type: "cards"; items: (Section & { prompt?: string })[] }
  | { type: "columns"; columns: Section[] }
  | { type: "carousel"; slides: Section[] }
  | { type: "steps_list"; steps: Section[] }
  | {
      type: "bibliography";
      entries: {
        title: string;
        author?: string;
        locator?: string;
        url: string;
      }[];
    }
  | {
      type: "entity";
      name: string;
      category: string;
      summary: string;
      attributes?: Fact[];
      url?: string | null;
    }
  | { type: "document"; body: string }
);
const kinds: Record<EditorialBlock["type"], true> = {
  heading: true,
  callout: true,
  quote: true,
  glossary: true,
  code: true,
  markdown: true,
  equation: true,
  badges: true,
  facts: true,
  article: true,
  accordion: true,
  cards: true,
  columns: true,
  carousel: true,
  steps_list: true,
  bibliography: true,
  entity: true,
  document: true,
};
export function isEditorialBlock(block: {
  type: string;
}): block is EditorialBlock {
  return Object.prototype.hasOwnProperty.call(kinds, block.type);
}
// Portuguese source strings, marked with `msg()`; `t()` translates them where
// they are rendered.
const toneLabel: Record<Tone, string> = {
  neutral: msg("Nota"),
  info: msg("Informação"),
  success: msg("Concluído"),
  warning: msg("Atenção"),
};
function ReferenceLink({
  url,
  children,
}: {
  url?: string | null;
  children: React.ReactNode;
}) {
  let href: string | undefined;
  try {
    const parsed = new URL(url || "");
    if (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    )
      href = parsed.href;
  } catch {
    /* Unlinked label for incomplete or invalid references. */
  }
  return href ? (
    <CanvasLink href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </CanvasLink>
  ) : (
    <span>{children}</span>
  );
}
function FactList({ entries }: { entries: Fact[] }) {
  return (
    <dl className="ae-facts">
      {entries.map((f, i) => (
        <div key={i}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
const math = React.createElement;
const mathText = (value: string) => math("mtext", null, value);
function atomNode(atom: Atom, key: number) {
  switch (atom.kind) {
    case "text":
      return math("mtext", { key }, atom.text);
    case "fraction":
      return math(
        "mfrac",
        { key },
        mathText(atom.numerator),
        mathText(atom.denominator),
      );
    case "power":
      return math(
        "msup",
        { key },
        mathText(atom.base),
        mathText(atom.exponent),
      );
    case "root":
      return math("msqrt", { key }, mathText(atom.radicand));
  }
}
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(intlLocale());
type Props = {
  block: EditorialBlock;
  state: Interaction;
  change: (patch: Partial<Interaction>) => void;
  onAction?: (text: string) => void;
};
export function EditorialView({ block, state, change, onAction }: Props) {
  const prefix = useId();
  const articleRef = useRef<HTMLElement>(null);
  const values = state.values || {};
  function update(key: string, value?: string) {
    const next = { ...values, [key]: value ?? "" };
    if (value === undefined) delete next[key];
    change({ values: next });
  }
  const checked = (key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) && values[key] === "1";
  switch (block.type) {
    case "heading":
      return (
        <header className="ae-heading">
          {React.createElement("h" + (block.level ?? 3), null, block.title)}
          {block.subtitle && <p>{block.subtitle}</p>}
        </header>
      );
    case "callout":
      return (
        <aside className="ae-callout" data-tone={block.tone ?? "info"}>
          <strong>{t(toneLabel[block.tone ?? "info"])}</strong>
          <p>{block.body}</p>
        </aside>
      );
    case "quote":
      return (
        <figure className="ae-quote">
          <blockquote>{block.quote}</blockquote>
          <figcaption>
            <cite>
              <ReferenceLink url={block.url}>{block.attribution}</ReferenceLink>
            </cite>
          </figcaption>
        </figure>
      );
    case "glossary": {
      const query = values.query ?? "";
      const entries = block.entries.filter((e) =>
        normalize(e.term + " " + e.definition).includes(
          normalize(query.trim()),
        ),
      );
      return (
        <div className="ae-glossary">
          <label>
            {t("Filtrar termos")}
            <input
              type="search"
              value={query}
              maxLength={160}
              onChange={(e) => update("query", e.target.value || undefined)}
            />
          </label>
          {entries.length ? (
            <dl>
              {entries.map((e, i) => (
                <div key={i}>
                  <dt>{e.term}</dt>
                  <dd>{e.definition}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p role="status">{t("Nenhum termo encontrado.")}</p>
          )}
        </div>
      );
    }
    case "code": {
      const numbered = checked("numbers");
      return (
        <div className="ae-code">
          <div className="ae-toolbar">
            <span>{block.language ?? "text"}</span>
            <button
              type="button"
              aria-pressed={numbered}
              onClick={() => update("numbers", numbered ? undefined : "1")}
            >
              {t("Numerar linhas")}
            </button>
          </div>
          <pre tabIndex={0}>
            <code>
              {numbered
                ? block.code.split("\n").map((line, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && "\n"}
                      <span className="ae-line-number" aria-hidden="true">
                        {i + 1}
                      </span>
                      {line}
                    </React.Fragment>
                  ))
                : block.code}
            </code>
          </pre>
        </div>
      );
    }
    case "markdown":
      return (
        <div className="ae-markdown">
          <ReactMarkdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <ReferenceLink url={href}>{children}</ReferenceLink>
              ),
              img: ({ alt }) => <span>{alt}</span>,
            }}
          >
            {block.body}
          </ReactMarkdown>
        </div>
      );
    case "equation":
      return (
        <figure className="ae-equation">
          {math(
            "math",
            { display: "block", "aria-label": block.description },
            math("mrow", null, block.expression.map(atomNode)),
          )}
          <figcaption>{block.description}</figcaption>
        </figure>
      );
    case "badges":
      return (
        <ul className="ae-badges">
          {block.items.map((badge, i) => (
            <li key={i} data-tone={badge.tone ?? "neutral"}>
              {badge.label}
            </li>
          ))}
        </ul>
      );
    case "facts":
      return <FactList entries={block.entries} />;
    case "article": {
      const jump = (id: string) => {
        const node = articleRef.current?.ownerDocument.getElementById(
          prefix + "-" + id,
        );
        if (node && articleRef.current?.contains(node)) {
          node.focus();
          node.scrollIntoView?.({ block: "nearest" });
        }
      };
      return (
        <article ref={articleRef} className="ae-article">
          {block.byline && <p className="ae-byline">{block.byline}</p>}
          {block.lead && <p className="ae-lead">{block.lead}</p>}
          {block.sections.length > 1 && (
            <nav aria-label={t("Seções do artigo")}>
              {block.sections.map((s) => (
                <button key={s.id} type="button" onClick={() => jump(s.id)}>
                  {s.title}
                </button>
              ))}
            </nav>
          )}
          {block.sections.map((s) => (
            <section key={s.id}>
              <h4 id={prefix + "-" + s.id} tabIndex={-1}>
                {s.title}
              </h4>
              <p>{s.body}</p>
            </section>
          ))}
        </article>
      );
    }
    case "accordion":
      return (
        <div className="ae-accordion">
          {block.items.map((item) => (
            <div key={item.id}>
              <button
                type="button"
                aria-expanded={checked(item.id)}
                aria-controls={prefix + "-" + item.id}
                onClick={() =>
                  update(item.id, checked(item.id) ? undefined : "1")
                }
              >
                <span>{item.title}</span>
                <span aria-hidden="true">{checked(item.id) ? "−" : "+"}</span>
              </button>
              <p id={prefix + "-" + item.id} hidden={!checked(item.id)}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      );
    case "cards":
      return (
        <div className="ae-cards">
          {block.items.map((card) => (
            <section key={card.id}>
              <h4>{card.title}</h4>
              <p>{card.body}</p>
              {card.prompt && onAction && (
                <button type="button" onClick={() => onAction(card.prompt!)}>
                  {t("Explorar {title}", { title: card.title })}
                </button>
              )}
            </section>
          ))}
        </div>
      );
    case "columns":
      return (
        <div className="ae-columns">
          {block.columns.map((c) => (
            <section key={c.id}>
              <h4>{c.title}</h4>
              <p>{c.body}</p>
            </section>
          ))}
        </div>
      );
    case "carousel": {
      const index = Math.max(
        0,
        block.slides.findIndex((s) => s.id === values.slide),
      );
      const slide = block.slides[index];
      if (!slide) return null;
      return (
        <section
          className="ae-carousel"
          aria-roledescription={t("carrossel")}
          aria-label={block.title}
        >
          <div aria-live="polite" aria-atomic="true">
            <small>
              {t("{n} de {total}", {
                n: index + 1,
                total: block.slides.length,
              })}
            </small>
            <h4>{slide.title}</h4>
            <p>{slide.body}</p>
          </div>
          <div className="ae-toolbar">
            <button
              type="button"
              disabled={!index}
              onClick={() => update("slide", block.slides[index - 1].id)}
            >
              {t("Anterior")}
            </button>
            <select
              aria-label={t("Escolher painel")}
              value={slide.id}
              onChange={(e) => update("slide", e.target.value)}
            >
              {block.slides.map((s, i) => (
                <option value={s.id} key={s.id}>
                  {i + 1}. {s.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={index === block.slides.length - 1}
              onClick={() => update("slide", block.slides[index + 1].id)}
            >
              {t("Próximo")}
            </button>
          </div>
        </section>
      );
    }
    case "steps_list": {
      const complete = block.steps.filter((s) => checked(s.id)).length;
      return (
        <div className="ae-steps">
          <p aria-live="polite">
            {t("{n} de {total} etapas concluídas", {
              n: complete,
              total: block.steps.length,
            })}
          </p>
          <progress
            aria-label={t("Etapas concluídas")}
            value={complete}
            max={block.steps.length}
          />
          <ol>
            {block.steps.map((s) => (
              <li key={s.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked(s.id)}
                    onChange={(e) =>
                      update(s.id, e.target.checked ? "1" : undefined)
                    }
                  />
                  {s.title}
                </label>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      );
    }
    case "bibliography":
      return (
        <ol className="ae-bibliography">
          {block.entries.map((e, i) => (
            <li key={i}>
              <cite>
                <ReferenceLink url={e.url}>{e.title}</ReferenceLink>
              </cite>
              {e.author && <div>{e.author}</div>}
              {e.locator && <small>{e.locator}</small>}
            </li>
          ))}
        </ol>
      );
    case "entity":
      return (
        <article className="ae-entity">
          <div className="ae-byline">{block.category}</div>
          <h4>{block.name}</h4>
          <p>{block.summary}</p>
          {!!block.attributes?.length && (
            <FactList entries={block.attributes} />
          )}
          <div className="ae-toolbar">
            {block.url && (
              <ReferenceLink url={block.url}>
                {t("Consultar referência")}
              </ReferenceLink>
            )}
            {onAction && (
              <button
                type="button"
                onClick={() =>
                  onAction(
                    t("Explique {name} no contexto de {title}.", {
                      name: block.name,
                      title: block.title,
                    }) +
                      " " +
                      block.summary,
                  )
                }
              >
                {t("Perguntar sobre {name}", { name: block.name })}
              </button>
            )}
          </div>
        </article>
      );
    case "document": {
      const draft = values.draft ?? block.body;
      const count = draft.trim().split(/\s+/u).filter(Boolean).length;
      return (
        <div className="ae-document">
          <label>
            {t("Editar documento")}
            <textarea
              maxLength={4000}
              rows={7}
              value={draft}
              onChange={(e) => update("draft", e.target.value)}
            />
          </label>
          <div className="ae-toolbar">
            <span>
              {count === 1
                ? t("{n} palavra", { n: count })
                : t("{n} palavras", { n: count })}
            </span>
            {onAction && (
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={() => onAction(block.title + "\n\n" + draft)}
              >
                {t("Usar documento no chat")}
              </button>
            )}
          </div>
        </div>
      );
    }
  }
}
