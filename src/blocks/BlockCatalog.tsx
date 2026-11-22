import React, { useState } from "react";
import { ArrowUpRight, Plus, Search, Layers } from "lucide-react";
import { catalog, categories, normalize } from "./catalogData";
import { Canvas } from "./Canvas";
import type { Block, Interaction, Canvas as CanvasData } from "../types";
import { t } from "../i18n";
import "./catalog.css";
export function BlockCatalog({
  onAdd,
  disabled,
}: {
  onAdd: (block: Block, state?: Interaction) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [active, setActive] = useState<Block["type"] | null>(null);
  const [demo, setDemo] = useState<CanvasData | null>(null);
  // catalogData keeps labels and categories in Portuguese: they are the keys,
  // translated here as they are shown.
  const results = catalog.filter(
    (e) =>
      (!category || e.category === category) &&
      normalize([t(e.label), e.type, e.example.title].join(" ")).includes(
        normalize(query.trim()),
      ),
  );
  const pick = (entry: (typeof catalog)[number]) => {
    setActive(entry.type);
    setDemo({
      id: "preview-" + entry.type,
      title: entry.label,
      schema_version: "1.0",
      description: "",
      blocks: [structuredClone(entry.example)],
    });
  };
  return (
    <div className="block-catalog">
      <header>
        <Layers size={25} />
        <h1>{t("Catálogo de blocos")}</h1>
        <p>
          {t("Experimente os {n} blocos e combine-os no seu canvas.", {
            n: catalog.length,
          })}
        </p>
      </header>
      <div className="catalog-filters">
        <label>
          <Search size={17} />
          <input
            type="search"
            aria-label={t("Pesquisar blocos")}
            placeholder={t("Buscar por nome, exemplo ou tipo…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {/* An option's value is its visible text: map what was picked back to
            the category it translates. */}
        <select
          aria-label={t("Categoria de blocos")}
          value={category && t(category)}
          onChange={(e) =>
            setCategory(categories.find((c) => t(c) === e.target.value) ?? "")
          }
        >
          <option value="">{t("Todas as categorias")}</option>
          {categories.map((c) => (
            <option key={c}>{t(c)}</option>
          ))}
        </select>
      </div>
      <p role="status">
        {results.length === 1
          ? t("{n} bloco encontrado", { n: results.length })
          : t("{n} blocos encontrados", { n: results.length })}
      </p>
      {categories.map((c) => {
        const entries = results.filter((e) => e.category === c);
        if (!entries.length) return null;
        return (
          <section key={c} className="catalog-section">
            <h2>{t(c)}</h2>
            {entries.map((e) => (
              <div className="catalog-item" key={e.type}>
                <div className="catalog-row">
                  <div>
                    <strong>{t(e.label)}</strong>
                    <small>{e.example.title}</small>
                  </div>
                  <button
                    aria-label={t("Experimentar {label}", {
                      label: t(e.label),
                    })}
                    aria-expanded={active === e.type}
                    onClick={() =>
                      active === e.type ? setActive(null) : pick(e)
                    }
                  >
                    <ArrowUpRight size={16} /> {t("Experimentar")}
                  </button>
                </div>
                {active === e.type && demo && (
                  <div className="catalog-demo">
                    <Canvas canvas={demo} onChange={setDemo} />
                    <button
                      className="primary"
                      disabled={disabled}
                      onClick={() =>
                        onAdd(demo.blocks[0], demo.state?.[demo.blocks[0].id])
                      }
                    >
                      <Plus size={14} /> {t("Adicionar ao canvas")}
                    </button>
                    {disabled && (
                      <small>
                        {t(
                          "Disponível com o agente em repouso e até 31 blocos no canvas.",
                        )}
                      </small>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
      {!results.length && <p>{t("Tente outro termo ou outra categoria.")}</p>}
    </div>
  );
}
