import type { BoardStage, ProjectTemplate } from "./types";

export const APP_NAME = "Tekton Digital — Soluções Web e Desenvolvimento de Sistemas";
export const APP_SHORT_NAME = "Tekton Digital";
export const APP_NAME_SUFFIX = "Soluções Web e Desenvolvimento de Sistemas";
export const APP_MONOGRAM = "TD";
export const APP_TAGLINE = "Projetos, prazos e recorrências em um só lugar.";
export const DEFAULT_LOCALE = "pt-BR";
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
export const DEFAULT_CURRENCY = "BRL" as const;

export const DEADLINE_REMINDER_DAYS = [7, 2, 0] as const;
export const RENEWAL_REMINDER_DAYS = [30, 7, 1] as const;

export const BOARD_STAGES: readonly BoardStage[] = [
  {
    id: "entrada",
    label: "Entrada",
    description: "Oportunidades e demandas ainda não qualificadas.",
    position: 0,
    accent: "slate",
  },
  {
    id: "briefing",
    label: "Briefing",
    description: "Escopo, conteúdo e responsabilidades sendo alinhados.",
    position: 1,
    accent: "blue",
  },
  {
    id: "em-producao",
    label: "Em produção",
    description: "Projeto em design, desenvolvimento ou configuração.",
    position: 2,
    accent: "violet",
  },
  {
    id: "aguardando-cliente",
    label: "Aguardando cliente",
    description: "A equipe depende de conteúdo, acesso ou aprovação do cliente.",
    position: 3,
    accent: "amber",
  },
  {
    id: "revisao",
    label: "Revisão",
    description: "Validação final, ajustes e controle de qualidade.",
    position: 4,
    accent: "cyan",
  },
  {
    id: "publicado",
    label: "Publicado",
    description: "Projeto entregue e disponível em produção.",
    position: 5,
    accent: "green",
  },
  {
    id: "manutencao",
    label: "Manutenção",
    description: "Projeto publicado com acompanhamento recorrente.",
    position: 6,
    accent: "green",
  },
] as const;

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: "site-institucional",
    name: "Site institucional",
    description: "Do briefing à publicação de um site responsivo e otimizado.",
    expectedResourceTypes: ["production", "staging", "admin", "github", "figma", "drive"],
    checklist: [
      { title: "Validar briefing e objetivos", description: null, position: 0 },
      { title: "Receber textos, fotos e identidade visual", description: null, position: 1 },
      { title: "Aprovar arquitetura e protótipo", description: null, position: 2 },
      { title: "Desenvolver páginas responsivas", description: null, position: 3 },
      { title: "Configurar SEO, analytics e formulários", description: null, position: 4 },
      { title: "Revisar acessibilidade e desempenho", description: null, position: 5 },
      { title: "Homologar com o cliente", description: null, position: 6 },
      { title: "Publicar e validar produção", description: null, position: 7 },
    ],
  },
  {
    id: "plataforma-cursos",
    name: "Plataforma de cursos",
    description: "Estrutura, pagamentos, conteúdo e acesso para uma operação de ensino online.",
    expectedResourceTypes: [
      "production",
      "staging",
      "admin",
      "github",
      "figma",
      "drive",
      "documentation",
    ],
    checklist: [
      { title: "Mapear produtos, trilhas e perfis de acesso", description: null, position: 0 },
      { title: "Organizar aulas, materiais e capas", description: null, position: 1 },
      { title: "Aprovar experiência do aluno", description: null, position: 2 },
      { title: "Configurar autenticação e permissões", description: null, position: 3 },
      { title: "Integrar pagamentos e e-mails transacionais", description: null, position: 4 },
      { title: "Cadastrar conteúdo piloto", description: null, position: 5 },
      { title: "Testar matrícula, progresso e recuperação de acesso", description: null, position: 6 },
      { title: "Treinar a equipe e publicar", description: null, position: 7 },
    ],
  },
  {
    id: "manutencao",
    name: "Manutenção",
    description: "Rotina recorrente para segurança, conteúdo e disponibilidade.",
    expectedResourceTypes: ["production", "admin", "github", "documentation"],
    checklist: [
      { title: "Validar backup recente", description: null, position: 0 },
      { title: "Aplicar atualizações e correções", description: null, position: 1 },
      { title: "Verificar formulários e jornadas críticas", description: null, position: 2 },
      { title: "Revisar disponibilidade e desempenho", description: null, position: 3 },
      { title: "Registrar alterações e pendências", description: null, position: 4 },
    ],
  },
] as const;

export const BOARD_STAGE_BY_ID = Object.fromEntries(
  BOARD_STAGES.map((stage) => [stage.id, stage]),
) as Record<(typeof BOARD_STAGES)[number]["id"], (typeof BOARD_STAGES)[number]>;

export const PROJECT_TEMPLATE_BY_ID = Object.fromEntries(
  PROJECT_TEMPLATES.map((template) => [template.id, template]),
) as Record<(typeof PROJECT_TEMPLATES)[number]["id"], (typeof PROJECT_TEMPLATES)[number]>;
