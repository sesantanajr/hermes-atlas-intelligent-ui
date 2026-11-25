import type { Block } from "../types";
import { examples } from "./examples";
import { analyticsSamples } from "./analyticsSamples";
import { editorialSamples } from "./editorialSamples";
import { controlSamples } from "./controlSamples";
import { experienceSamples } from "./experienceSamples";
import { planningSamples } from "./planningSamples";

/** [rótulo em português, English label, one-line "use it for" summary read by the agent]. */
type Row = [label: string, labelEn: string, summary: string];
type Group = {
  id: string;
  label: string;
  labelEn: string;
  types: Partial<Record<Block["type"], Row>>;
};

const groups: Group[] = [
  {
    id: "text",
    label: "Texto e formatação",
    labelEn: "Text and formatting",
    types: {
      text: ["Texto", "Text", "A plain paragraph between other blocks."],
      heading: [
        "Título de seção",
        "Section heading",
        "A section title with an optional subtitle, to organise a long canvas.",
      ],
      callout: [
        "Aviso em destaque",
        "Callout",
        "A highlighted note with a tone: info, success, warning or neutral.",
      ],
      quote: [
        "Citação",
        "Quote",
        "An attributed quotation with an optional source link.",
      ],
      markdown: [
        "Texto Markdown",
        "Markdown text",
        "Rich text written in Markdown (lists, links, emphasis). HTML is not rendered.",
      ],
      equation: [
        "Fórmula matemática",
        "Equation",
        "A formula built from fractions, powers and roots, with a spoken description.",
      ],
      badges: [
        "Etiquetas",
        "Badges",
        "A row of short status labels with tones.",
      ],
      facts: [
        "Ficha de informações",
        "Fact sheet",
        "Label and value pairs for the key facts about one subject.",
      ],
      article: [
        "Artigo",
        "Article",
        "A long-form piece with byline, lead and titled sections.",
      ],
    },
  },
  {
    id: "layout",
    label: "Layout e organização",
    labelEn: "Layout and organisation",
    types: {
      tabs: [
        "Abas",
        "Tabs",
        "Sections the user switches between, one visible at a time.",
      ],
      accordion: [
        "Acordeão",
        "Accordion",
        "Collapsible sections for FAQs or optional detail.",
      ],
      cards: [
        "Grade de cartões",
        "Card grid",
        "A grid of cards; each card can carry a follow-up prompt for the agent.",
      ],
      columns: [
        "Colunas",
        "Columns",
        "Two or three text columns side by side.",
      ],
      carousel: [
        "Carrossel",
        "Carousel",
        "Slides the user steps through one at a time.",
      ],
      steps_list: [
        "Passo a passo",
        "Step list",
        "Ordered steps the user can open and mark as done.",
      ],
      table: [
        "Tabela pesquisável",
        "Searchable table",
        "Rows and columns the user can filter and sort.",
      ],
    },
  },
  {
    id: "forms",
    label: "Formulários",
    labelEn: "Forms",
    types: {
      form: [
        "Formulário composto",
        "Form",
        "Several fields collected together; submitting drafts a message back to the agent.",
      ],
      short_answer: [
        "Resposta curta",
        "Short answer",
        "A single-line text answer.",
      ],
      long_answer: [
        "Resposta longa",
        "Long answer",
        "A multi-line text answer.",
      ],
      number_input: [
        "Campo numérico",
        "Number input",
        "A numeric answer with optional bounds and unit.",
      ],
      date_picker: ["Seletor de data", "Date picker", "One calendar date."],
      date_range: [
        "Intervalo de datas",
        "Date range",
        "A start date and an end date.",
      ],
      single_choice: [
        "Escolha única",
        "Single choice",
        "Pick exactly one option from a list.",
      ],
      multi_choice: [
        "Seleção múltipla",
        "Multiple choice",
        "Pick any number of options from a list.",
      ],
    },
  },
  {
    id: "controls",
    label: "Controles interativos",
    labelEn: "Interactive controls",
    types: {
      checklist: [
        "Lista de tarefas",
        "Checklist",
        "A simple list of items to tick off.",
      ],
      flashcards: [
        "Cartões de estudo",
        "Flashcards",
        "Question and answer cards that track which ones the user already knows.",
      ],
      toggle: ["Interruptor", "Toggle", "An on/off switch."],
      slider: [
        "Controle deslizante",
        "Slider",
        "A numeric value chosen along a range.",
      ],
      rating: ["Avaliação por estrelas", "Star rating", "A star rating."],
      segmented: [
        "Controle segmentado",
        "Segmented control",
        "A compact one-of-a-few selector.",
      ],
      checklist_group: [
        "Tarefas por grupo",
        "Grouped checklist",
        "Tasks organised under group headings.",
      ],
      poll: ["Enquete", "Poll", "One vote among several options."],
      quiz: [
        "Questionário",
        "Quiz",
        "A multiple-choice question that grades the answer and explains it.",
      ],
      timer: [
        "Temporizador",
        "Timer",
        "A countdown the user can start and pause.",
      ],
    },
  },
  {
    id: "data",
    label: "Visualização de dados",
    labelEn: "Data visualisation",
    types: {
      metric: [
        "Indicador",
        "Metric",
        "One headline number with a short caption.",
      ],
      chart: [
        "Gráfico de barras",
        "Bar chart",
        "Horizontal bars for a handful of labelled values; negatives allowed.",
      ],
      series: [
        "Série temporal",
        "Series chart",
        "A line, bar or area chart of up to six datasets over categories or dates.",
      ],
      donut: ["Gráfico de rosca", "Donut chart", "Parts of a whole as a ring."],
      pie: ["Gráfico de pizza", "Pie chart", "Parts of a whole."],
      scatter: [
        "Gráfico de dispersão",
        "Scatter plot",
        "The relationship between two measures.",
      ],
      bubble: [
        "Gráfico de bolhas",
        "Bubble chart",
        "Two measures plus a size for each point.",
      ],
      radar: [
        "Gráfico radar",
        "Radar chart",
        "A profile across three to twelve axes.",
      ],
      heatmap: [
        "Mapa de calor",
        "Heatmap",
        "A matrix of values by row and column.",
      ],
      histogram: [
        "Histograma",
        "Histogram",
        "The distribution of numeric samples.",
      ],
      waterfall: [
        "Gráfico de cascata",
        "Waterfall chart",
        "A running total through positive and negative steps.",
      ],
      funnel: ["Funil", "Funnel", "The shrinking stages of a process."],
      gauge: ["Medidor", "Gauge", "One value within a range."],
      progress: [
        "Progresso de meta",
        "Progress",
        "A completed amount toward a total.",
      ],
      sparkline: [
        "Minigráfico de tendência",
        "Sparkline",
        "A compact trend line.",
      ],
      ranking: [
        "Classificação",
        "Ranking",
        "An ordered leaderboard of labelled values.",
      ],
      treemap: [
        "Mapa de áreas",
        "Treemap",
        "Parts of a whole as proportional areas.",
      ],
      dashboard: [
        "Painel de indicadores",
        "Dashboard",
        "Key indicators plus a breakdown, switchable by period.",
      ],
    },
  },
  {
    id: "media",
    label: "Mídia e conteúdo visual",
    labelEn: "Media",
    types: {
      image: [
        "Imagem com legenda",
        "Image",
        "One HTTPS image with alternative text and caption.",
      ],
      gallery: [
        "Galeria de imagens",
        "Gallery",
        "Several images browsed one at a time.",
      ],
      video: ["Player de vídeo", "Video", "An HTTPS video with its transcript."],
      audio: ["Player de áudio", "Audio", "HTTPS audio with its transcript."],
      diagram: [
        "Diagrama anotado",
        "Annotated diagram",
        "An image or illustration with labelled hotspots.",
      ],
    },
  },
  {
    id: "info",
    label: "Informações conectadas",
    labelEn: "Connected information",
    types: {
      map: [
        "Mapa geográfico",
        "Map",
        "Pins on a world map by latitude and longitude.",
      ],
      places: [
        "Diretório de locais",
        "Places directory",
        "A searchable list of places with address and category.",
      ],
      route: [
        "Roteiro geográfico",
        "Route",
        "Ordered stops with verified coordinates.",
      ],
      product: [
        "Produto com variantes",
        "Product",
        "A product with selectable variants and prices.",
      ],
      collection: [
        "Coleção comparável",
        "Collection",
        "Up to 24 items the user can sort, select and compare.",
      ],
      entity: [
        "Perfil de entidade",
        "Entity profile",
        "A profile card for a person, place or organisation.",
      ],
      bibliography: [
        "Bibliografia",
        "Bibliography",
        "A list of cited sources with links.",
      ],
      glossary: [
        "Glossário",
        "Glossary",
        "Searchable terms and definitions.",
      ],
      timeline: [
        "Linha do tempo",
        "Timeline",
        "Milestones in order, each with an optional date and status.",
      ],
      comparison: [
        "Comparativo",
        "Comparison",
        "Two to four options side by side with their features.",
      ],
    },
  },
  {
    id: "apps",
    label: "Aplicações e documentos",
    labelEn: "Apps and documents",
    types: {
      document: [
        "Documento editável",
        "Editable document",
        "Text the user can edit in place.",
      ],
      code: [
        "Código-fonte",
        "Code",
        "Source code with a language label and optional line numbers.",
      ],
      calculator: [
        "Calculadora",
        "Calculator",
        "Sliders feeding a sum, product, split or compound-interest result.",
      ],
      kanban: ["Quadro Kanban", "Kanban board", "Tasks moved between columns."],
      decision_tree: [
        "Árvore de decisão",
        "Decision tree",
        "A guided path through a series of choices.",
      ],
      budget_planner: [
        "Planejador de orçamento",
        "Budget planner",
        "Line items with quantities checked against a spending limit.",
      ],
    },
  },
  {
    id: "planning",
    label: "Planejamento",
    labelEn: "Planning",
    types: {
      gantt: [
        "Cronograma (Gantt)",
        "Gantt chart",
        "Tasks on a time axis with progress, owners, milestones and dependencies; the user can zoom and open a task.",
      ],
      calendar: [
        "Calendário",
        "Calendar",
        "A month view of dated events (deadlines, classes, meetings) the user can browse month by month.",
      ],
      matrix: [
        "Matriz de prioridades",
        "Priority matrix",
        "A 2x2 matrix (urgency x importance, effort x impact, risk) whose cards the user drags between quadrants.",
      ],
      tree: [
        "Árvore",
        "Tree",
        "A hierarchy with one root: org chart, mind map or work breakdown, with branches the user folds.",
      ],
    },
  },
];

export const categoryList = groups.map(({ id, label, labelEn }) => ({
  id,
  label,
  label_en: labelEn,
}));
export const categories = groups.map((group) => group.label);
const samples = new Map(
  [
    ...examples.flatMap((canvas) => canvas.blocks),
    ...analyticsSamples,
    ...editorialSamples,
    ...controlSamples,
    ...experienceSamples,
    ...planningSamples,
  ].map((b) => [b.type, b] as const),
);
export const catalog = groups.flatMap((group) =>
  Object.entries(group.types).map(([key, row]) => {
    const type = key as Block["type"],
      example = samples.get(type);
    if (!example) throw new Error("Missing catalog sample: " + type);
    const [label, label_en, summary] = row as Row;
    return {
      type,
      label,
      label_en,
      category: group.label,
      category_en: group.labelEn,
      category_id: group.id,
      summary,
      example,
    };
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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
