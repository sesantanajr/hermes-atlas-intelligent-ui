import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquarePlus } from "lucide-react";
import "./study.css";

type StudyItem = { id: string; question: string; answer: string };
export type FlashcardsBlock = {
  type: "flashcards";
  id: string;
  title: string;
  items: StudyItem[];
};
export type StudyInteraction = {
  active_item?: string | null;
  known_ids?: string[];
};

type FaceProps = {
  card: StudyItem;
  known: boolean;
  toggleKnown: () => void;
  onAction?: (text: string) => void;
  revealRef: React.Ref<HTMLButtonElement>;
};

function CardFace({
  card,
  known,
  toggleKnown,
  onAction,
  revealRef,
}: FaceProps) {
  const [revealed, setRevealed] = useState(false);
  const answerId = useId();
  return (
    <div className="study-face">
      <h4>{card.question}</h4>
      <button
        className="study-reveal"
        ref={revealRef}
        type="button"
        aria-expanded={revealed}
        aria-controls={answerId}
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? "Ocultar resposta" : "Revelar resposta"}
      </button>
      <div id={answerId} hidden={!revealed}>
        {revealed && (
          <>
            <p className="study-answer">{card.answer}</p>
            <div className="study-actions">
              <button type="button" onClick={toggleKnown}>
                {known ? "Voltar a praticar" : "Marcar como conhecido"}
              </button>
              {onAction && (
                <button
                  type="button"
                  onClick={() =>
                    onAction(
                      `Ajude-me a entender esta pergunta.\n\n${card.question}\n\nResposta do cartão:\n${card.answer}`,
                    )
                  }
                >
                  <MessageSquarePlus size={15} aria-hidden="true" />
                  Explorar no chat
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type Props = {
  block: FlashcardsBlock;
  state: StudyInteraction;
  change: (patch: StudyInteraction) => void;
  onAction?: (text: string) => void;
};

export function StudyView({ block, state, change, onAction }: Props) {
  const [pendingOnly, setPendingOnly] = useState(false);
  const revealOrReview = useRef<HTMLButtonElement>(null);
  const focusAfterAdvance = useRef(false);
  const known = new Set(state.known_ids || []);
  const pending = block.items.filter((item) => !known.has(item.id));
  const deck = pendingOnly ? pending : block.items;
  const index = Math.max(
    0,
    deck.findIndex((item) => item.id === state.active_item),
  );
  const card = deck[index];
  useEffect(() => {
    if (focusAfterAdvance.current) {
      revealOrReview.current?.focus();
      focusAfterAdvance.current = false;
    }
  }, [card?.id]);

  function toggleFilter(value: boolean) {
    setPendingOnly(value);
    if (
      value &&
      pending.length &&
      !pending.some((item) => item.id === card?.id)
    ) {
      change({ active_item: pending[0].id });
    }
  }

  function toggleKnown() {
    const nextKnown = new Set(known);
    if (known.has(card.id)) nextKnown.delete(card.id);
    else nextKnown.add(card.id);
    const nextCard = pendingOnly ? deck[index + 1] || deck[index - 1] : card;
    focusAfterAdvance.current = pendingOnly;
    change({ known_ids: [...nextKnown], active_item: (nextCard || card).id });
  }

  return (
    <div className="study-deck">
      <div className="study-meta">
        <span role="status">
          {block.items.length - pending.length} de {block.items.length}{" "}
          conhecidos
        </span>
        <progress
          aria-label="Cartões conhecidos"
          value={block.items.length - pending.length}
          max={block.items.length}
        />
        <label>
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(event) => toggleFilter(event.target.checked)}
          />{" "}
          Apenas pendentes
        </label>
      </div>
      {card ? (
        <>
          <div className="study-navigation">
            <span aria-live="polite">
              Cartão {index + 1} de {deck.length}
              {known.has(card.id) ? " · Conhecido" : ""}
            </span>
            <div>
              <button
                type="button"
                aria-label="Cartão anterior"
                disabled={index === 0}
                onClick={() => change({ active_item: deck[index - 1].id })}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Próximo cartão"
                disabled={index + 1 >= deck.length}
                onClick={() => change({ active_item: deck[index + 1].id })}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <CardFace
            key={JSON.stringify([
              block.id,
              card.id,
              card.question,
              card.answer,
            ])}
            card={card}
            known={known.has(card.id)}
            toggleKnown={toggleKnown}
            onAction={onAction}
            revealRef={revealOrReview}
          />
        </>
      ) : (
        <div className="study-complete">
          <p>Todos os cartões estão marcados como conhecidos.</p>
          <button
            ref={revealOrReview}
            type="button"
            onClick={() => toggleFilter(false)}
          >
            Rever todos os cartões
          </button>
        </div>
      )}
    </div>
  );
}
