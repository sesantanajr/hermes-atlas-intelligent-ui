/**
 * The controls on each block of an editable canvas (1.1.2): drag to reorder, half or full width,
 * fold, and a menu with moves, the block's data as CSV and a question to the agent about it.
 *
 * Everything is reachable from the keyboard: the handle moves the block with the arrow keys and
 * the menu repeats every action. Layout changes are kept in the canvas state (`width`,
 * `collapsed`) or in the block order, so the agent sees how the person arranged the canvas.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Columns2,
  Download,
  GripVertical,
  MessageSquarePlus,
  MoreHorizontal,
  RectangleHorizontal,
} from "lucide-react";
import { t } from "../i18n";

export type BlockToolsProps = {
  title: string;
  index: number;
  count: number;
  half: boolean;
  collapsed: boolean;
  onMove: (delta: number) => void;
  onWidth: () => void;
  onCollapse: () => void;
  onCsv?: () => void;
  onAsk?: () => void;
  onDragHandle: (active: boolean) => void;
};

export function BlockTools({
  title,
  index,
  count,
  half,
  collapsed,
  onMove,
  onWidth,
  onCollapse,
  onCsv,
  onAsk,
  onDragHandle,
}: BlockToolsProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const run = (action?: () => void) => () => {
    setOpen(false);
    action?.();
  };
  return (
    <div className="block-tools" data-export-skip role="toolbar" aria-label={t("Ações do bloco {title}", { title })}>
      <button
        className="block-tool grip"
        aria-label={t("Mover bloco {title}: arraste ou use as setas", { title })}
        title={t("Arraste para mover. Com o teclado: setas para cima e para baixo.")}
        onPointerDown={() => onDragHandle(true)}
        onPointerUp={() => onDragHandle(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
            event.preventDefault();
            onMove(-1);
          } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            event.preventDefault();
            onMove(1);
          }
        }}
      >
        <GripVertical size={15} />
      </button>
      <button
        className="block-tool"
        aria-label={half ? t("Usar largura total") : t("Usar meia largura")}
        title={half ? t("Usar largura total") : t("Usar meia largura")}
        onClick={onWidth}
      >
        {half ? <RectangleHorizontal size={15} /> : <Columns2 size={15} />}
      </button>
      <button
        className="block-tool"
        aria-label={collapsed ? t("Expandir bloco") : t("Recolher bloco")}
        aria-expanded={!collapsed}
        title={collapsed ? t("Expandir bloco") : t("Recolher bloco")}
        onClick={onCollapse}
      >
        {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      <div className="block-menu-wrap" ref={menu}>
        <button
          className="block-tool"
          aria-label={t("Mais ações")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <MoreHorizontal size={15} />
        </button>
        {open && (
          <div className="atlas-menu" role="menu">
            <button role="menuitem" disabled={index === 0} onClick={run(() => onMove(-1))}>
              <ArrowUp size={15} /> {t("Mover para cima")}
            </button>
            <button role="menuitem" disabled={index >= count - 1} onClick={run(() => onMove(1))}>
              <ArrowDown size={15} /> {t("Mover para baixo")}
            </button>
            {onCsv && (
              <button role="menuitem" onClick={run(onCsv)}>
                <Download size={15} /> {t("Baixar dados (CSV)")}
              </button>
            )}
            {onAsk && (
              <button role="menuitem" onClick={run(onAsk)}>
                <MessageSquarePlus size={15} /> {t("Perguntar ao Atlas sobre este bloco")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
