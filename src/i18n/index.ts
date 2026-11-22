/**
 * Interface language.
 *
 * Atlas is written in Brazilian Portuguese and translated from it: `t("Salvar versão")` returns the
 * string itself in pt-BR and its translation in any other language, falling back to Portuguese
 * for a string nobody translated yet. There are no message ids to keep in sync; the Portuguese
 * text in the source is the key.
 *
 * Call `t` while rendering, never at module scope, so a language switch takes effect. The root
 * component subscribes with `useLocale()` and remounts its subtree when the language changes.
 */
import { useSyncExternalStore } from "react";
import { en } from "./en";
import { enBlocks } from "./en.blocks";
import { enServer, enServerPatterns } from "./en.server";

export type Locale = "pt-BR" | "en";
export const locales: { id: Locale; label: string }[] = [
  { id: "pt-BR", label: "Português (Brasil)" },
  { id: "en", label: "English" },
];

const dictionaries: Record<string, Record<string, string>> = {
  en: { ...enServer, ...enBlocks, ...en },
};
const patterns: Record<string, [RegExp, string][]> = { en: enServerPatterns };
const listeners = new Set<() => void>();
let current: Locale = "pt-BR";

/**
 * The supported locale for a language tag: Portuguese (any `pt*`) is pt-BR, every other language
 * English, the closest Atlas has to German, Japanese or Chinese hosts. No tag at all keeps the
 * source language.
 */
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== "string" || !value.trim()) return "pt-BR";
  return value.trim().toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

/** The language to start in: an explicit choice, else the host page's, else the browser's. */
export function detectLocale(explicit?: string | null): Locale {
  if (explicit && explicit !== "auto") return normalizeLocale(explicit);
  if (typeof document !== "undefined") {
    const page = document.documentElement.lang;
    if (page) return normalizeLocale(page);
  }
  if (typeof navigator !== "undefined" && navigator.language)
    return navigator.language.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
  return "pt-BR";
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale) {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Translate a Portuguese source string; `{name}` placeholders are filled from `values`. */
export function t(
  source: string,
  values?: Record<string, string | number>,
): string {
  const text =
    current === "pt-BR" ? source : (dictionaries[current]?.[source] ?? source);
  return values
    ? text.replace(/\{(\w+)\}/g, (whole, name) =>
        name in values ? String(values[name]) : whole,
      )
    : text;
}

/**
 * Mark a Portuguese string for translation without translating it yet: for tables defined at
 * module scope, whose entries reach `t()` later, while rendering. The coverage tests collect
 * `msg("…")` and `t("…")` alike.
 */
export const msg = (source: string): string => source;

/**
 * Translate a message the Atlas server wrote (an error detail, a run warning). The server speaks
 * Portuguese; text it merely relays from Hermes, or that nobody translated, is returned as is.
 */
export function serverText(text: string): string {
  if (current === "pt-BR" || !text) return text;
  const known = dictionaries[current]?.[text];
  if (known) return known;
  for (const [pattern, replacement] of patterns[current] ?? [])
    if (pattern.test(text)) return text.replace(pattern, replacement);
  return text;
}

/** BCP 47 tag for `Intl` formatters and `toLocale*String`. */
export function intlLocale(): string {
  return current === "en" ? "en-US" : "pt-BR";
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits }).format(
    value,
  );
}

/** Strings the active language is missing, for the translation coverage test. */
export function untranslated(
  sources: string[],
  locale: Locale = "en",
): string[] {
  const table = dictionaries[locale] ?? {};
  return sources.filter((source) => !(source in table));
}
