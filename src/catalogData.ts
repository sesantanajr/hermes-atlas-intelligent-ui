import type { Block } from "./types";
import { examples } from "./examples";
import { analyticsSamples } from "./analyticsSamples";
import { editorialSamples } from "./editorialSamples";
import { controlSamples } from "./controlSamples";
import { experienceSamples } from "./experienceSamples";

const groups = {
  "Texto e formatação": {
    text: "Texto",
    heading: "Título de seção",
    callout: "Aviso em destaque",
    quote: "Citação",
    markdown: "Texto Markdown",
    equation: "Fórmula matemática",
    badges: "Etiquetas",
    facts: "Ficha de informações",
    article: "Artigo",
  },
  "Layout e organização": {
    tabs: "Abas",
    accordion: "Acordeão",
    cards: "Grade de cartões",
    columns: "Colunas",
    carousel: "Carrossel",
    steps_list: "Passo a passo",
    table: "Tabela pesquisável",
  },
  Formulários: {
    form: "Formulário composto",
    short_answer: "Resposta curta",
    long_answer: "Resposta longa",
    number_input: "Campo numérico",
    date_picker: "Seletor de data",
    date_range: "Intervalo de datas",
    single_choice: "Escolha única",
    multi_choice: "Seleção múltipla",
  },
  "Controles interativos": {
    checklist: "Lista de tarefas",
    flashcards: "Cartões de estudo",
    toggle: "Interruptor",
    slider: "Controle deslizante",
    rating: "Avaliação por estrelas",
    segmented: "Controle segmentado",
    checklist_group: "Tarefas por grupo",
    poll: "Enquete",
    quiz: "Questionário",
    timer: "Temporizador",
  },
  "Visualização de dados": {
    metric: "Indicador",
    chart: "Gráfico de barras",
    series: "Série temporal",
    donut: "Gráfico de rosca",
    pie: "Gráfico de pizza",
    scatter: "Gráfico de dispersão",
    bubble: "Gráfico de bolhas",
    radar: "Gráfico radar",
    heatmap: "Mapa de calor",
    histogram: "Histograma",
    waterfall: "Gráfico de cascata",
    funnel: "Funil",
    gauge: "Medidor",
    progress: "Progresso de meta",
    sparkline: "Minigráfico de tendência",
    ranking: "Classificação",
    treemap: "Mapa de áreas",
    dashboard: "Painel de indicadores",
  },
  "Mídia e conteúdo visual": {
    image: "Imagem com legenda",
    gallery: "Galeria de imagens",
    video: "Player de vídeo",
    audio: "Player de áudio",
    diagram: "Diagrama anotado",
  },
  "Informações conectadas": {
    map: "Mapa geográfico",
    places: "Diretório de locais",
    route: "Roteiro geográfico",
    product: "Produto com variantes",
    collection: "Coleção comparável",
    entity: "Perfil de entidade",
    bibliography: "Bibliografia",
    glossary: "Glossário",
    timeline: "Linha do tempo",
    comparison: "Comparativo",
  },
  "Aplicações e documentos": {
    document: "Documento editável",
    code: "Código-fonte",
    calculator: "Calculadora",
    kanban: "Quadro Kanban",
    decision_tree: "Árvore de decisão",
    budget_planner: "Planejador de orçamento",
  },
} satisfies Record<string, Partial<Record<Block["type"], string>>>;
export const categories = Object.keys(groups);
const samples = new Map(
  [
    ...examples.flatMap((canvas) => canvas.blocks),
    ...analyticsSamples,
    ...editorialSamples,
    ...controlSamples,
    ...experienceSamples,
  ].map((b) => [b.type, b] as const),
);
export const catalog = Object.entries(groups).flatMap(([category, group]) =>
  Object.entries(group).map(([key, label]) => {
    const type = key as Block["type"],
      example = samples.get(type);
    if (!example) throw new Error("Missing catalog sample: " + type);
    return { type, label, category, example };
  }),
);
if (
  samples.size !== catalog.length ||
  new Set(catalog.map((e) => e.type)).size !== catalog.length
)
  throw new Error("Catalog and examples disagree");
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
