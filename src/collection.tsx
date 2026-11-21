import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Image as ImageIcon,
  MessageSquarePlus,
} from "lucide-react";
import type { Block, CollectionItem, Interaction } from "./types";
import "./collection.css";

type CollectionBlock = Extract<Block, { type: "collection" }>;
type Props = {
  block: CollectionBlock;
  state: Interaction;
  change: (patch: Partial<Interaction>) => void;
  onAction?: (text: string) => void;
};

function externalUrl(value: string | null | undefined, image = false) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === "https:" || (!image && url.protocol === "http:"))
      return url;
  } catch {
    // Imported historical records can contain incomplete links.
  }
  return null;
}

// An image can contact its origin only after a click. Key the component by URL
// so permission to show one image cannot carry over to a different origin.
function Cover({ item }: { item: CollectionItem }) {
  const [status, setStatus] = useState<"placeholder" | "loaded" | "error">(
    "placeholder",
  );
  const url = externalUrl(item.image_url, true);
  const initials = item.title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  if (url && status === "loaded") {
    return (
      <div className="collection-cover">
        <img
          src={url.href}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setStatus("error")}
        />
      </div>
    );
  }
  return (
    <div className="collection-cover" data-illustration={item.illustration || undefined}>
      {!item.illustration && <span className="collection-monogram" aria-hidden="true">
        {initials}
      </span>}
      {url && (
        <button
          type="button"
          className="collection-image-trigger"
          title={url.hostname}
          aria-label={`Carregar imagem de ${item.title} em ${url.hostname}`}
          onClick={() => setStatus("loaded")}
        >
          <ImageIcon size={14} />
          {status === "error" ? "Tentar imagem novamente" : "Carregar imagem"}
        </button>
      )}
    </div>
  );
}

function ItemSource({ item }: { item: CollectionItem }) {
  const url = externalUrl(item.source?.url);
  return url && item.source ? (
    <a
      className="collection-source"
      href={url.href}
      target="_blank"
      rel="noreferrer noopener"
    >
      {item.source.title}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  ) : null;
}

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const scoreText = (item: CollectionItem) =>
  item.score == null ? "—" : `${number.format(item.score)}/100`;

