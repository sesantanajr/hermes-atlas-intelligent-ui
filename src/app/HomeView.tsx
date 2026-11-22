import React from "react";
import { BarChart3, ChevronRight, GraduationCap, ListChecks, Sigma } from "lucide-react";
import cameraPhoto from "../blocks/camera.webp";
import { gallery } from "../blocks/examples";
import { msg, t } from "../i18n";
import type { HostKind } from "../host/context";

const starters = [
  {
    icon: <Sigma size={18} />,
    label: msg("Calcular"),
    prompt: msg("Crie uma calculadora para dividir uma conta."),
  },
  {
    icon: <BarChart3 size={18} />,
    label: msg("Explorar dados"),
    prompt:
      msg("Crie um gráfico para comparar duas séries de dados fictícios, com uma medição ausente."),
  },
  {
    icon: <GraduationCap size={18} />,
    label: msg("Estudar"),
    prompt:
      msg("Crie cartões de estudo e uma linha do tempo sobre a história da fotografia."),
  },
  {
    icon: <ListChecks size={18} />,
    label: msg("Escolher itens"),
    prompt: msg("Crie um catálogo de livros fictícios para eu escolher e comparar."),
  },
];

function Thumbnail({ id, index }: { id: string; index: number }) {
  if (id === "demo-camera")
    return <img className="thumb-photo" src={cameraPhoto} alt="" loading="lazy" />;
  if (id === "demo-walk" || index === 1)
    return (
      <svg viewBox="0 0 260 110" className="thumb-lines">
        <path d="M10 88 L85 60 L164 69 L248 23" fill="none" stroke="currentColor" strokeWidth="4" />
        <path d="M10 80 L85 72 L164 37 L248 30" fill="none" stroke="currentColor" strokeDasharray="6 5" strokeWidth="2" opacity=".6" />
      </svg>
    );
  if (index === 0)
    return (
      <div className="thumb-bars">
        {[40, 64, 90, 56, 76, 44, 68].map((height, i) => (
          <i style={{ height }} key={i} />
        ))}
      </div>
    );
  if (index === 3)
    return (
      <div className="thumb-tags">
        {[t("Crônicas"), t("Ensaios"), t("Poesia")].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    );
  return (
    <div className="thumb-compare">
      {[0, 1].map((column) => (
        <div key={column}>
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

export function HomeView({
  ready,
  submitting,
  host,
  useStarter,
  openExample,
}: {
  ready: boolean;
  submitting: boolean;
  host: HostKind;
  useStarter: (prompt: string) => void;
  openExample: (index: number) => void;
}) {
  return (
    <div className="welcome">
      <h1>{t("O que vamos explorar?")}</h1>
      <p className="welcome-lead">
        {host === "desktop"
          ? t("Peça ao Hermes em qualquer conversa: o canvas aparece dentro da resposta e fica guardado aqui.")
          : t("Peça algo visual ao Hermes. O canvas fica guardado na sua biblioteca e continua interativo.")}
      </p>
      <div className="suggestions">
        {starters.map((starter) => (
          <button
            key={starter.label}
            disabled={!ready || submitting}
            onClick={() => useStarter(t(starter.prompt))}
          >
            <span aria-hidden="true">{starter.icon}</span>
            <b>{t(starter.label)}</b>
            <small>{t(starter.prompt)}</small>
          </button>
        ))}
      </div>
      <div className="section-heading">
        <h2>{t("Exemplos interativos")}</h2>
      </div>
      <div className="example-grid">
        {gallery.map(({ example, index, caption }) => (
          <button
            className="example"
            key={example.id}
            disabled={!ready || submitting}
            onClick={() => openExample(index)}
          >
            <div className="example-art" aria-hidden="true">
              <Thumbnail id={example.id} index={index} />
            </div>
            <div className="example-caption">
              <span>{caption}</span>
              <ChevronRight size={17} />
            </div>
            <small>{t("Abrir e interagir")}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
