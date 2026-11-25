import type { PlanningBlock } from "./planning";

/** Working examples of the planning blocks (catalogue entries and `atlas_components`). */
export const planningSamples: PlanningBlock[] = [
  {
    type: "gantt",
    id: "migracao",
    title: "Migração para o Microsoft 365",
    today: "2026-12-08",
    tasks: [
      { id: "inventario", label: "Inventário de caixas", start: "2026-12-01", end: "2026-12-04", progress: 100, group: "Preparação", owner: "Ana" },
      { id: "licencas", label: "Licenças e grupos", start: "2026-12-03", end: "2026-12-09", progress: 60, group: "Preparação", owner: "Bruno", depends_on: ["inventario"] },
      { id: "piloto", label: "Piloto com 10 usuários", start: "2026-12-10", end: "2026-12-16", progress: 0, group: "Execução", owner: "Ana", depends_on: ["licencas"] },
      { id: "ondas", label: "Migração em ondas", start: "2026-12-17", end: "2027-01-08", progress: 0, group: "Execução", owner: "Equipe" },
      { id: "golive", label: "Go-live", start: "2027-01-11", end: "2027-01-11", milestone: true, group: "Execução", depends_on: ["ondas"] },
    ],
  },
  {
    type: "calendar",
    id: "agenda",
    title: "Agenda de estudos",
    month: "2026-12",
    events: [
      { id: "aula1", label: "Aula: identidades", date: "2026-12-02", time: "19:00", tone: "info", detail: "Entra ID, usuários e grupos." },
      { id: "lab1", label: "Laboratório de rede", date: "2026-12-05", end: "2026-12-06", tone: "success" },
      { id: "simulado", label: "Simulado AZ-104", date: "2026-12-12", time: "09:00", tone: "warning", detail: "Duas horas, 50 questões." },
      { id: "prova", label: "Prova", date: "2026-12-19", time: "14:00", tone: "danger" },
    ],
  },
  {
    type: "matrix",
    id: "prioridades",
    title: "Prioridades da semana",
    x_axis: "Urgência",
    y_axis: "Importância",
    quadrants: [
      { id: "agora", label: "Fazer agora", hint: "Importante e urgente" },
      { id: "agendar", label: "Agendar", hint: "Importante, sem pressa" },
      { id: "delegar", label: "Delegar", hint: "Urgente, menos importante" },
      { id: "depois", label: "Deixar para depois", hint: "Nem urgente nem importante" },
    ],
    items: [
      { id: "backup", label: "Corrigir o backup", quadrant: "agora" },
      { id: "politica", label: "Revisar política de senhas", quadrant: "agendar" },
      { id: "relatorio", label: "Relatório mensal", quadrant: "delegar" },
      { id: "wiki", label: "Reorganizar a wiki", quadrant: "depois" },
      { id: "fornecedor", label: "Responder fornecedor", quadrant: "delegar" },
    ],
  },
  {
    type: "tree",
    id: "estrutura",
    title: "Estrutura do projeto",
    nodes: [
      { id: "projeto", label: "Portal interno" },
      { id: "front", label: "Interface", parent: "projeto", tone: "info" },
      { id: "telas", label: "Telas", parent: "front", detail: "Início, perfil e relatórios" },
      { id: "temas", label: "Temas claro e escuro", parent: "front" },
      { id: "api", label: "API", parent: "projeto", tone: "success" },
      { id: "auth", label: "Autenticação", parent: "api", detail: "Entra ID com MFA" },
      { id: "dados", label: "Banco de dados", parent: "api" },
      { id: "ops", label: "Operação", parent: "projeto", tone: "warning" },
      { id: "monitor", label: "Monitoramento", parent: "ops" },
    ],
  },
];