function ComparisonTable({ items }: { items: CollectionItem[] }) {
  const labels = new Set(
    items.flatMap((item) => Object.keys(item.metadata ?? {})),
  );
  return (
    <div
      className="collection-matrix"
      role="region"
      aria-label="Comparação lado a lado"
      tabIndex={0}
    >
      <table>
        <caption>Comparação dos itens selecionados</caption>
        <thead>
          <tr>
            <th scope="col">Critério</th>
            {items.map((item) => (
              <th key={item.id} scope="col">
                {item.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.some((item) => !!item.description) && (
            <tr>
              <th scope="row">Descrição</th>
              {items.map((item) => (
                <td key={item.id}>{item.description || "—"}</td>
              ))}
            </tr>
          )}
          {items.some((item) => item.score != null) && (
            <tr>
              <th scope="row">Nota</th>
              {items.map((item) => (
                <td key={item.id}>{scoreText(item)}</td>
              ))}
            </tr>
          )}
          {[...labels].map((label) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {items.map((item) => (
                <td key={item.id}>
                  {item.metadata &&
                  Object.prototype.hasOwnProperty.call(item.metadata, label)
                    ? item.metadata[label]
                    : "—"}
                </td>
              ))}
            </tr>
          ))}
          {items.some((item) => item.source) && (
            <tr>
              <th scope="row">Fonte</th>
              {items.map((item) => (
                <td key={item.id}>
                  {item.source ? <ItemSource item={item} /> : "—"}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CollectionView({ block, state, change, onAction }: Props) {
  const [comparing, setComparing] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const [railEdges, setRailEdges] = useState({ left: false, right: false });
  const selectedIds = state.selected_ids ?? [];
  const selected = selectedIds.flatMap((id) =>
    block.items.filter((item) => item.id === id),
  );
  const sort = state.collection_sort ?? "original";
  const sorted = [...block.items];
  if (sort === "score")
    sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  if (sort === "title")
    sorted.sort((a, b) =>
      a.title.localeCompare(b.title, "pt-BR", { numeric: true }),
    );
  const compareOpen = comparing && selected.length > 1;
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => {
      const left = element.scrollLeft > 2;
      const right =
        element.scrollWidth - element.clientWidth - element.scrollLeft > 2;
      setRailEdges((previous) =>
        previous.left === left && previous.right === right
          ? previous
          : { left, right },
      );
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer?.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [compareOpen, block.items.length]);
  const scrollRail = (direction: number) => {
    const element = rail.current;
    if (element)
      element.scrollBy({
        left: direction * Math.max(1, element.clientWidth * 0.85),
      });
  };
  const count = selected.length;
  const toggle = (id: string) =>
    change({
      selected_ids: selectedIds.includes(id)
        ? selectedIds.filter((entry) => entry !== id)
        : [...selectedIds, id],
    });
  const draft = () => {
    const names = selected
      .map((item) => `• ${item.title} [${item.id}]`)
      .join("\n");
    onAction?.(
      `Analise minha seleção em “${block.title}”. ${count > 1 ? "Compare as alternativas e explique as diferenças mais relevantes." : "Explique os pontos fortes e as limitações deste item."}\n\n${names}`,
    );
  };
  return (
    <div className="collection-view">
      <div className="collection-tools">
        {!compareOpen && (
          <label>
            Ordenar
            <select
              value={sort}
              onChange={(event) =>
                change({
                  collection_sort: event.target
                    .value as Interaction["collection_sort"],
                })
              }
            >
              <option value="original">Ordem original</option>
              {block.items.some((item) => item.score != null) && (
                <option value="score">Maior nota</option>
              )}
              <option value="title">Título (A–Z)</option>
            </select>
          </label>
        )}
        <button
          type="button"
          disabled={count < 2}
          aria-pressed={compareOpen}
          onClick={() => setComparing(!compareOpen)}
        >
          <Columns3 size={16} />
          {compareOpen ? "Voltar aos cartões" : "Comparar selecionados"}
        </button>
      </div>
      {!compareOpen && (
        <div className="collection-pagination">
          <span>
            {block.items.length} {block.items.length === 1 ? "item" : "itens"}
          </span>
          {(railEdges.left || railEdges.right) && (
            <div>
              <button
                type="button"
                aria-label="Itens anteriores"
                disabled={!railEdges.left}
                onClick={() => scrollRail(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label="Próximos itens"
                disabled={!railEdges.right}
                onClick={() => scrollRail(1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          )}
        </div>
      )}
      {compareOpen ? (
        <ComparisonTable items={selected} />
      ) : (
        <div
          ref={rail}
          className="collection-cards"
          role="region"
          aria-label={`Itens de ${block.title}`}
          tabIndex={0}
        >
          {sorted.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <article
                key={item.id}
                className="collection-card"
                data-selected={isSelected}
                data-tone={block.items.indexOf(item) % 4}
              >
                <Cover key={item.image_url || item.id} item={item} />
                <div className="collection-card-body">
                  <h4>{item.title}</h4>
                  {item.score != null && (
                    <span className="collection-score">
                      Nota {scoreText(item)}
                    </span>
                  )}
                  {item.description && <p>{item.description}</p>}
                  {Object.keys(item.metadata ?? {}).length > 0 && (
                    <dl>
                      {Object.entries(item.metadata ?? {}).map(
                        ([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                  )}
                  <ItemSource item={item} />
                  <label className="collection-pick">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${item.title}`}
                      checked={isSelected}
                      disabled={!isSelected && count >= 4}
                      onChange={() => toggle(item.id)}
                    />
                    {isSelected ? "Selecionado" : "Selecionar"}
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="collection-footer">
        <span role="status">
          {count ? `${count} de 4 selecionados` : "Selecione até 4 itens"}
        </span>
        {onAction && (
          <button
            className="primary"
            type="button"
            disabled={!count}
            onClick={draft}
          >
            <MessageSquarePlus size={15} /> Usar seleção no chat
          </button>
        )}
      </div>
    </div>
  );
}
