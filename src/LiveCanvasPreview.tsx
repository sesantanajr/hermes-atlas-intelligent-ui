import React from "react";
import { Canvas } from "./Canvas";
import { PreviewContext } from "./CanvasLink";
import type { Canvas as CanvasData } from "./types";
import "./live-preview.css";

export function LiveCanvasPreview({ canvas }: { canvas?: CanvasData | null }) {
  if (!canvas?.blocks.length) return null;
  return (
    <section className="atlas-live-preview" aria-label="Prévia do canvas">
      <div className="atlas-live-preview-heading">
        <strong>{canvas.title}</strong>
        <span>Gerando canvas…</span>
      </div>
      <fieldset disabled aria-label="Prévia dos blocos recebidos">
        <PreviewContext.Provider value={true}>
          <Canvas canvas={canvas} />
        </PreviewContext.Provider>
      </fieldset>
    </section>
  );
}
