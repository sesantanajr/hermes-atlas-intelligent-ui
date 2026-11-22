import React, { useId, useRef } from "react";
import { Check, MessageSquarePlus } from "lucide-react";
import type {
  ExploreBlock,
  ExploreInteraction,
  TimelineItem,
  TimelineStatus,
} from "./exploreTypes";
import { msg, t } from "../i18n";
import "./explore.css";

// Portuguese source strings, marked with `msg()`; `t()` translates them where
// they are rendered.
const statusLabels: Record<TimelineStatus, string> = {
  done: msg("Concluída"),
  current: msg("Em andamento"),
  upcoming: msg("Prevista"),
};

type Props = {
  block: ExploreBlock;
  state: ExploreInteraction;
  change: (patch: ExploreInteraction) => void;
  onAction?: (text: string) => void;
};

function draftForItem(block: ExploreBlock, item: TimelineItem) {
  const names = { item: item.title, block: block.title };
  const request =
    block.type === "timeline"
      ? t("Detalhe a etapa “{item}” do bloco “{block}”.", names)
      : t("Detalhe a seção “{item}” do bloco “{block}”.", names);
  const status = item.status && t(statusLabels[item.status]);
  const heading = [item.when, status].filter(Boolean).join(" · ");
  const points = item.points?.map((point) => `• ${point}`).join("\n");
  return [request, heading, item.body, points].filter(Boolean).join("\n\n");
}

export function ExploreView({ block, state, change, onAction }: Props) {
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const timeline = block.type === "timeline";
  const initial = timeline
    ? block.items.find((item) => item.status === "current")
    : undefined;
  const active =
    block.items.find((item) => item.id === state.active_item) ??
    initial ??
    block.items[0];

  function navigate(event: React.KeyboardEvent, index: number) {
    const previousKey = timeline ? "ArrowUp" : "ArrowLeft";
    const nextKey = timeline ? "ArrowDown" : "ArrowRight";
    const length = block.items.length;
    let next = index;
    switch (event.key) {
      case "Home":
        next = 0;
        break;
      case "End":
        next = length - 1;
        break;
      case previousKey:
        next = (index + length - 1) % length;
        break;
      case nextKey:
        next = (index + 1) % length;
        break;
      default:
        return;
    }
    event.preventDefault();
    change({ active_item: block.items[next].id });
    buttons.current[next]?.focus();
  }

  return (
    <div className={`explore-view explore-${block.type}`}>
      <div
        className="explore-rail"
        role="tablist"
        aria-label={block.title}
        aria-orientation={timeline ? "vertical" : "horizontal"}
      >
        {block.items.map((item: TimelineItem, index) => (
          <button
            type="button"
            role="tab"
            className="explore-tab"
            key={item.id}
            id={`${prefix}-tab-${item.id}`}
            aria-controls={`${prefix}-panel-${item.id}`}
            aria-selected={active.id === item.id}
            tabIndex={active.id === item.id ? 0 : -1}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            onClick={() => change({ active_item: item.id })}
            onKeyDown={(event) => navigate(event, index)}
          >
            {timeline && (
              <span
                className="explore-marker"
                data-status={item.status}
                aria-hidden="true"
              >
                {item.status === "done" && <Check size={12} strokeWidth={3} />}
              </span>
            )}
            <span className="explore-tab-label">
              <span>{item.title}</span>
              {timeline && (item.when || item.status) && (
                <small>
                  {[item.when, item.status && t(statusLabels[item.status])]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              )}
            </span>
          </button>
        ))}
      </div>
      {block.items.map((item: TimelineItem) => (
        <section
          className="explore-panel"
          key={item.id}
          id={`${prefix}-panel-${item.id}`}
          aria-labelledby={`${prefix}-tab-${item.id}`}
          role="tabpanel"
          tabIndex={0}
          hidden={active.id !== item.id}
        >
          {active.id === item.id && (
            <>
              {timeline && <h4>{item.title}</h4>}
              <p>{item.body}</p>
              {!!item.points?.length && (
                <ul>
                  {item.points.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              )}
              {onAction && (
                <button
                  type="button"
                  className="explore-followup"
                  onClick={() => onAction(draftForItem(block, item))}
                >
                  <MessageSquarePlus size={15} aria-hidden="true" />
                  {timeline
                    ? t("Explorar etapa no chat")
                    : t("Explorar seção no chat")}
                </button>
              )}
            </>
          )}
        </section>
      ))}
    </div>
  );
}
