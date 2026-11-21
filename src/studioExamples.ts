import type { Canvas } from "./types";

export const studioExamples: Canvas[] = [
  {
    id: "demo-camera",
    schema_version: "1.0",
    title: "Por dentro da câmera",
    description:
      "Explore uma câmera de filme ilustrativa, experimente uma técnica e teste o que aprendeu.",
    blocks: [
      {
        type: "diagram",
        id: "anatomy",
        title: "Anatomia de uma câmera de filme",
        illustration: "camera",
        alt: "Vista frontal de uma câmera de filme prateada, com objetiva central e visor à direita da imagem.",
        items: [
          {
            id: "lens",
            title: "Objetiva",
            x: 51,
            y: 61,
            body: "A objetiva reúne as lentes que projetam a luz da cena sobre o filme. O anel ao redor dela permite ajustar o foco neste exemplo.",
          },
          {
            id: "finder",
            title: "Visor",
            x: 75,
            y: 24,
            body: "Aproxime o olho do visor para enquadrar. Nesta câmera, a janela fica deslocada em relação à objetiva.",
          },
          {
            id: "shutter",
            title: "Disparador",
            x: 24,
            y: 6,
            body: "O botão aciona o obturador. Ao fotografar à mão, pressione com suavidade para evitar deslocar o enquadramento.",
          },
        ],
      },
      {
        type: "tabs",
        id: "techniques",
        title: "Técnicas de campo",
        items: [
          {
            id: "light",
            title: "Luz",
            body: "Escolha um objeto próximo a uma janela. Observe como a sombra muda quando você gira o objeto.",
            points: [
              "Compare luz frontal e lateral.",
              "Mantenha a distância até o objeto.",
            ],
          },
          {
            id: "focus",
            title: "Foco",
            body: "Enquadre dois objetos a distâncias diferentes. Alterne o ponto de foco e compare o resultado.",
          },
          {
            id: "frame",
            title: "Enquadramento",
            body: "Fotografe o mesmo objeto em plano aberto e em detalhe. Observe o que fica dentro das bordas.",
          },
        ],
      },
      {
        type: "flashcards",
        id: "practice",
        title: "Revise as partes da câmera",
        items: [
          {
            id: "f1",
            question: "Qual conjunto projeta a luz da cena sobre o filme?",
            answer: "A objetiva.",
          },
          {
            id: "f2",
            question: "Que parte você usa para compor o enquadramento?",
            answer: "O visor.",
          },
          {
            id: "f3",
            question: "O que acontece ao pressionar o disparador?",
            answer: "O obturador é acionado para a exposição.",
          },
        ],
      },
    ],
  },
  {
    id: "demo-walk",
    schema_version: "1.0",
    title: "Caderno de campo",
    description:
      "Planeje uma saída fotográfica com dados fictícios. As quantidades, horários e paradas são ilustrativos.",
    blocks: [
      {
        type: "series",
        id: "frames",
        title: "Fotos por saída",
        kind: "line",
        x_axis: "date",
        unit: "fotos",
        labels: ["2026-05-02", "2026-05-09", "2026-05-23", "2026-06-06"],
        datasets: [
          { id: "planned", label: "Planejadas", values: [8, 12, 14, 16] },
          { id: "taken", label: "Registradas", values: [6, 14, null, 12] },
        ],
      },
      {
        type: "route",
        id: "walk",
        title: "Percurso de estudo",
        items: [
          {
            id: "a",
            title: "Luz da manhã",
            body: "Primeiro exercício. Busque luz lateral e observe o contraste.",
            lat: -23.548,
            lon: -46.638,
          },
          {
            id: "b",
            title: "Linhas da rua",
            body: "Segundo exercício. Use duas linhas convergentes na composição.",
            lat: -23.545,
            lon: -46.636,
          },
          {
            id: "c",
            title: "Reflexos",
            body: "Último exercício. Compare ângulos sobre uma superfície refletora.",
            lat: -23.544,
            lon: -46.633,
          },
        ],
      },
      {
        type: "timeline",
        id: "schedule",
        title: "Etapas da saída",
        items: [
          {
            id: "prepare",
            title: "Preparar",
            when: "08h00",
            status: "done",
            body: "Separar câmera, filme e caderno.",
          },
          {
            id: "walk",
            title: "Fotografar",
            when: "09h00",
            status: "current",
            body: "Percorrer as três paradas e anotar uma escolha de enquadramento em cada uma.",
          },
          {
            id: "review",
            title: "Revisar",
            when: "11h00",
            status: "upcoming",
            body: "Comparar os registros com o plano e escolher uma foto para discutir.",
          },
        ],
      },
      {
        type: "form",
        id: "report",
        title: "Registro da saída",
        submit_label: "Preparar relato",
        fields: [
          { id: "day", kind: "date", label: "Data da saída" },
          {
            id: "light",
            kind: "radio",
            label: "Luz predominante",
            options: ["Direta", "Difusa", "Mista"],
          },
          { id: "notes", kind: "textarea", label: "Observações de campo" },
          {
            id: "review",
            kind: "checkbox",
            label: "Quero revisar as fotos com o Hermes",
          },
        ],
      },
    ],
  },
];
