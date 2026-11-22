/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { catalog, categories } from "../blocks/catalogData";
import { en } from "./en";
import { enBlocks } from "./en.blocks";

// The blocks' own source, read as text: every `t("…")` and `msg("…")` in it is a string a block
// can show.
const sources = import.meta.glob("../blocks/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const isTest = (path: string) => /\.test\.tsx?$/.test(path);
// Sample content, written in Portuguese on purpose: it is what a canvas holds, not interface text.
const isSampleData = (path: string) =>
  /(?:Samples|[/\\](?:examples|studioExamples|catalogData|worldLand))\.ts$/.test(path);

const CALL =
  /(?<![\w$.])(?:t|msg)\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.)*`)/g;

function usedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const [path, source] of Object.entries(sources)) {
    if (isTest(path)) continue;
    for (const match of source.matchAll(CALL))
      keys.add(new Function(`return ${match[1]}`)() as string);
  }
  return keys;
}

describe("English coverage of the canvas blocks", () => {
  const used = usedKeys();
  // BlockCatalog.tsx translates these as it renders them; they are written in catalogData.ts.
  const catalogue = new Set([...categories, ...catalog.map((entry) => entry.label)]);

  it("finds the blocks' strings", () => {
    expect(Object.keys(sources).filter((path) => !isTest(path)).length).toBeGreaterThan(20);
    expect(used.size).toBeGreaterThan(200);
    expect(used.has("Filtrar linhas...")).toBe(true);
    expect(used.has("{n} de {total} concluídos")).toBe(true);
    expect(used.has("Prevista")).toBe(true); // marked with msg()
  });

  it("translates every string a block shows", () => {
    expect([...used].filter((key) => !Object.hasOwn(enBlocks, key))).toEqual([]);
  });

  it("names the catalogue's categories and blocks as catalogData does in English", () => {
    expect(catalogue.size).toBe(categories.length + catalog.length);
    for (const entry of catalog) {
      expect(enBlocks[entry.label], entry.label).toBe(entry.label_en);
      expect(enBlocks[entry.category], entry.category).toBe(entry.category_en);
    }
  });

  it("keeps no translation for a string that is gone", () => {
    const gone = Object.keys(enBlocks).filter((key) => !used.has(key) && !catalogue.has(key));
    expect(gone).toEqual([]);
  });

  it("keeps the placeholders of every string", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [source, translation] of Object.entries(enBlocks))
      expect(names(translation), source).toEqual(names(source));
  });

  it("leaves no translation empty or identical by accident", () => {
    const same = new Set(["Total", "Total {amount}", "Final", "Item", "{n} item", "Volume"]);
    for (const [source, translation] of Object.entries(enBlocks)) {
      expect(translation.trim(), source).not.toBe("");
      if (!same.has(source)) expect(translation, source).not.toBe(source);
    }
  });

  it("says the same as the shell where both tables translate a string", () => {
    // index.ts lets ./en.ts win, so a different wording here would never be shown.
    for (const [source, translation] of Object.entries(enBlocks))
      if (Object.hasOwn(en, source)) expect(translation, source).toBe(en[source]);
  });
});

describe("locale of the canvas blocks", () => {
  it("is never fixed in a renderer: numbers, sorting and case follow intlLocale()", () => {
    const fixed = Object.entries(sources)
      .filter(([path]) => !isTest(path) && !isSampleData(path))
      .filter(([, source]) => /(["'`])pt-BR\1/.test(source))
      .map(([path]) => path);
    expect(fixed).toEqual([]);
  });
});
