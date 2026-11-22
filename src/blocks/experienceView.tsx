import React, { useContext, useState } from "react";
import { CanvasLink, PreviewContext } from "./CanvasLink";
import type { Interaction } from "../types";
import type { ExperienceBlock, Photo } from "./experienceBlocks";
import { worldLand } from "./worldLand";
import { intlLocale, t } from "../i18n";
import camera from "./camera.webp";
import cinema from "./cinema.webp";
import focus from "./focus.mp4";
import tone from "./tone.mp3";
import "./miniapps.css";

const bundled: Record<string, string> = {
  "atlas:camera": camera,
  "atlas:cinema": cinema,
  "atlas:focus": focus,
  "atlas:tone": tone,
};
function safeMedia(src: string) {
  if (Object.hasOwn(bundled, src)) return bundled[src];
  try {
    const url = new URL(src);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function Media({
  src,
  alt,
  kind,
  captions,
}: {
  src: string;
  alt: string;
  kind: "image" | "video" | "audio";
  captions?: string | null;
}) {
  const preview = useContext(PreviewContext);
  const [allowed, setAllowed] = useState("");
  const [failed, setFailed] = useState(false);
  const url = safeMedia(src);
  if (!url || failed)
    return <p role="status">{t("Mídia indisponível. {alt}", { alt })}</p>;
  const captionsUrl = captions ? safeMedia(captions) : undefined;
  const resources = [
    Object.hasOwn(bundled, src) ? undefined : url,
    captionsUrl,
  ].filter((u): u is string => !!u);
  const consentKey = JSON.stringify(resources);
  if (preview || (resources.length > 0 && allowed !== consentKey)) {
    const origins = [...new Set(resources.map((u) => new URL(u).hostname))];
    return (
      <button disabled={preview} onClick={() => setAllowed(consentKey)}>
        {t("Carregar mídia de {origin}", {
          origin: origins.join(", ") || "Atlas",
        })}
      </button>
    );
  }
  if (kind === "image")
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  if (kind === "video")
    return (
      <video
        controls
        playsInline
        preload="none"
        crossOrigin={captionsUrl ? "anonymous" : undefined}
        aria-label={alt}
        src={url}
        onError={() => setFailed(true)}
      >
        {captionsUrl && (
          <track
            kind="captions"
            label={t("Legendas")}
            srcLang="pt"
            src={captionsUrl}
          />
        )}
      </video>
    );
  return (
    <audio
      controls
      preload="none"
      aria-label={alt}
      src={url}
      onError={() => setFailed(true)}
    />
  );
}
function PhotoFrame({ photo }: { photo: Photo }) {
  return (
    <figure>
      <Media key={photo.src} kind="image" src={photo.src} alt={photo.alt} />
      {photo.caption && <figcaption>{photo.caption}</figcaption>}
    </figure>
  );
}
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(intlLocale(), { style: "currency", currency }).format(
    cents / 100,
  );
const mapUrl = (lat: number, lon: number) =>
  "https://www.openstreetmap.org/?mlat=" +
  lat +
  "&mlon=" +
  lon +
  "#map=13/" +
  lat +
  "/" +
  lon;
type Props = {
  block: ExperienceBlock;
  state: Interaction;
  change: (patch: Partial<Interaction>) => void;
  onAction?: (text: string) => void;
};
export function ExperienceView({ block: b, state, change, onAction }: Props) {
  const v = Object.assign(
    Object.create(null) as Record<string, string>,
    state.values,
  );
  const set = (key: string, value: string) =>
    change({ values: { ...v, [key]: value } });
  switch (b.type) {
    case "image":
      return (
        <div className="atlas-media">
          <PhotoFrame photo={b.photo} />
        </div>
      );
    case "gallery": {
      const i = Math.min(b.photos.length - 1, Number(v.photo) || 0);
      return (
        <div className="atlas-media">
          <PhotoFrame photo={b.photos[i]} />
          <div className="atlas-mini-toolbar">
            <button disabled={!i} onClick={() => set("photo", String(i - 1))}>
              {t("Anterior")}
            </button>
            <output>
              {i + 1} / {b.photos.length}
            </output>
            <button
              disabled={i + 1 === b.photos.length}
              onClick={() => set("photo", String(i + 1))}
            >
              {t("Próxima")}
            </button>
          </div>
        </div>
      );
    }
    case "video":
    case "audio":
      return (
        <div className="atlas-media">
          <Media
            key={b.src}
            kind={b.type}
            src={b.src}
            alt={b.title}
            captions={b.type === "video" ? b.captions_url : null}
          />
          <details>
            <summary>{t("Transcrição")}</summary>
            <p>{b.transcript}</p>
          </details>
        </div>
      );
    case "map": {
      const pin = b.pins.find((p) => p.id === v.pin) ?? b.pins[0];
      const zoom = Number(v.zoom) || 1,
        w = 360 / zoom,
        h = 180 / zoom;
      const left = Math.max(0, Math.min(360 - w, pin.lon + 180 - w / 2)),
        top = Math.max(0, Math.min(180 - h, 90 - pin.lat - h / 2));
      return (
        <div className="atlas-map">
          <svg
            viewBox={[left, top, w, h].join(" ")}
            role="img"
            aria-label={t("Mapa com {places}", {
              places: b.pins.map((p) => p.label).join(", "),
            })}
          >
            <path d={worldLand} fillRule="evenodd" />
            {b.pins.map((p) => (
              <circle
                key={p.id}
                cx={p.lon + 180}
                cy={90 - p.lat}
                r={(p === pin ? 3.2 : 2.2) / zoom}
                className={p === pin ? "current" : ""}
              >
                <title>{p.label}</title>
              </circle>
            ))}
          </svg>
          <div className="atlas-mini-toolbar">
            <label>
              {t("Local")}{" "}
              <select
                value={pin.id}
                onChange={(e) => set("pin", e.target.value)}
              >
                {b.pins.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={zoom === 1}
              onClick={() => set("zoom", String(zoom / 2))}
              aria-label={t("Diminuir zoom")}
            >
              −
            </button>
            <output>{zoom}×</output>
            <button
              disabled={zoom === 8}
              onClick={() => set("zoom", String(zoom * 2))}
              aria-label={t("Aumentar zoom")}
            >
              +
            </button>
          </div>
          <p>
            {pin.label} · {pin.detail} ({pin.lat}°, {pin.lon}°)
          </p>
          <CanvasLink
            href={mapUrl(pin.lat, pin.lon)}
            target="_blank"
            rel="noreferrer"
          >
            {t("Abrir no OpenStreetMap")}
          </CanvasLink>
          <small>{t("Base cartográfica · Natural Earth")}</small>
        </div>
      );
    }
    case "places": {
      const q = (v.query ?? "").toLocaleLowerCase(intlLocale());
      const filtered = b.places.filter((p) =>
        [p.label, p.address, p.category, p.detail]
          .join(" ")
          .toLocaleLowerCase(intlLocale())
          .includes(q),
      );
      return (
        <div className="atlas-directory">
          <label>
            {t("Pesquisar locais")}{" "}
            <input
              type="search"
              value={v.query ?? ""}
              maxLength={160}
              onChange={(e) => set("query", e.target.value)}
            />
          </label>
          <ul>
            {filtered.map((p) => (
              <li key={p.id}>
                <strong>{p.label}</strong>
                <small>{p.category}</small>
                <p>
                  {p.address} · {p.detail}
                </p>
                <CanvasLink
                  href={mapUrl(p.lat, p.lon)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Ver no mapa")}
                </CanvasLink>
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p role="status">{t("Nenhum local encontrado.")}</p>
          )}
        </div>
      );
    }
    case "product": {
      const variant =
        b.variants.find((a) => a.id === v.variant) ?? b.variants[0];
      return (
        <div className="atlas-product">
          <p>{b.description}</p>
          <label>
            {t("Variante")}{" "}
            <select
              value={variant.id}
              onChange={(e) => set("variant", e.target.value)}
            >
              {b.variants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <output>{money(variant.price_cents, b.currency)}</output>
          <span>
            {variant.available === false ? t("Indisponível") : t("Disponível")}
          </span>
          {b.source_url && (
            <CanvasLink
              href={safeMedia(b.source_url)}
              target="_blank"
              rel="noreferrer"
            >
              {t("Consultar oferta")}
            </CanvasLink>
          )}
          {onAction && (
            <button
              onClick={() =>
                onAction(
                  t("Avalie a variante {variant} de {product}.", {
                    variant: variant.label,
                    product: b.title,
                  }),
                )
              }
            >
              {t("Perguntar ao Hermes")}
            </button>
          )}
        </div>
      );
    }
    case "kanban":
      return (
        <div className="atlas-board">
          {b.columns.map((col) => {
            const tasks = b.tasks.filter(
              (task) => (v[task.id] ?? task.column) === col.id,
            );
            return (
              <section key={col.id}>
                <h4>
                  {col.label} <small>{tasks.length}</small>
                </h4>
                {tasks.map((task) => (
                  <div key={task.id}>
                    <strong>{task.label}</strong>
                    <select
                      aria-label={t("Mover {task}", { task: task.label })}
                      value={col.id}
                      onChange={(e) => set(task.id, e.target.value)}
                    >
                      {b.columns.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      );
    case "decision_tree": {
      const path = (v.path ?? b.start).split(",");
      const node = b.nodes.find((n) => n.id === path.at(-1)) ?? b.nodes[0];
      return (
        <div className="atlas-decision">
          <small>{t("Etapa {n}", { n: path.length })}</small>
          <p aria-live="polite">{node.label}</p>
          <div className="atlas-mini-toolbar">
            {node.choices?.map((c, i) => (
              <button
                key={i}
                onClick={() => set("path", [...path, c.target].join(","))}
              >
                {c.label}
              </button>
            ))}
          </div>
          {path.length > 1 && (
            <button onClick={() => set("path", path.slice(0, -1).join(","))}>
              {t("Voltar uma etapa")}
            </button>
          )}
        </div>
      );
    }
    case "budget_planner": {
      const qty = (item: (typeof b.items)[number]) =>
        Number(v[item.id] ?? item.quantity ?? 1);
      const total = b.items.reduce(
        (s, item) => s + qty(item) * item.price_cents,
        0,
      );
      return (
        <div className="atlas-budget">
          {b.items.map((item) => (
            <label key={item.id}>
              <span>
                {item.label}
                <small>
                  {t("{price} / unidade", {
                    price: money(item.price_cents, b.currency),
                  })}
                </small>
              </span>
              <input
                aria-label={t("Quantidade de {item}", { item: item.label })}
                type="number"
                min="0"
                max="999"
                step="1"
                value={qty(item)}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (Number.isInteger(n) && n >= 0 && n <= 999)
                    set(item.id, String(n));
                }}
              />
            </label>
          ))}
          <div aria-live="polite">
            <strong>
              {t("Total {amount}", { amount: money(total, b.currency) })}
            </strong>
            <p>
              {total > b.limit_cents
                ? t("Acima do limite")
                : t("Saldo disponível")}{" "}
              · {money(Math.abs(b.limit_cents - total), b.currency)}
            </p>
          </div>
        </div>
      );
    }
  }
}
