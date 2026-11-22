// @vitest-environment jsdom
import React, { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ControlView, isControlBlock } from "./controls";
import type { ControlBlock } from "./controls";
import { controlSamples } from "./controlSamples";
import type { Interaction } from "../types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function mount(type: ControlBlock["type"], initial: Interaction = {}) {
  const block = controlSamples.find((block) => block.type === type)!;
  const action = vi.fn();
  let saved = "";
  function Host({ seed }: { seed: Interaction }) {
    const [state, update] = useState(seed);
    return (
      <ControlView
        block={block}
        state={state}
        onAction={action}
        change={(patch) => {
          const next = { ...state, ...patch };
          saved = JSON.stringify(next);
          update(next);
        }}
      />
    );
  }
  const app = render(<Host seed={initial} />);
  return {
    block,
    action,
    saved: () => saved,
    reopen: () => {
      app.unmount();
      render(<Host seed={JSON.parse(saved)} />);
    },
  };
}
const draft = () =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: "Usar resposta no chat",
  });

it("exposes a distinct sample and renderer for every control discriminator", () => {
  expect(new Set(controlSamples.map((b) => b.type)).size).toBe(15);
  for (const block of controlSamples) {
    expect(isControlBlock(block)).toBe(true);
    const app = render(
      <ControlView block={block} state={{}} change={vi.fn()} />,
    );
    expect(
      app.container.querySelector("input, button, select, textarea"),
    ).toBeTruthy();
    app.unmount();
  }
  expect(isControlBlock({ type: "constructor" })).toBe(false);
});

it.each(["short_answer", "long_answer"] as const)(
  "restores %s and prepares the draft only on demand",
  (type) => {
    const app = mount(type);
    expect(draft().disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Chegar cedo" },
    });
    expect(app.action).not.toHaveBeenCalled();
    app.reopen();
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe(
      "Chegar cedo",
    );
    fireEvent.click(draft());
    expect(app.action).toHaveBeenCalledWith(app.block.title + "\nChegar cedo");
  },
);

it("checks numeric bounds while composing and adds the unit to a draft", () => {
  const app = mount("number_input");
  const field = screen.getByRole("spinbutton");
  fireEvent.change(field, { target: { value: "501" } });
  expect(draft().disabled).toBe(true);
  fireEvent.change(field, { target: { value: "4.5" } });
  fireEvent.click(draft());
  expect(app.action.mock.calls[0][0]).toContain("4.5 km");
});

it("round-trips a date selection and rejects an inverted range until repaired", () => {
  const date = mount("date_picker");
  fireEvent.change(screen.getByLabelText(date.block.title), {
    target: { value: "2027-04-01" },
  });
  date.reopen();
  expect(screen.getByLabelText<HTMLInputElement>(date.block.title).value).toBe(
    "2027-04-01",
  );
  cleanup();
  const app = mount("date_range");
  fireEvent.change(screen.getByLabelText("Data inicial"), {
    target: { value: "2027-06-01" },
  });
  fireEvent.change(screen.getByLabelText("Data final"), {
    target: { value: "2027-05-01" },
  });
  expect(draft().disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Data final"), {
    target: { value: "2027-06-05" },
  });
  app.reopen();
  fireEvent.click(draft());
  expect(app.action.mock.calls[0][0]).toContain("2027-06-01 – 2027-06-05");
});

it("changes dropdown and segmented selection and shows the active detail", () => {
  mount("single_choice");
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "train" },
  });
  expect(screen.getByText("Chegada à estação central")).toBeTruthy();
  cleanup();
  mount("segmented");
  fireEvent.click(screen.getByRole("radio", { name: "Intenso" }));
  expect(screen.getByText("Combine várias paradas por dia.")).toBeTruthy();
});

it("allows independent selections and restores grouped task progress", () => {
  const multi = mount("multi_choice");
  fireEvent.click(screen.getByRole("checkbox", { name: "Gastronomia" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "História" }));
  multi.reopen();
  fireEvent.click(draft());
  expect(multi.action.mock.calls[0][0]).toContain("Gastronomia, História");
  cleanup();
  const app = mount("checklist_group");
  fireEvent.click(screen.getByRole("checkbox", { name: "Bilhete" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Garrafa de água" }));
  app.reopen();
  expect(screen.getByRole<HTMLProgressElement>("progressbar").value).toBe(2);
  expect(
    screen.getByRole<HTMLInputElement>("checkbox", { name: "Identidade" })
      .checked,
  ).toBe(false);
});

it("restores switch, stepped slider, and clearable star rating", () => {
  const toggle = mount("toggle");
  fireEvent.click(screen.getByRole("switch"));
  toggle.reopen();
  expect(screen.getByRole<HTMLInputElement>("switch").checked).toBe(false);
  cleanup();
  const slider = mount("slider");
  fireEvent.change(screen.getByRole("slider"), { target: { value: "75" } });
  slider.reopen();
  expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe(
    "75 min",
  );
  cleanup();
  const rating = mount("rating");
  fireEvent.click(screen.getByRole("radio", { name: "4 de 5" }));
  rating.reopen();
  expect(
    screen.getByRole<HTMLInputElement>("radio", { name: "4 de 5" }).checked,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Limpar avaliação" }));
  expect(draft().disabled).toBe(true);
});

it("confirms, restores and revises a personal poll vote", () => {
  const app = mount("poll");
  fireEvent.click(screen.getByRole("radio", { name: "Mercado municipal" }));
  expect(draft().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Registrar meu voto" }));
  app.reopen();
  expect(screen.getByRole("status").textContent).toContain(
    "Seu voto: Mercado municipal",
  );
  fireEvent.click(screen.getByRole("button", { name: "Alterar voto" }));
  fireEvent.click(screen.getByRole("radio", { name: "Parque da cidade" }));
  fireEvent.click(screen.getByRole("button", { name: "Registrar meu voto" }));
  expect(screen.getByRole("status").textContent).toContain("Parque da cidade");
  expect(app.action).not.toHaveBeenCalled();
});

it("grades locally and preserves the result on reopen, with a fresh retry", () => {
  const app = mount("quiz");
  fireEvent.click(screen.getByRole("radio", { name: "Mapa" }));
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Corrigir resposta" }));
  app.reopen();
  expect(screen.getByRole("status").textContent).toContain(
    "Resposta incorreta.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  fireEvent.click(screen.getByRole("radio", { name: "Bússola" }));
  fireEvent.click(screen.getByRole("button", { name: "Corrigir resposta" }));
  expect(screen.getByRole("status").textContent).toContain("Resposta correta.");
  expect(app.action).not.toHaveBeenCalled();
});

it("counts down across reloads and preserves remaining time while paused", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));
  const app = mount("timer");
  expect(screen.getByRole("timer").textContent).toBe("05:00");
  fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));
  const saved = app.saved();
  act(() => vi.advanceTimersByTime(2000));
  expect(app.saved()).toBe(saved);
  expect(screen.getByRole("timer").textContent).toBe("04:58");
  fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
  act(() => vi.advanceTimersByTime(3000));
  app.reopen();
  expect(screen.getByRole("timer").textContent).toBe("04:58");
  fireEvent.click(screen.getByRole("button", { name: "Retomar" }));
  act(() => vi.advanceTimersByTime(298000));
  expect(screen.getByRole("status").textContent).toBe("Tempo esgotado");
  fireEvent.click(screen.getByRole("button", { name: "Reiniciar" }));
  expect(screen.getByRole("timer").textContent).toBe("05:00");
  fireEvent.click(screen.getByRole("button", { name: "Redefinir" }));
  expect(screen.getByRole("status").textContent).toBe("Pronto");
});
