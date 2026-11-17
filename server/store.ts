import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword } from './security.ts';
import type {
  ApiKeyDTO,
  ApiKeyRecord,
  DatabaseState,
  TicketPriority,
  TicketRecord,
  TicketStatus,
  UserDTO,
  UserRecord,
  WebhookDTO,
  WebhookRecord,
} from './types.ts';

function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }
  const localDir = path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'ticketcore-data');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'ticket_system.json');

export const SLA_HOURS_BY_PRIORITY: Record<TicketPriority, number> = {
  critica: 4,
  alta: 12,
  media: 48,
  baixa: 72,
};

export const ALLOWED_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  aberto: ['em_andamento', 'aguardando_cliente', 'resolvido', 'fechado'],
  em_andamento: ['aberto', 'aguardando_cliente', 'resolvido', 'fechado'],
  aguardando_cliente: ['em_andamento', 'resolvido', 'fechado'],
  resolvido: ['fechado', 'aberto'],
  fechado: ['aberto'],
};

export function computeSlaDueAt(fromIso: string, priority: TicketPriority): string {
  const base = new Date(fromIso).getTime();
  const hours = SLA_HOURS_BY_PRIORITY[priority] ?? 48;
  return new Date(base + hours * 60 * 60 * 1000).toISOString();
}

