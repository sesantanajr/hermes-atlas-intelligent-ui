import type { ControlBlock } from "./controls";

export const controlSamples: ControlBlock[] = [
  {
    type: "short_answer",
    id: "stop",
    title: "Qual é a próxima parada?",
    placeholder: "Nome do lugar",
  },
  {
    type: "long_answer",
    id: "observations",
    title: "Anotações de campo",
    placeholder: "Registre o que encontramos no percurso…",
  },
  {
    type: "number_input",
    id: "distance",
    title: "Distância planejada",
    min: 0,
    max: 500,
    unit: "km",
  },
  { type: "date_picker", id: "departure", title: "Data da partida" },
  { type: "date_range", id: "stay", title: "Período da estadia" },
  {
    type: "single_choice",
    id: "transport",
    title: "Como vamos chegar?",
    options: [
      { id: "train", label: "Trem", detail: "Chegada à estação central" },
      { id: "bus", label: "Ônibus", detail: "Chegada ao terminal rodoviário" },
    ],
  },
  {
    type: "multi_choice",
    id: "interests",
    title: "O que você quer explorar?",
    options: [
      { id: "food", label: "Gastronomia" },
      { id: "history", label: "História" },
      { id: "nature", label: "Natureza" },
    ],
  },
  {
    type: "toggle",
    id: "accessible",
    title: "Priorizar percursos acessíveis",
    initial: true,
  },
  {
    type: "slider",
    id: "pace",
    title: "Tempo diário de caminhada",
    min: 15,
    max: 120,
    step: 15,
    initial: 45,
    unit: "min",
  },
  { type: "rating", id: "experience", title: "Como foi o percurso?", stars: 5 },
  {
    type: "segmented",
    id: "route",
    title: "Ritmo da viagem",
    options: [
      {
        id: "calm",
        label: "Tranquilo",
        detail: "Uma atividade principal por dia.",
      },
      {
        id: "active",
        label: "Intenso",
        detail: "Combine várias paradas por dia.",
      },
    ],
  },
  {
    type: "checklist_group",
    id: "packing",
    title: "Preparação da mochila",
    groups: [
      {
        id: "documents",
        label: "Documentos",
        tasks: [
          { id: "ticket", label: "Bilhete" },
          { id: "identity", label: "Identidade" },
        ],
      },
      {
        id: "gear",
        label: "Equipamento",
        tasks: [{ id: "bottle", label: "Garrafa de água" }],
      },
    ],
  },
  {
    type: "poll",
    id: "afternoon",
    title: "Qual passeio você prefere?",
    options: [
      { id: "market", label: "Mercado municipal" },
      { id: "park", label: "Parque da cidade" },
    ],
  },
  {
    type: "quiz",
    id: "navigation",
    title: "Teste de orientação",
    question: "Qual instrumento aponta para o norte magnético?",
    options: [
      { id: "map", label: "Mapa" },
      { id: "compass", label: "Bússola" },
    ],
    answer_id: "compass",
    explanation:
      "A agulha imantada da bússola se alinha ao campo magnético local.",
  },
  { type: "timer", id: "break", title: "Pausa para hidratação", seconds: 300 },
];
