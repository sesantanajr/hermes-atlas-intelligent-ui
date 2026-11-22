// @vitest-environment jsdom
/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { enServer } from "./en.server";
import { detectLocale, msg, normalizeLocale, serverText, setLocale, t } from "./index";

// The shell's own source, read as text: every `t("…")` and `msg("…")` in it is a string the
// interface can show.
const sources = import.meta.glob(["../app/**/*.{ts,tsx}", "../host/**/*.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const CALL =
  /(?<![\w$.])(?:t|msg)\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.)*`)/g;

function usedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const [path, source] of Object.entries(sources)) {
    if (/\.test\.|\.d\.ts$/.test(path)) continue;
    for (const match of source.matchAll(CALL))
      keys.add(new Function(`return ${match[1]}`)() as string);
  }
  return keys;
}

afterEach(() => setLocale("pt-BR"));

describe("English coverage of the shell", () => {
  const used = usedKeys();

  it("finds the shell's strings", () => {
    expect(used.size).toBeGreaterThan(200);
    expect(used.has("Salvar versão")).toBe(true);
    expect(used.has("Tempo limite atingido")).toBe(true); // marked with msg()
  });

  it("translates every string the shell shows", () => {
    expect([...used].filter((key) => !(key in en))).toEqual([]);
  });

  it("keeps no translation for a string that is gone", () => {
    expect(Object.keys(en).filter((key) => !used.has(key))).toEqual([]);
  });

  it("keeps the placeholders of every string", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [source, translation] of Object.entries({ ...en, ...enServer }))
      expect(names(translation), source).toEqual(names(source));
  });

  it("leaves no translation empty or identical by accident", () => {
    const same = new Set(["tokens", "Terminal", "Interface"]);
    for (const [source, translation] of Object.entries(en)) {
      expect(translation.trim(), source).not.toBe("");
      if (!same.has(source)) expect(translation, source).not.toBe(source);
    }
  });
});

describe("t()", () => {
  it("returns the Portuguese source by default and English once switched", () => {
    expect(t("Salvar versão")).toBe("Salvar versão");
    setLocale("en");
    expect(t("Salvar versão")).toBe("Save version");
    expect(t("Versão {n}", { n: 3 })).toBe("Version 3");
    expect(t(msg("Tempo limite atingido"))).toBe("Timed out");
  });

  it("falls back to Portuguese for a string nobody translated", () => {
    setLocale("en");
    expect(t("Texto ainda sem tradução")).toBe("Texto ainda sem tradução");
  });

  it("fills placeholders in Portuguese too, leaving unknown ones alone", () => {
    expect(t("Versão {n} de {total}", { n: 2 })).toBe("Versão 2 de {total}");
  });
});

describe("serverText()", () => {
  it("translates what the server wrote, exactly or by pattern", () => {
    expect(serverText("Canvas não encontrado.")).toBe("Canvas não encontrado.");
    setLocale("en");
    expect(serverText("Canvas não encontrado.")).toBe("Canvas not found.");
    expect(serverText("Hermes recusou a operação (HTTP 403).")).toBe(
      "Hermes refused the operation (HTTP 403).",
    );
  });

  it("returns text it does not know unchanged", () => {
    setLocale("en");
    expect(serverText("upstream said: quota exceeded")).toBe("upstream said: quota exceeded");
    expect(serverText("")).toBe("");
  });
});

describe("locale detection", () => {
  it("normalises language tags to the two supported locales", () => {
    expect(normalizeLocale("en-GB")).toBe("en");
    expect(normalizeLocale("EN")).toBe("en");
    expect(normalizeLocale("pt-PT")).toBe("pt-BR");
    expect(normalizeLocale(undefined)).toBe("pt-BR");
  });

  it("prefers an explicit choice, then the page language", () => {
    expect(detectLocale("en")).toBe("en");
    const previous = document.documentElement.lang;
    document.documentElement.lang = "en-US";
    expect(detectLocale("auto")).toBe("en");
    expect(detectLocale("pt-BR")).toBe("pt-BR");
    document.documentElement.lang = previous;
  });
});
