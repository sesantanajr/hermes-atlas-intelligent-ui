// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudyView } from "./study";
import type { FlashcardsBlock, StudyInteraction } from "./study";

afterEach(cleanup);
const block: FlashcardsBlock = {
  type: "flashcards",
  id: "review",
  title: "Óptica",
  items: [
    {
      id: "a",
      question: "O que é refração?",
      answer: "Mudança de propagação entre meios.",
    },
    {
      id: "b",
      question: "O que é reflexão?",
      answer: "Retorno da luz ao meio inicial.",
    },
  ],
};

it("restores the selected question and progress from JSON, with the answer hidden again", () => {
  const action = vi.fn();
  let saved = "";
  function App({ initial }: { initial: StudyInteraction }) {
    const [state, setState] = useState(initial);
    return (
      <StudyView
        block={block}
        state={state}
        change={(patch) => {
          const next = { ...state, ...patch };
          saved = JSON.stringify(next);
          setState(next);
        }}
        onAction={action}
      />
    );
  }
  const app = render(<App initial={{}} />);
  expect(screen.queryByText(block.items[0].answer)).toBeNull();
  expect(screen.queryByRole("button", { name: "Explorar no chat" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Próximo cartão" }));
  fireEvent.click(screen.getByRole("button", { name: "Revelar resposta" }));
  expect(screen.getByText(block.items[1].answer)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Explorar no chat" }));
  expect(action.mock.calls[0][0]).toContain(block.items[1].answer);
  fireEvent.click(
    screen.getByRole("button", { name: "Marcar como conhecido" }),
  );
  expect(JSON.parse(saved)).toEqual({ active_item: "b", known_ids: ["b"] });
  app.unmount();
  render(<App initial={JSON.parse(saved)} />);
  expect(
    screen.getByRole("heading", { name: block.items[1].question }),
  ).toBeTruthy();
  expect(screen.queryByText(block.items[1].answer)).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("1 de 2 conhecidos");
  fireEvent.click(screen.getByRole("button", { name: "Revelar resposta" }));
  fireEvent.click(screen.getByRole("button", { name: "Voltar a praticar" }));
  expect(screen.getByRole("status").textContent).toContain("0 de 2 conhecidos");
});

it("advances through pending cards and offers a way back after the last one", () => {
  function App() {
    const [state, setState] = useState<StudyInteraction>({ active_item: "a" });
    return (
      <StudyView
        block={block}
        state={state}
        change={(patch) => setState({ ...state, ...patch })}
      />
    );
  }
  render(<App />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Apenas pendentes" }));
  fireEvent.click(screen.getByRole("button", { name: "Revelar resposta" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Marcar como conhecido" }),
  );
  expect(
    screen.getByRole("heading", { name: block.items[1].question }),
  ).toBeTruthy();
  expect(screen.queryByText(block.items[1].answer)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Revelar resposta" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Marcar como conhecido" }),
  );
  expect(screen.getByRole("status").textContent).toContain("2 de 2 conhecidos");
  fireEvent.click(
    screen.getByRole("button", { name: "Rever todos os cartões" }),
  );
  expect(
    screen.getByRole("heading", { name: block.items[1].question }),
  ).toBeTruthy();
  expect(screen.queryByText(block.items[1].answer)).toBeNull();
});
