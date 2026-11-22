import { useRef, useState } from "react";
import { t } from "../i18n";
import type { Run } from "../types";

type Prompt = NonNullable<Run["pending_controls"]>[number];
type Respond = (
  action: "approval" | "clarify",
  body: object,
) => Promise<boolean>;

export function RunControl({
  prompt,
  respond,
}: {
  prompt: Prompt;
  respond: Respond;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const choices = [...new Set(prompt.choices || [])];
  const chosen = selected.filter((option) => choices.includes(option));
  const answer = chosen.length
    ? prompt.multi_select
      ? JSON.stringify(chosen)
      : chosen[0]
    : custom.trim();
  const tooLong = Array.from(answer).length > 12_000;
  async function submit(
    action: "approval" | "clarify",
    value: { choice: string } | { answer: string },
  ) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    const success = await respond(action, {
      request_id: prompt.prompt_id,
      execution_generation: prompt.execution_generation,
      ...value,
    });
    if (!success) {
      lock.current = false;
      setPending(false);
    }
  }
  if (prompt.kind === "approval") {
    return (
      <section className="approval-card" aria-label={t("Solicitação de aprovação")}>
        <strong>{t("O Hermes solicita aprovação")}</strong>
        {(prompt.description || prompt.prompt) && (
          <p>{prompt.description || prompt.prompt}</p>
        )}
        {prompt.command && (
          <pre aria-label={t("Comando solicitado")}>
            <code>{prompt.command}</code>
          </pre>
        )}
        <div>
          {(["once", "deny"] as const)
            .filter((c) => !prompt.choices || choices.includes(c))
            .map((choice) => (
              <button
                type="button"
                key={choice}
                disabled={pending}
                onClick={() => void submit("approval", { choice })}
              >
                {choice === "once" ? t("Permitir uma vez") : t("Recusar")}
              </button>
            ))}
        </div>
      </section>
    );
  }
  if (prompt.kind !== "clarify") return null;
  return (
    <form
      className="approval-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (answer && !tooLong) void submit("clarify", { answer });
      }}
    >
      <strong>{t("O Hermes precisa de uma resposta")}</strong>
      <fieldset disabled={pending}>
        <legend>
          {prompt.question || prompt.prompt || t("Como deseja continuar?")}
        </legend>
        {choices.length > 0 && (
          <div
            className="clarify-options"
            role="group"
            aria-label={
              prompt.multi_select
                ? t("Escolha uma ou mais opções")
                : t("Escolha uma opção")
            }
          >
            {choices.map((option) => (
              <label key={option}>
                <input
                  type={prompt.multi_select ? "checkbox" : "radio"}
                  name="choice"
                  checked={chosen.includes(option)}
                  onChange={(e) => {
                    setSelected(
                      prompt.multi_select
                        ? e.target.checked
                          ? [...chosen, option]
                          : chosen.filter((c) => c !== option)
                        : [option],
                    );
                    setCustom("");
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        )}
        <label className="clarify-custom">
          {choices.length ? t("Ou escreva sua resposta") : t("Sua resposta")}
          <input
            aria-label={t("Resposta ao Hermes")}
            maxLength={12000}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              if (e.target.value) setSelected([]);
            }}
          />
        </label>
        {tooLong && (
          <p role="alert">{t("A resposta excede o limite de 12.000 caracteres.")}</p>
        )}
        <button type="submit" disabled={!answer || tooLong}>
          {t("Responder")}
        </button>
      </fieldset>
    </form>
  );
}