export function sanitizeUser(user: UserRecord): UserDTO {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    ativo: user.ativo,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function sanitizeApiKey(record: ApiKeyRecord): ApiKeyDTO {
  return {
    id: record.id,
    nome: record.nome,
    prefix: record.prefix,
    ownerId: record.ownerId,
    ownerNome: record.ownerNome,
    scopes: record.scopes,
    ativo: record.ativo,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  };
}

export function sanitizeWebhook(record: WebhookRecord): WebhookDTO {
  return {
    id: record.id,
    nome: record.nome,
    url: record.url,
    secretPreview: `${record.secret.slice(0, 10)}••••${record.secret.slice(-4)}`,
    events: record.events,
    ativo: record.ativo,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
  };
}

function buildSeedState(): DatabaseState {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
  const hoursAhead = (h: number) => new Date(now + h * 3600_000).toISOString();

  const adminId = 'usr_admin_01';
  const agentId = 'usr_agente_01';
  const client1Id = 'usr_cliente_01';
  const client2Id = 'usr_cliente_02';

  const users: UserRecord[] = [
    {
      id: adminId,
      nome: 'Marina Albuquerque',
      email: 'admin@ticketcore.dev',
      senhaHash: hashPassword('Admin@2026'),
      perfil: 'admin',
      ativo: true,
      createdAt: hoursAgo(720),
      updatedAt: hoursAgo(12),
      lastLoginAt: hoursAgo(2),
    },
    {
      id: agentId,
      nome: 'Rafael Mendonça',
      email: 'agente@ticketcore.dev',
      senhaHash: hashPassword('Agente@2026'),
      perfil: 'agente',
      ativo: true,
      createdAt: hoursAgo(500),
      updatedAt: hoursAgo(5),
      lastLoginAt: hoursAgo(1),
    },
    {
      id: client1Id,
      nome: 'Camila Vasconcelos',
      email: 'cliente@ticketcore.dev',
      senhaHash: hashPassword('Cliente@2026'),
      perfil: 'cliente',
      ativo: true,
      createdAt: hoursAgo(320),
      updatedAt: hoursAgo(4),
      lastLoginAt: hoursAgo(4),
    },
    {
      id: client2Id,
      nome: 'Bruno Teixeira',
      email: 'bruno.teixeira@empresa.com.br',
      senhaHash: hashPassword('Cliente@2026'),
      perfil: 'cliente',
      ativo: true,
      createdAt: hoursAgo(180),
      updatedAt: hoursAgo(10),
      lastLoginAt: hoursAgo(10),
    },
  ];

  const tickets: TicketRecord[] = [
    {
      id: 'tck_1001',
      codigo: 'TCK-1001',
      titulo: 'Erro 500 ao validar token JWT expirado no endpoint /login',
      descricao:
        'Clientes integrando com o serviço de autenticação recebem erro interno quando enviam payload sem campo senha ou com formato inválido.',
      status: 'em_andamento',
      prioridade: 'critica',
      categoria: 'bug',
      solicitanteId: client1Id,
      responsavelId: agentId,
      slaDueAt: hoursAhead(2),
      resolvedAt: null,
      createdAt: hoursAgo(2),
      updatedAt: hoursAgo(0.5),
      comments: [
        {
          id: 'cmt_01',
          ticketId: 'tck_1001',
          authorId: client1Id,
          authorNome: 'Camila Vasconcelos',
          authorPerfil: 'cliente',
          conteudo: 'Reproduzido em ambiente de homologação às 09:40 com payload JSON parcial.',
          interno: false,
          createdAt: hoursAgo(1.5),
        },
        {
          id: 'cmt_02',
          ticketId: 'tck_1001',
          authorId: agentId,
          authorNome: 'Rafael Mendonça',
          authorPerfil: 'agente',
          conteudo: 'Identificada ausência de validação Zod e falha na indentação do retorno JWT. Patch em testes.',
          interno: true,
          createdAt: hoursAgo(0.5),
        },
      ],
      history: [
        {
          id: 'evt_01',
          actorId: client1Id,
          actorNome: 'Camila Vasconcelos',
          campo: 'criacao',
          valorAnterior: null,
          valorNovo: 'aberto',
          createdAt: hoursAgo(2),
        },
        {
          id: 'evt_02',
          actorId: agentId,
          actorNome: 'Rafael Mendonça',
          campo: 'status',
          valorAnterior: 'aberto',
          valorNovo: 'em_andamento',
          createdAt: hoursAgo(1),
        },
      ],
    },
    {
      id: 'tck_1002',
      codigo: 'TCK-1002',
      titulo: 'Provisionar acesso RBAC para equipe de suporte N2',
      descricao:
        'Necessitamos promover dois analistas para o perfil agente com permissão de leitura global na fila de chamados.',
      status: 'aberto',
      prioridade: 'alta',
      categoria: 'acesso',
      solicitanteId: client1Id,
      responsavelId: null,
      slaDueAt: hoursAhead(9),
      resolvedAt: null,
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
      comments: [],
      history: [
        {
          id: 'evt_03',
          actorId: client1Id,
          actorNome: 'Camila Vasconcelos',
          campo: 'criacao',
          valorAnterior: null,
          valorNovo: 'aberto',
          createdAt: hoursAgo(3),
        },
      ],
    },
    {
      id: 'tck_1003',
      codigo: 'TCK-1003',
      titulo: 'Divergência na fatura de licenças corporativas de outubro',
      descricao:
        'A cobrança contabilizou 14 assentos ativos, porém 3 contas foram desativadas antes do fechamento do ciclo.',
      status: 'aguardando_cliente',
      prioridade: 'media',
      categoria: 'financeiro',
      solicitanteId: client2Id,
      responsavelId: adminId,
      slaDueAt: hoursAhead(36),
      resolvedAt: null,
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(4),
      comments: [
        {
          id: 'cmt_03',
          ticketId: 'tck_1003',
          authorId: adminId,
          authorNome: 'Marina Albuquerque',
          authorPerfil: 'admin',
          conteudo: 'Conferimos o log de auditoria. Pode confirmar os 3 e-mails removidos para emitirmos a nota de crédito?',
          interno: false,
          createdAt: hoursAgo(4),
        },
      ],
      history: [
        {
          id: 'evt_04',
          actorId: client2Id,
          actorNome: 'Bruno Teixeira',
          campo: 'criacao',
          valorAnterior: null,
          valorNovo: 'aberto',
          createdAt: hoursAgo(12),
        },
        {
          id: 'evt_05',
          actorId: adminId,
          actorNome: 'Marina Albuquerque',
          campo: 'status',
          valorAnterior: 'aberto',
          valorNovo: 'aguardando_cliente',
          createdAt: hoursAgo(4),
        },
      ],
    },
    {
      id: 'tck_1004',
      codigo: 'TCK-1004',
      titulo: 'Configurar rate limit nas rotas públicas de cadastro e login',
      descricao:
        'Proteger /auth/register e /auth/login contra tentativas automatizadas de força bruta retornando HTTP 429.',
      status: 'resolvido',
      prioridade: 'alta',
      categoria: 'infraestrutura',
      solicitanteId: client2Id,
      responsavelId: agentId,
      slaDueAt: hoursAgo(2),
      resolvedAt: hoursAgo(5),
      createdAt: hoursAgo(18),
      updatedAt: hoursAgo(5),
      comments: [
        {
          id: 'cmt_04',
          ticketId: 'tck_1004',
          authorId: agentId,
          authorNome: 'Rafael Mendonça',
          authorPerfil: 'agente',
          conteudo: 'Rate limit ativado com janela deslizante e cabeçalhos X-RateLimit-Remaining.',
          interno: false,
          createdAt: hoursAgo(5),
        },
      ],
      history: [
        {
          id: 'evt_06',
          actorId: client2Id,
          actorNome: 'Bruno Teixeira',
          campo: 'criacao',
          valorAnterior: null,
          valorNovo: 'aberto',
          createdAt: hoursAgo(18),
        },
        {
          id: 'evt_07',
          actorId: agentId,
          actorNome: 'Rafael Mendonça',
          campo: 'status',
          valorAnterior: 'em_andamento',
          valorNovo: 'resolvido',
          createdAt: hoursAgo(5),
        },
      ],
    },
    {
      id: 'tck_1005',
      codigo: 'TCK-1005',
      titulo: 'Dúvida sobre paginação e filtros combinados em GET /tickets',
      descricao:
        'Como combinar query params status, priority e search mantendo ordenação por prazo de SLA?',
      status: 'fechado',
      prioridade: 'baixa',
      categoria: 'duvida',
      solicitanteId: client1Id,
      responsavelId: agentId,
      slaDueAt: hoursAhead(20),
      resolvedAt: hoursAgo(24),
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(20),
      comments: [],
      history: [
        {
          id: 'evt_08',
          actorId: client1Id,
          actorNome: 'Camila Vasconcelos',
          campo: 'criacao',
          valorAnterior: null,
          valorNovo: 'aberto',
          createdAt: hoursAgo(48),
        },
        {
          id: 'evt_09',
          actorId: agentId,
          actorNome: 'Rafael Mendonça',
          campo: 'status',
          valorAnterior: 'resolvido',
          valorNovo: 'fechado',
          createdAt: hoursAgo(20),
        },
      ],
    },
  ];

  return {
    sequence: 1005,
    users,
    tickets,
    apiKeys: [],
    webhooks: [],
    webhookDeliveries: [],
  };
}

let cachedState: DatabaseState | null = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeState(raw: Partial<DatabaseState>): DatabaseState {
  return {
    sequence: typeof raw.sequence === 'number' ? raw.sequence : 1005,
    users: Array.isArray(raw.users) ? raw.users : [],
    tickets: Array.isArray(raw.tickets) ? raw.tickets : [],
    apiKeys: Array.isArray(raw.apiKeys) ? raw.apiKeys : [],
    webhooks: Array.isArray(raw.webhooks) ? raw.webhooks : [],
    webhookDeliveries: Array.isArray(raw.webhookDeliveries)
      ? raw.webhookDeliveries
      : [],
  };
}

export function loadDb(): DatabaseState {
  if (cachedState) {
    return cachedState;
  }
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildSeedState();
    saveDb(seed);
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = normalizeState(JSON.parse(raw) as Partial<DatabaseState>);
    cachedState = parsed;
    return cachedState;
  } catch {
    const seed = buildSeedState();
    saveDb(seed);
    return seed;
  }
}

export function saveDb(nextState: DatabaseState): void {
  ensureDir();
  cachedState = nextState;
  const tmpFile = `${DB_FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(nextState, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function nextTicketCode(state: DatabaseState): string {
  state.sequence += 1;
  return `TCK-${state.sequence}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}
