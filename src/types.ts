export type UserRole = 'admin' | 'agente' | 'cliente';

export type TicketStatus =
  | 'aberto'
  | 'em_andamento'
  | 'aguardando_cliente'
  | 'resolvido'
  | 'fechado';

export type TicketPriority = 'baixa' | 'media' | 'alta' | 'critica';

export type TicketCategory =
  | 'bug'
  | 'acesso'
  | 'financeiro'
  | 'infraestrutura'
  | 'duvida';

export interface UserDTO {
  id: string;
  nome: string;
  email: string;
  perfil: UserRole;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorNome: string;
  authorPerfil: UserRole;
  conteudo: string;
  interno: boolean;
  createdAt: string;
}

export interface TicketAuditEvent {
  id: string;
  actorId: string;
  actorNome: string;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  createdAt: string;
}

export interface TicketDTO {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string;
  status: TicketStatus;
  prioridade: TicketPriority;
  categoria: TicketCategory;
  solicitanteId: string;
  responsavelId: string | null;
  slaDueAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments: TicketComment[];
  commentsCount: number;
  history: TicketAuditEvent[];
  isSlaBreached: boolean;
  solicitante: UserDTO | null;
  responsavel: UserDTO | null;
}

export interface TicketStats {
  total: number;
  openActive: number;
  slaBreached: number;
  avgResolutionHours: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
}

export interface AuthSession {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type ApiKeyScope = 'tickets:read' | 'tickets:write' | 'webhooks:manage';

export interface ApiKeyDTO {
  id: string;
  nome: string;
  prefix: string;
  ownerId: string;
  ownerNome: string;
  scopes: ApiKeyScope[];
  ativo: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export type WebhookEventType =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.status_changed'
  | 'ticket.commented'
  | 'webhook.test';

export interface WebhookDTO {
  id: string;
  nome: string;
  url: string;
  secretPreview: string;
  events: WebhookEventType[];
  ativo: boolean;
  createdAt: string;
  createdBy: string;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  webhookNome: string;
  event: WebhookEventType;
  url: string;
  statusCode: number | null;
  success: boolean;
  durationMs: number;
  responsePreview: string;
  createdAt: string;
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando_cliente: 'Aguardando cliente',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: 'Bug',
  acesso: 'Acesso',
  financeiro: 'Financeiro',
  infraestrutura: 'Infraestrutura',
  duvida: 'Dúvida',
};

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  aberto: ['em_andamento', 'aguardando_cliente', 'resolvido', 'fechado'],
  em_andamento: ['aberto', 'aguardando_cliente', 'resolvido', 'fechado'],
  aguardando_cliente: ['em_andamento', 'resolvido', 'fechado'],
  resolvido: ['fechado', 'aberto'],
  fechado: ['aberto'],
};
