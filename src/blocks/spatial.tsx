import React, { useState } from "react";
import { ArrowUpRight, MessageSquarePlus } from "lucide-react";
import camera from "./camera.webp";
import { CanvasLink } from "./CanvasLink";
import { t } from "../i18n";
import "./spatial.css";

type Detail = { id: string; title: string; body: string };
type Part = Detail & { x: number; y: number };
type Stop = Detail & { lat: number; lon: number };
export type SpatialBlock =
  | {
      type: "diagram";
      id: string;
      title: string;
      alt: string;
      illustration?: "camera" | null;
      image_url?: string | null;
      items: Part[];
    }
  | { type: "route"; id: string; title: string; items: Stop[] };
type Point = { x: number; y: number };

// Use the nearest wrap at the date line. One coordinate unit on the plot
// occupies the same distance on both axes in its 2:1 viewport.
export function projectStops(stops: Stop[]): Point[] {
  const meanLat = stops.reduce((sum, p) => sum + p.lat, 0) / stops.length;
  const factor = Math.max(0.01, Math.cos((meanLat * Math.PI) / 180));
  let longitude = stops[0].lon;
  const coords = stops.map((p, i) => {
    if (i) longitude += ((p.lon - stops[i - 1].lon + 540) % 360) - 180;
    return { x: longitude * factor, y: -p.lat };
  });
  const xs = coords.map((p) => p.x),
    ys = coords.map((p) => p.y);
  const left = Math.min(...xs),
    top = Math.min(...ys);
  const width = Math.max(...xs) - left,
    height = Math.max(...ys) - top;
  const scale = Math.min(
    width ? 82 / width : Infinity,
    height ? 34 / height : Infinity,
  );
  const k = Number.isFinite(scale) ? scale : 1;
  return coords.map((p) => ({
    x: 50 + (p.x - left - width / 2) * k,
    y: 50 + (p.y - top - height / 2) * k * 2,
  }));
}

function remoteImage(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function SpatialView({
  block,
  active,
  select,
  onAction,
}: {
  block: SpatialBlock;
  active?: string | null;
  select: (id: string) => void;
  onAction?: (text: string) => void;
}) {
  const [allowedUrl, setAllowedUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  const selected =
    block.items.find((item) => item.id === active) || block.items[0];
  const index = block.items.findIndex((item) => item.id === selected.id);
  const remote = block.type === "diagram" ? remoteImage(block.image_url) : null;
  const src =
    block.type === "diagram" && block.illustration === "camera"
      ? camera
      : remote?.href === allowedUrl
        ? allowedUrl
        : undefined;
  const showImage = src && src !== failedUrl;
  const points =
    block.type === "route" ? projectStops(block.items) : block.items;
  const stop = block.type === "route" ? block.items[index] : null;
  return (
    <div className="atlas-spatial">
      {block.type === "diagram" && remote && !showImage && (
        <button
          type="button"
          className="spatial-load"
          onClick={() => {
            setAllowedUrl(remote.href);
            setFailedUrl("");
          }}
        >
          {failedUrl === remote.href
            ? t("Tentar carregar novamente")
            : t("Carregar imagem")}{" "}
          · {remote.hostname}
        </button>
      )}
      <div
        className={`spatial-stage ${showImage ? "with-image" : "spatial-grid"}`}
      >
        {block.type === "diagram" && showImage && (
          <img
            src={src}
            alt={block.alt}
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(src)}
          />
        )}
        {block.type === "route" && (
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {points.map((p, i) => (
          <button
            type="button"
            key={block.items[i].id}
            className="spatial-pin"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
            }}
            aria-label={`${i + 1}. ${block.items[i].title}`}
            aria-pressed={i === index}
            onClick={() => select(block.items[i].id)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {block.type === "route" ? (
        <small>{t("Traçado esquemático das paradas · norte acima")}</small>
      ) : (
        !showImage && <small>{block.alt}</small>
      )}
      <label className="spatial-picker">
        {block.type === "route" ? t("Parada") : t("Parte")}
        <select value={selected.id} onChange={(e) => select(e.target.value)}>
          {block.items.map((item, i) => (
            <option key={item.id} value={item.id}>
              {i + 1}. {item.title}
            </option>
          ))}
        </select>
      </label>
      <div className="spatial-detail" aria-live="polite">
        <h4>{selected.title}</h4>
        <p>{selected.body}</p>
      </div>
      <div className="spatial-actions">
        {stop && (
          <CanvasLink
            href={`https://www.openstreetmap.org/?mlat=${stop.lat}&mlon=${stop.lon}#map=15/${stop.lat}/${stop.lon}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Ver no mapa")} <ArrowUpRight size={15} />
          </CanvasLink>
        )}
        {onAction && (
          <button
            type="button"
            onClick={() =>
              onAction(
                `${t("Em “{block}”, quero saber mais sobre {item}.", {
                  block: block.title,
                  item: selected.title,
                })}\n${selected.body}`,
              )
            }
          >
            <MessageSquarePlus size={15} />{" "}
            {stop
              ? t("Perguntar sobre a parada")
              : t("Perguntar sobre esta parte")}
          </button>
        )}
      </div>
    </div>
  );
}
