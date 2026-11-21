import type { ExperienceBlock, Photo } from "./experienceBlocks";
const camera: Photo = {
  src: "atlas:camera",
  alt: "Câmera fotográfica em detalhe",
  caption: "Estudo de luz e textura.",
};
const cinema: Photo = {
  src: "atlas:cinema",
  alt: "Composição cinematográfica",
  caption: "Cor e contraste na composição.",
};
const pins = [
  {
    id: "rio",
    label: "Rio de Janeiro",
    lat: -22.907,
    lon: -43.173,
    detail: "Brasil",
  },
  { id: "lisboa", label: "Lisboa", lat: 38.72, lon: -9.14, detail: "Portugal" },
  {
    id: "praia",
    label: "Praia",
    lat: 14.92,
    lon: -23.51,
    detail: "Cabo Verde",
  },
];
export const experienceSamples: ExperienceBlock[] = [
  { type: "image", id: "photo", title: "Luz de estúdio", photo: camera },
  {
    type: "gallery",
    id: "photos",
    title: "Estudos de composição",
    photos: [camera, cinema],
  },
  {
    type: "video",
    id: "video",
    title: "Estudo de enquadramento",
    src: "atlas:focus",
    transcript:
      "Clipe silencioso de dois segundos mostrando uma câmera de estúdio.",
  },
  {
    type: "audio",
    id: "audio",
    title: "Ouvido de estúdio",
    src: "atlas:tone",
    transcript:
      "Um tom de 440 Hz toca por dois segundos e desaparece aos poucos.",
  },
  { type: "map", id: "map", title: "Um idioma, três cidades", pins },
  {
    type: "places",
    id: "directory",
    title: "Ateliês imaginários",
    places: pins.map((p, i) => ({
      ...p,
      address: "Praça do Estúdio, " + (i + 1),
      category: ["Fotografia", "Tipografia", "Cerâmica"][i],
    })),
  },
  {
    type: "product",
    id: "product",
    title: "Caderno de campo",
    description: "Produto e preços ilustrativos.",
    currency: "BRL",
    variants: [
      { id: "a5", label: "Formato A5", price_cents: 2900 },
      { id: "a4", label: "Formato A4", price_cents: 3900, available: false },
    ],
  },
  {
    type: "kanban",
    id: "board",
    title: "Produção da exposição",
    columns: [
      { id: "todo", label: "A fazer" },
      { id: "doing", label: "Em produção" },
      { id: "done", label: "Concluído" },
    ],
    tasks: [
      { id: "select", label: "Selecionar fotografias", column: "todo" },
      { id: "print", label: "Provar a impressão", column: "doing" },
    ],
  },
  {
    type: "decision_tree",
    id: "tree",
    title: "Qual oficina escolher?",
    start: "start",
    nodes: [
      {
        id: "start",
        label: "Você prefere imagem ou som?",
        choices: [
          { label: "Imagem", target: "photo" },
          { label: "Som", target: "sound" },
        ],
      },
      { id: "photo", label: "Experimente a oficina de fotografia." },
      { id: "sound", label: "Experimente a oficina de paisagem sonora." },
    ],
  },
  {
    type: "budget_planner",
    id: "budget",
    title: "Orçamento da exposição",
    currency: "BRL",
    limit_cents: 72000,
    items: [
      { id: "prints", label: "Impressões", price_cents: 4500, quantity: 4 },
      { id: "frames", label: "Molduras", price_cents: 6200, quantity: 4 },
    ],
  },
];
