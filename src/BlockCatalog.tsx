import React, { useState } from "react";
import { ArrowUpRight, Plus, Search, Layers } from "lucide-react";
import { catalog, categories, normalize } from "./catalogData";
import { Canvas } from "./Canvas";
import type { Block, Interaction, Canvas as CanvasData } from "./types";
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
  const results = catalog.filter(
    (e) =>
      (!category || e.category === category) &&
      normalize([e.label, e.type, e.example.title].join(" ")).includes(
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
        <h1>Catálogo de blocos</h1>
        <p>
          Experimente os {catalog.length} blocos e combine-os no seu canvas.
        </p>
      </header>
      <div className="catalog-filters">
        <label>
          <Search size={17} />
          <input
            type="search"
            aria-label="Pesquisar blocos"
            placeholder="Buscar por nome, exemplo ou tipo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Categoria de blocos"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <p role="status">
        {results.length}{" "}
        {results.length === 1 ? "bloco encontrado" : "blocos encontrados"}
      </p>
      {categories.map((c) => {
        const entries = results.filter((e) => e.category === c);
        if (!entries.length) return null;
        return (
          <section key={c} className="catalog-section">
            <h2>{c}</h2>
            {entries.map((e) => (
              <div className="catalog-item" key={e.type}>
                <div className="catalog-row">
                  <div>
                    <strong>{e.label}</strong>
                    <small>{e.example.title}</small>
                  </div>
                  <button
                    aria-label={"Experimentar " + e.label}
                    aria-expanded={active === e.type}
                    onClick={() =>
                      active === e.type ? setActive(null) : pick(e)
                    }
                  >
                    <ArrowUpRight size={16} /> Experimentar
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
                      <Plus size={14} /> Adicionar ao canvas
                    </button>
                    {disabled && (
                      <small>
                        Disponível com o agente em repouso e até 31 blocos no
                        canvas.
                      </small>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
      {!results.length && <p>Tente outro termo ou outra categoria.</p>}
    </div>
  );
}
