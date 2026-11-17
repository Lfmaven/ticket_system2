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

export type ApiKeyScope = 'tickets:read' | 'tickets:write' | 'webhooks:manage';

export type WebhookEventType =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.status_changed'
  | 'ticket.commented'
  | 'webhook.test';

export interface UserRecord {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  perfil: UserRole;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

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

export interface TicketRecord {
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
  history: TicketAuditEvent[];
}

export interface ApiKeyRecord {
  id: string;
  nome: string;
  prefix: string;
  keyHash: string;
  ownerId: string;
  ownerNome: string;
  ownerPerfil: UserRole;
  scopes: ApiKeyScope[];
  ativo: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

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

export interface WebhookRecord {
  id: string;
  nome: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  ativo: boolean;
  createdAt: string;
  createdBy: string;
}

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

export interface DatabaseState {
  sequence: number;
  users: UserRecord[];
  tickets: TicketRecord[];
  apiKeys: ApiKeyRecord[];
  webhooks: WebhookRecord[];
  webhookDeliveries: WebhookDeliveryLog[];
}

export interface JwtPayloadClaims {
  sub: string;
  email: string;
  nome: string;
  perfil: UserRole;
  type: 'access' | 'refresh';
  authMethod?: 'jwt' | 'api_key';
  scopes?: ApiKeyScope[];
  iat?: number;
  exp?: number;
  iss?: string;
}
