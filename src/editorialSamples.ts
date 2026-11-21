import type { EditorialBlock } from "./editorial";

export const editorialSamples: EditorialBlock[] = [
  {
    type: "heading",
    id: "cabecalho",
    title: "Caderno de campo",
    level: 2,
    subtitle: "Uma oficina de observação da paisagem urbana.",
  },
  {
    type: "callout",
    id: "aviso",
    title: "Antes da saída",
    tone: "warning",
    body: "Leve uma cópia do roteiro. O percurso passa por trechos com pouco sinal.",
  },
  {
    type: "quote",
    id: "citacao",
    title: "Uma pergunta de partida",
    quote:
      "Que detalhe desta praça passaria despercebido se você estivesse com pressa?",
    attribution: "Roteiro ilustrativo da oficina",
  },
  {
    type: "glossary",
    id: "termos",
    title: "Vocabulário de campo",
    entries: [
      {
        term: "Transecto",
        definition:
          "Linha de observação ao longo da qual se registram mudanças na paisagem.",
      },
      {
        term: "Amostragem",
        definition: "Seleção das observações que vão compor um levantamento.",
      },
      { term: "Dossel", definition: "Camada formada pelas copas das árvores." },
    ],
  },
  {
    type: "code",
    id: "trecho",
    title: "Ler uma anotação",
    language: "Python",
    code: 'registro = {"local": "Praça", "arvores": 3}\nprint(registro["local"])',
  },
  {
    type: "markdown",
    id: "notas",
    title: "Orientações para as notas",
    body: "Registre **onde** e **quando** você observou.\n\n- Descreva a paisagem em uma frase.\n- Anote quais detalhes ainda precisam de confirmação.",
  },
  {
    type: "equation",
    id: "densidade",
    title: "Densidade observada",
    expression: [
      { kind: "text", text: "d = " },
      { kind: "fraction", numerator: "n", denominator: "A" },
    ],
    description:
      "A densidade d é o número de árvores n dividido pela área observada A.",
  },
  {
    type: "badges",
    id: "marcadores",
    title: "Condições da visita",
    items: [
      { label: "Percurso a pé", tone: "neutral" },
      { label: "Coleta aberta", tone: "success" },
      { label: "Solo úmido", tone: "warning" },
    ],
  },
  {
    type: "facts",
    id: "ficha",
    title: "Dados da amostra",
    entries: [
      { label: "Ambiente", value: "Praça urbana" },
      { label: "Área ilustrativa", value: "400 m²" },
      { label: "Duração prevista", value: "25 minutos" },
    ],
  },
  {
    type: "article",
    id: "leitura",
    title: "Ler a paisagem",
    byline: "Oficina de campo",
    lead: "A mesma praça pode contar histórias diferentes ao longo do dia.",
    sections: [
      {
        id: "sombra",
        title: "Sombra",
        body: "Observe como as sombras das árvores se deslocam entre as visitas.",
      },
      {
        id: "pessoas",
        title: "Circulação",
        body: "Registre por quais caminhos as pessoas atravessam a praça.",
      },
    ],
  },
  {
    type: "accordion",
    id: "duvidas",
    title: "Dúvidas da oficina",
    items: [
      {
        id: "chuva",
        title: "E se chover?",
        body: "Faça o registro a partir de um local coberto e anote essa mudança de posição.",
      },
      {
        id: "repetir",
        title: "Quando repetir a visita?",
        body: "Escolha outro horário e mantenha o mesmo ponto de observação.",
      },
    ],
  },
  {
    type: "cards",
    id: "roteiros",
    title: "Escolha uma investigação",
    items: [
      {
        id: "aves",
        title: "Aves urbanas",
        body: "Descreva um canto e a direção de onde ele veio.",
        prompt: "Monte um roteiro curto de escuta de aves para a praça.",
      },
      {
        id: "plantas",
        title: "Árvores da praça",
        body: "Compare os contornos de três copas.",
        prompt: "Ajude a montar uma ficha para comparar três copas de árvores.",
      },
    ],
  },
  {
    type: "columns",
    id: "comparacao",
    title: "Duas perspectivas",
    columns: [
      {
        id: "manha",
        title: "Manhã",
        body: "As primeiras anotações dão atenção ao canto das aves e ao caminho da luz.",
      },
      {
        id: "tarde",
        title: "Tarde",
        body: "O segundo registro destaca mudanças na sombra e na ocupação dos bancos.",
      },
    ],
  },
  {
    type: "carousel",
    id: "paradas",
    title: "Paradas do percurso",
    slides: [
      {
        id: "entrada",
        title: "Entrada da praça",
        body: "Use o portão como referência para orientar seu croqui.",
      },
      {
        id: "centro",
        title: "Clareira central",
        body: "Compare o chão exposto ao sol com a área sob as copas.",
      },
      {
        id: "lago",
        title: "Margem do lago",
        body: "Registre os sons mais próximos e os mais distantes.",
      },
    ],
  },
  {
    type: "steps_list",
    id: "protocolo",
    title: "Registrar uma observação",
    steps: [
      {
        id: "localizar",
        title: "Marcar o local",
        body: "Escolha um ponto de referência visível no croqui.",
      },
      {
        id: "descrever",
        title: "Descrever o que mudou",
        body: "Compare a cena com a anotação anterior.",
      },
      {
        id: "revisar",
        title: "Revisar as unidades",
        body: "Confira se áreas e distâncias têm unidade indicada.",
      },
    ],
  },
  {
    type: "bibliography",
    id: "referencias",
    title: "Fontes para documentar o trabalho",
    entries: [
      {
        title: "Referência de elementos HTML",
        author: "MDN Web Docs",
        locator: "Consulte os elementos semânticos de texto.",
        url: "https://developer.mozilla.org/pt-BR/docs/Web/HTML/Reference/Elements",
      },
      {
        title: "Especificação CommonMark",
        author: "Projeto CommonMark",
        locator: "Consulte a sintaxe de listas e citações.",
        url: "https://spec.commonmark.org/",
      },
    ],
  },
  {
    type: "entity",
    id: "entidade",
    title: "Ficha de referência",
    name: "Ipê-amarelo",
    category: "Planta · nome popular",
    summary:
      "Nome usado para diferentes árvores de flores amarelas. Uma observação de campo deve registrar quais características sustentam a identificação.",
    attributes: [
      { label: "Observação sugerida", value: "Forma das folhas e das flores" },
    ],
    url: "https://floradobrasil.jbrj.gov.br/",
  },
  {
    type: "document",
    id: "relato",
    title: "Relato de campo",
    body: "Local da visita\nPraça do bairro.\n\nObservações\nDescreva a primeira mudança que chamou sua atenção.",
  },
];
