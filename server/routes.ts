/**
 * @project Lfmaven/ticket_system
 * @author Lfmaven (https://github.com/Lfmaven/ticket_system)
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  generateApiKey,
  generateWebhookSecret,
  hashPassword,
  issueTokenPair,
  rateLimit,
  requireAuth,
  requireRoles,
  requireScope,
  setApiKeyResolver,
  verifyPassword,
  verifyRefreshToken,
  type AuthenticatedRequest,
} from './security.ts';
import {
  ALLOWED_STATUS_TRANSITIONS,
  computeSlaDueAt,
  loadDb,
  newId,
  nextTicketCode,
  sanitizeApiKey,
  sanitizeUser,
  sanitizeWebhook,
  saveDb,
} from './store.ts';
import { dispatchWebhookEvent, dispatchWebhookTest } from './webhooks.ts';
import type {
  TicketPriority,
  TicketRecord,
  TicketStatus,
  UserRole,
} from './types.ts';

const PRIORITY_WEIGHT: Record<TicketPriority, number> = {
  critica: 4,
  alta: 3,
  media: 2,
  baixa: 1,
};

const registerSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, 'Nome deve ter pelo menos 3 caracteres.')
    .max(100, 'Nome deve ter no máximo 100 caracteres.'),
  email: z.string().trim().email('E-mail inválido.').toLowerCase(),
  senha: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres.')
    .max(128, 'Senha excede o limite de 128 caracteres.')
    .regex(/[A-Za-z]/, 'Senha deve conter ao menos uma letra.')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número.'),
});

const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido.').toLowerCase(),
  senha: z.string().min(1, 'Senha é obrigatória.'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'refreshToken é obrigatório.'),
});

const updateRoleSchema = z.object({
  perfil: z.enum(['admin', 'agente', 'cliente']).optional(),
  ativo: z.boolean().optional(),
});

const createTicketSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(5, 'Título deve ter pelo menos 5 caracteres.')
    .max(140, 'Título deve ter no máximo 140 caracteres.'),
  descricao: z
    .string()
    .trim()
    .min(10, 'Descrição deve ter pelo menos 10 caracteres.')
    .max(4000, 'Descrição deve ter no máximo 4000 caracteres.'),
  prioridade: z.enum(['baixa', 'media', 'alta', 'critica']).default('media'),
  categoria: z
    .enum(['bug', 'acesso', 'financeiro', 'infraestrutura', 'duvida'])
    .default('duvida'),
});

const updateTicketSchema = z.object({
  titulo: z.string().trim().min(5).max(140).optional(),
  descricao: z.string().trim().min(10).max(4000).optional(),
  status: z
    .enum(['aberto', 'em_andamento', 'aguardando_cliente', 'resolvido', 'fechado'])
    .optional(),
  prioridade: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
  categoria: z
    .enum(['bug', 'acesso', 'financeiro', 'infraestrutura', 'duvida'])
    .optional(),
  responsavelId: z.string().nullable().optional(),
});

const createCommentSchema = z.object({
  conteudo: z
    .string()
    .trim()
    .min(2, 'Comentário deve ter pelo menos 2 caracteres.')
    .max(2000, 'Comentário deve ter no máximo 2000 caracteres.'),
  interno: z.boolean().default(false),
});

const createApiKeySchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, 'Nome da chave deve ter pelo menos 3 caracteres.')
    .max(80, 'Nome da chave deve ter no máximo 80 caracteres.'),
  scopes: z
    .array(z.enum(['tickets:read', 'tickets:write', 'webhooks:manage']))
    .min(1, 'Selecione pelo menos um escopo.')
    .default(['tickets:read', 'tickets:write']),
});

const createWebhookSchema = z.object({
  nome: z.string().trim().min(3).max(80),
  url: z
    .string()
    .trim()
    .url('Informe uma URL HTTP/HTTPS válida.')
    .refine(
      (u) => u.startsWith('http://') || u.startsWith('https://'),
      'A URL do webhook deve iniciar com http:// ou https://.',
    ),
  events: z
    .array(
      z.enum([
        'ticket.created',
        'ticket.updated',
        'ticket.status_changed',
        'ticket.commented',
      ]),
    )
    .min(1, 'Selecione pelo menos um evento.'),
});

const updateWebhookSchema = z.object({
  ativo: z.boolean().optional(),
  events: z
    .array(
      z.enum([
        'ticket.created',
        'ticket.updated',
        'ticket.status_changed',
        'ticket.commented',
      ]),
    )
    .min(1)
    .optional(),
});

function sendZodError(res: Response, issue: z.ZodError) {
  res.status(422).json({
    error: 'validation_error',
    message: 'Dados inválidos na requisição.',
    details: issue.issues.map((item) => ({
      campo: item.path.join('.') || 'body',
      mensagem: item.message,
    })),
  });
}

function enrichTicket(ticket: TicketRecord, requesterRole: UserRole) {
  const db = loadDb();
  const solicitante = db.users.find((u) => u.id === ticket.solicitanteId);
  const responsavel = ticket.responsavelId
    ? db.users.find((u) => u.id === ticket.responsavelId)
    : null;

  const visibleComments =
    requesterRole === 'cliente'
      ? ticket.comments.filter((c) => !c.interno)
      : ticket.comments;

  const isSlaBreached =
    !['resolvido', 'fechado'].includes(ticket.status) &&
    new Date(ticket.slaDueAt).getTime() < Date.now();

  return {
    ...ticket,
    comments: visibleComments,
    commentsCount: visibleComments.length,
    isSlaBreached,
    solicitante: solicitante ? sanitizeUser(solicitante) : null,
    responsavel: responsavel ? sanitizeUser(responsavel) : null,
  };
}

export function createApiRouter(): Router {
  const router = Router();
  const startedAt = Date.now();

  setApiKeyResolver((keyHash) => {
    const db = loadDb();
    const record = db.apiKeys.find((k) => k.keyHash === keyHash && k.ativo);
    if (!record) {
      return null;
    }
    const owner = db.users.find((u) => u.id === record.ownerId && u.ativo);
    if (!owner) {
      return null;
    }
    record.lastUsedAt = new Date().toISOString();
    saveDb(db);
    return {
      ownerId: owner.id,
      ownerNome: owner.nome,
      ownerEmail: owner.email,
      ownerPerfil: owner.perfil,
      scopes: record.scopes,
    };
  });

  const authRateLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    keyPrefix: 'auth',
  });

  const apiRateLimiter = rateLimit({
    windowMs: 60_000,
    max: 240,
    keyPrefix: 'api',
  });

  router.use(apiRateLimiter);

  router.get('/health', (_req, res) => {
    const db = loadDb();
    res.json({
      status: 'ok',
      service: 'ticketcore-api',
      author: 'Lfmaven',
      repository: 'https://github.com/Lfmaven/ticket_system',
      version: '1.2.0',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      totals: {
        users: db.users.length,
        tickets: db.tickets.length,
      },
    });
  });

  router.get('/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'TicketCore API — Lfmaven/ticket_system',
        version: '1.2.0',
        contact: {
          name: 'Lfmaven',
          url: 'https://github.com/Lfmaven/ticket_system',
        },
        description:
          'API RESTful desenvolvida e mantida por Lfmaven (ticket_system) com JWT HS256, scrypt, X-API-Key, webhooks HMAC-SHA256, Zod, RBAC e SLA automático.',
      },
      servers: [{ url: '/api/v1' }],
      paths: {
        '/health': { get: { summary: 'Healthcheck do serviço' } },
        '/auth/register': { post: { summary: 'Cadastro de novo cliente com hash scrypt e validação Zod' } },
        '/auth/login': { post: { summary: 'Autenticação e emissão de par accessToken + refreshToken' } },
        '/auth/refresh': { post: { summary: 'Renovação de accessToken via refreshToken' } },
        '/auth/me': { get: { summary: 'Perfil do usuário autenticado' } },
        '/users': { get: { summary: 'Listagem de usuários (Admin/Agente)' } },
        '/users/{id}/role': { patch: { summary: 'Alterar perfil RBAC ou status ativo (Admin)' } },
        '/tickets/stats': { get: { summary: 'Métricas agregadas de tickets e SLA' } },
        '/tickets/export': { get: { summary: 'Exportar tickets filtrados em CSV (Admin)' } },
        '/tickets': {
          get: { summary: 'Listar tickets com paginação, filtros e escopo RBAC' },
          post: { summary: 'Abrir novo ticket com SLA automático' },
        },
        '/tickets/{id}': {
          get: { summary: 'Detalhar ticket, comentários e auditoria' },
          patch: { summary: 'Atualizar ticket com máquina de estados' },
          delete: { summary: 'Excluir ticket (Admin ou dono enquanto aberto)' },
        },
        '/tickets/{id}/comments': {
          post: { summary: 'Adicionar comentário público ou nota interna de agente' },
        },
        '/api-keys': {
          get: { summary: 'Listar chaves de integração X-API-Key' },
          post: { summary: 'Gerar nova X-API-Key com escopos' },
        },
        '/webhooks': {
          get: { summary: 'Listar webhooks configurados' },
          post: { summary: 'Cadastrar endpoint de webhook assinado por HMAC-SHA256' },
        },
        '/webhooks/deliveries': {
          get: { summary: 'Consultar histórico de entregas de webhooks' },
        },
      },
    });
  });

  // --- AUTH ---
  router.post('/auth/register', authRateLimiter, (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }

    const db = loadDb();
    const exists = db.users.some((u) => u.email === parsed.data.email);
    if (exists) {
      res.status(409).json({
        error: 'email_conflict',
        message: 'Já existe uma conta cadastrada com este e-mail.',
      });
      return;
    }

    const now = new Date().toISOString();
    const user = {
      id: newId('usr'),
      nome: parsed.data.nome,
      email: parsed.data.email,
      senhaHash: hashPassword(parsed.data.senha),
      perfil: 'cliente' as const,
      ativo: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    db.users.push(user);
    saveDb(db);

    const tokens = issueTokenPair(user);
    res.status(201).json({
      message: 'Usuário cadastrado com sucesso.',
      user: sanitizeUser(user),
      ...tokens,
    });
  });

  router.post('/auth/login', authRateLimiter, (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }

    const db = loadDb();
    const user = db.users.find((u) => u.email === parsed.data.email);
    if (!user || !verifyPassword(parsed.data.senha, user.senhaHash)) {
      res.status(401).json({
        error: 'invalid_credentials',
        message: 'Credenciais inválidas.',
      });
      return;
    }

    if (!user.ativo) {
      res.status(403).json({
        error: 'account_disabled',
        message: 'Conta desativada pelo administrador.',
      });
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = user.lastLoginAt;
    saveDb(db);

    const tokens = issueTokenPair(user);
    res.json({
      message: 'Autenticação realizada com sucesso.',
      user: sanitizeUser(user),
      ...tokens,
    });
  });

  router.post('/auth/refresh', authRateLimiter, (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }

    try {
      const claims = verifyRefreshToken(parsed.data.refreshToken);
      const db = loadDb();
      const user = db.users.find((u) => u.id === claims.sub);
      if (!user || !user.ativo) {
        res.status(401).json({
          error: 'invalid_refresh_token',
          message: 'Usuário não encontrado ou inativo.',
        });
        return;
      }
      const tokens = issueTokenPair(user);
      res.json({
        user: sanitizeUser(user),
        ...tokens,
      });
    } catch {
      res.status(401).json({
        error: 'invalid_refresh_token',
        message: 'Refresh token inválido ou expirado.',
      });
    }
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = loadDb();
    const user = db.users.find((u) => u.id === req.auth?.sub);
    if (!user) {
      res.status(404).json({
        error: 'user_not_found',
        message: 'Usuário não encontrado.',
      });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  // --- USERS ---
  router.get(
    '/users',
    requireAuth,
    requireRoles('admin', 'agente'),
    (req: AuthenticatedRequest, res) => {
      const db = loadDb();
      const perfilFilter = typeof req.query.perfil === 'string' ? req.query.perfil : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

      let list = db.users.map(sanitizeUser);
      if (perfilFilter && ['admin', 'agente', 'cliente'].includes(perfilFilter)) {
        list = list.filter((u) => u.perfil === perfilFilter);
      }
      if (q) {
        list = list.filter(
          (u) =>
            u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        );
      }

      res.json({
        items: list,
        total: list.length,
      });
    },
  );

  router.patch(
    '/users/:id/role',
    requireAuth,
    requireRoles('admin'),
    (req: AuthenticatedRequest, res) => {
      const parsed = updateRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        sendZodError(res, parsed.error);
        return;
      }

      const db = loadDb();
      const target = db.users.find((u) => u.id === req.params.id);
      if (!target) {
        res.status(404).json({
          error: 'user_not_found',
          message: 'Usuário não encontrado.',
        });
        return;
      }

      if (
        target.perfil === 'admin' &&
        (parsed.data.perfil && parsed.data.perfil !== 'admin' || parsed.data.ativo === false)
      ) {
        const activeAdmins = db.users.filter(
          (u) => u.perfil === 'admin' && u.ativo,
        ).length;
        if (activeAdmins <= 1) {
          res.status(409).json({
            error: 'last_admin_protected',
            message: 'Não é possível remover ou desativar o último administrador ativo.',
          });
          return;
        }
      }

      if (parsed.data.perfil !== undefined) {
        target.perfil = parsed.data.perfil;
      }
      if (parsed.data.ativo !== undefined) {
        target.ativo = parsed.data.ativo;
      }
      target.updatedAt = new Date().toISOString();
      saveDb(db);

      res.json({
        message: 'Permissões do usuário atualizadas.',
        user: sanitizeUser(target),
      });
    },
  );

  // --- TICKETS ---
  router.get(
    '/tickets/stats',
    requireAuth,
    requireScope('tickets:read'),
    (req: AuthenticatedRequest, res) => {
    const db = loadDb();
    const auth = req.auth!;
    const scoped =
      auth.perfil === 'cliente'
        ? db.tickets.filter((t) => t.solicitanteId === auth.sub)
        : db.tickets;

    const byStatus: Record<TicketStatus, number> = {
      aberto: 0,
      em_andamento: 0,
      aguardando_cliente: 0,
      resolvido: 0,
      fechado: 0,
    };

    const byPriority: Record<TicketPriority, number> = {
      baixa: 0,
      media: 0,
      alta: 0,
      critica: 0,
    };

    let slaBreached = 0;
    let totalResolutionMs = 0;
    let resolvedCount = 0;

    for (const ticket of scoped) {
      byStatus[ticket.status] += 1;
      byPriority[ticket.prioridade] += 1;

      if (
        !['resolvido', 'fechado'].includes(ticket.status) &&
        new Date(ticket.slaDueAt).getTime() < Date.now()
      ) {
        slaBreached += 1;
      }

      if (ticket.resolvedAt) {
        const diff =
          new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime();
        if (diff >= 0) {
          totalResolutionMs += diff;
          resolvedCount += 1;
        }
      }
    }

    const openActive =
      byStatus.aberto + byStatus.em_andamento + byStatus.aguardando_cliente;

    res.json({
      total: scoped.length,
      openActive,
      slaBreached,
      avgResolutionHours:
        resolvedCount > 0
          ? Number((totalResolutionMs / resolvedCount / 3600_000).toFixed(1))
          : 0,
      byStatus,
      byPriority,
    });
  });

  function applyTicketFilters(
    tickets: TicketRecord[],
    query: Record<string, unknown>,
  ): TicketRecord[] {
    let list = [...tickets];
    const status = typeof query.status === 'string' ? query.status : '';
    const priority = typeof query.priority === 'string' ? query.priority : '';
    const category = typeof query.category === 'string' ? query.category : '';
    const assignedTo = typeof query.assignedTo === 'string' ? query.assignedTo : '';
    const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
    const sort = typeof query.sort === 'string' ? query.sort : 'updatedAt';

    if (status && status !== 'todos') {
      list = list.filter((t) => t.status === status);
    }
    if (priority && priority !== 'todas') {
      list = list.filter((t) => t.prioridade === priority);
    }
    if (category && category !== 'todas') {
      list = list.filter((t) => t.categoria === category);
    }
    if (assignedTo === 'unassigned') {
      list = list.filter((t) => !t.responsavelId);
    } else if (assignedTo) {
      list = list.filter((t) => t.responsavelId === assignedTo);
    }
    if (q) {
      list = list.filter(
        (t) =>
          t.codigo.toLowerCase().includes(q) ||
          t.titulo.toLowerCase().includes(q) ||
          t.descricao.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      if (sort === 'priority') {
        return PRIORITY_WEIGHT[b.prioridade] - PRIORITY_WEIGHT[a.prioridade];
      }
      if (sort === 'slaDueAt') {
        return new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime();
      }
      if (sort === 'createdAt') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return list;
  }

  function escapeCsvCell(value: string | number | boolean | null | undefined): string {
    const raw = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n;]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  router.get(
    '/tickets/export',
    requireAuth,
    requireRoles('admin'),
    (req: AuthenticatedRequest, res) => {
      const db = loadDb();
      const filtered = applyTicketFilters(
        db.tickets,
        req.query as Record<string, unknown>,
      );

      const header = [
        'Código',
        'Título',
        'Status',
        'Prioridade',
        'Categoria',
        'Solicitante',
        'E-mail Solicitante',
        'Responsável',
        'Prazo SLA',
        'SLA Vencido',
        'Criado em',
        'Atualizado em',
      ];

      const rows = filtered.map((t) => {
        const enriched = enrichTicket(t, 'admin');
        return [
          enriched.codigo,
          enriched.titulo,
          enriched.status,
          enriched.prioridade,
          enriched.categoria,
          enriched.solicitante?.nome || '',
          enriched.solicitante?.email || '',
          enriched.responsavel?.nome || 'Não atribuído',
          enriched.slaDueAt,
          enriched.isSlaBreached ? 'Sim' : 'Não',
          enriched.createdAt,
          enriched.updatedAt,
        ]
          .map(escapeCsvCell)
          .join(',');
      });

      const csvContent = `\uFEFF${[header.map(escapeCsvCell).join(','), ...rows].join('\r\n')}`;
      const dateSuffix = new Date().toISOString().slice(0, 10);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="tickets-${dateSuffix}.csv"`,
      );
      res.send(csvContent);
    },
  );

  router.get(
    '/tickets',
    requireAuth,
    requireScope('tickets:read'),
    (req: AuthenticatedRequest, res) => {
    const db = loadDb();
    const auth = req.auth!;

    let list =
      auth.perfil === 'cliente'
        ? db.tickets.filter((t) => t.solicitanteId === auth.sub)
        : [...db.tickets];

    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const priority = typeof req.query.priority === 'string' ? req.query.priority : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const assignedTo =
      typeof req.query.assignedTo === 'string' ? req.query.assignedTo : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'updatedAt';

    if (status && status !== 'todos') {
      list = list.filter((t) => t.status === status);
    }
    if (priority && priority !== 'todas') {
      list = list.filter((t) => t.prioridade === priority);
    }
    if (category && category !== 'todas') {
      list = list.filter((t) => t.categoria === category);
    }
    if (assignedTo === 'unassigned') {
      list = list.filter((t) => !t.responsavelId);
    } else if (assignedTo) {
      list = list.filter((t) => t.responsavelId === assignedTo);
    }
    if (q) {
      list = list.filter(
        (t) =>
          t.codigo.toLowerCase().includes(q) ||
          t.titulo.toLowerCase().includes(q) ||
          t.descricao.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      if (sort === 'priority') {
        return PRIORITY_WEIGHT[b.prioridade] - PRIORITY_WEIGHT[a.prioridade];
      }
      if (sort === 'slaDueAt') {
        return new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime();
      }
      if (sort === 'createdAt') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const paged = list.slice(offset, offset + limit).map((t) => enrichTicket(t, auth.perfil));

    res.json({
      items: paged,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  });

  router.post(
    '/tickets',
    requireAuth,
    requireScope('tickets:write'),
    (req: AuthenticatedRequest, res) => {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }

    const db = loadDb();
    const auth = req.auth!;
    const now = new Date().toISOString();

    const ticket: TicketRecord = {
      id: newId('tck'),
      codigo: nextTicketCode(db),
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao,
      status: 'aberto',
      prioridade: parsed.data.prioridade,
      categoria: parsed.data.categoria,
      solicitanteId: auth.sub,
      responsavelId: null,
      slaDueAt: computeSlaDueAt(now, parsed.data.prioridade),
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
      comments: [],
      history: [
        {
          id: newId('evt'),
          actorId: auth.sub,
          actorNome: auth.nome,
          campo: 'criacao',
          valorAnterior: null,
          valorNovo: 'aberto',
          createdAt: now,
        },
      ],
    };

    db.tickets.unshift(ticket);
    saveDb(db);

    const enriched = enrichTicket(ticket, auth.perfil);
    dispatchWebhookEvent('ticket.created', { ticket: enriched });

    res.status(201).json({
      message: 'Ticket criado com sucesso.',
      ticket: enriched,
    });
  });

  router.get(
    '/tickets/:id',
    requireAuth,
    requireScope('tickets:read'),
    (req: AuthenticatedRequest, res) => {
    const db = loadDb();
    const auth = req.auth!;
    const ticket = db.tickets.find(
      (t) => t.id === req.params.id || t.codigo === req.params.id,
    );

    if (!ticket) {
      res.status(404).json({
        error: 'ticket_not_found',
        message: 'Ticket não encontrado.',
      });
      return;
    }

    if (auth.perfil === 'cliente' && ticket.solicitanteId !== auth.sub) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Clientes só podem visualizar os próprios tickets.',
      });
      return;
    }

    res.json({ ticket: enrichTicket(ticket, auth.perfil) });
  });

  router.patch(
    '/tickets/:id',
    requireAuth,
    requireScope('tickets:write'),
    (req: AuthenticatedRequest, res) => {
    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error);
      return;
    }

    const db = loadDb();
    const auth = req.auth!;
    const ticket = db.tickets.find(
      (t) => t.id === req.params.id || t.codigo === req.params.id,
    );

    if (!ticket) {
      res.status(404).json({
        error: 'ticket_not_found',
        message: 'Ticket não encontrado.',
      });
      return;
    }

    if (auth.perfil === 'cliente' && ticket.solicitanteId !== auth.sub) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Sem permissão para alterar este ticket.',
      });
      return;
    }

    const isStaff = auth.perfil === 'admin' || auth.perfil === 'agente';
    if (!isStaff) {
      if (
        parsed.data.responsavelId !== undefined ||
        parsed.data.prioridade !== undefined
      ) {
        res.status(403).json({
          error: 'forbidden',
          message: 'Apenas agentes ou administradores podem atribuir responsável ou alterar prioridade.',
        });
        return;
      }
      if (
        parsed.data.status !== undefined &&
        !(ticket.status === 'resolvido' && parsed.data.status === 'aberto') &&
        parsed.data.status !== 'fechado'
      ) {
        res.status(403).json({
          error: 'forbidden',
          message: 'Clientes podem apenas reabrir tickets resolvidos ou encerrar seus próprios tickets.',
        });
        return;
      }
    }

    const now = new Date().toISOString();

    if (parsed.data.status && parsed.data.status !== ticket.status) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[ticket.status];
      if (!allowed.includes(parsed.data.status)) {
        res.status(409).json({
          error: 'invalid_status_transition',
          message: `Transição inválida de "${ticket.status}" para "${parsed.data.status}". Permitidas: ${allowed.join(', ')}.`,
        });
        return;
      }

      ticket.history.push({
        id: newId('evt'),
        actorId: auth.sub,
        actorNome: auth.nome,
        campo: 'status',
        valorAnterior: ticket.status,
        valorNovo: parsed.data.status,
        createdAt: now,
      });

      ticket.status = parsed.data.status;
      if (parsed.data.status === 'resolvido') {
        ticket.resolvedAt = now;
      } else if (parsed.data.status === 'aberto') {
        ticket.resolvedAt = null;
      }
    }

    if (parsed.data.prioridade && parsed.data.prioridade !== ticket.prioridade) {
      ticket.history.push({
        id: newId('evt'),
        actorId: auth.sub,
        actorNome: auth.nome,
        campo: 'prioridade',
        valorAnterior: ticket.prioridade,
        valorNovo: parsed.data.prioridade,
        createdAt: now,
      });
      ticket.prioridade = parsed.data.prioridade;
      ticket.slaDueAt = computeSlaDueAt(ticket.createdAt, parsed.data.prioridade);
    }

    if (parsed.data.categoria && parsed.data.categoria !== ticket.categoria) {
      ticket.history.push({
        id: newId('evt'),
        actorId: auth.sub,
        actorNome: auth.nome,
        campo: 'categoria',
        valorAnterior: ticket.categoria,
        valorNovo: parsed.data.categoria,
        createdAt: now,
      });
      ticket.categoria = parsed.data.categoria;
    }

    if (parsed.data.responsavelId !== undefined && parsed.data.responsavelId !== ticket.responsavelId) {
      if (parsed.data.responsavelId !== null) {
        const assignee = db.users.find(
          (u) => u.id === parsed.data.responsavelId && (u.perfil === 'admin' || u.perfil === 'agente'),
        );
        if (!assignee) {
          res.status(400).json({
            error: 'invalid_assignee',
            message: 'Responsável informado não existe ou não possui perfil de agente/admin.',
          });
          return;
        }
      }

      ticket.history.push({
        id: newId('evt'),
        actorId: auth.sub,
        actorNome: auth.nome,
        campo: 'responsavelId',
        valorAnterior: ticket.responsavelId,
        valorNovo: parsed.data.responsavelId,
        createdAt: now,
      });
      ticket.responsavelId = parsed.data.responsavelId;
    }

    if (parsed.data.titulo && parsed.data.titulo !== ticket.titulo) {
      ticket.titulo = parsed.data.titulo;
    }
    if (parsed.data.descricao && parsed.data.descricao !== ticket.descricao) {
      ticket.descricao = parsed.data.descricao;
    }

    const previousStatus = ticket.status;
    ticket.updatedAt = now;
    saveDb(db);

    const enriched = enrichTicket(ticket, auth.perfil);
    if (parsed.data.status && parsed.data.status !== previousStatus) {
      dispatchWebhookEvent('ticket.status_changed', {
        ticket: enriched,
        previousStatus,
        newStatus: ticket.status,
      });
    } else {
      dispatchWebhookEvent('ticket.updated', { ticket: enriched });
    }

    res.json({
      message: 'Ticket atualizado com sucesso.',
      ticket: enriched,
    });
  });

  router.delete(
    '/tickets/:id',
    requireAuth,
    requireScope('tickets:write'),
    (req: AuthenticatedRequest, res) => {
    const db = loadDb();
    const auth = req.auth!;
    const idx = db.tickets.findIndex(
      (t) => t.id === req.params.id || t.codigo === req.params.id,
    );

    if (idx === -1) {
      res.status(404).json({
        error: 'ticket_not_found',
        message: 'Ticket não encontrado.',
      });
      return;
    }

    const ticket = db.tickets[idx];
    const isAdmin = auth.perfil === 'admin';
    const isOwnerDeletable =
      ticket.solicitanteId === auth.sub &&
      ticket.status === 'aberto' &&
      !ticket.responsavelId;

    if (!isAdmin && !isOwnerDeletable) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Apenas administradores podem excluir tickets em andamento ou de terceiros.',
      });
      return;
    }

    db.tickets.splice(idx, 1);
    saveDb(db);

    res.json({
      message: `Ticket ${ticket.codigo} removido com sucesso.`,
      deletedId: ticket.id,
    });
  });

  router.post(
    '/tickets/:id/comments',
    requireAuth,
    requireScope('tickets:write'),
    (req: AuthenticatedRequest, res) => {
      const parsed = createCommentSchema.safeParse(req.body);
      if (!parsed.success) {
        sendZodError(res, parsed.error);
        return;
      }

      const db = loadDb();
      const auth = req.auth!;
      const ticket = db.tickets.find(
        (t) => t.id === req.params.id || t.codigo === req.params.id,
      );

      if (!ticket) {
        res.status(404).json({
          error: 'ticket_not_found',
          message: 'Ticket não encontrado.',
        });
        return;
      }

      if (auth.perfil === 'cliente' && ticket.solicitanteId !== auth.sub) {
        res.status(403).json({
          error: 'forbidden',
          message: 'Sem permissão para comentar neste ticket.',
        });
        return;
      }

      const isInternal = auth.perfil === 'cliente' ? false : parsed.data.interno;
      const now = new Date().toISOString();

      const comment = {
        id: newId('cmt'),
        ticketId: ticket.id,
        authorId: auth.sub,
        authorNome: auth.nome,
        authorPerfil: auth.perfil,
        conteudo: parsed.data.conteudo,
        interno: isInternal,
        createdAt: now,
      };

      ticket.comments.push(comment);
      ticket.history.push({
        id: newId('evt'),
        actorId: auth.sub,
        actorNome: auth.nome,
        campo: isInternal ? 'nota_interna' : 'comentario',
        valorAnterior: null,
        valorNovo: comment.id,
        createdAt: now,
      });
      ticket.updatedAt = now;
      saveDb(db);

      const enriched = enrichTicket(ticket, auth.perfil);
      if (!isInternal) {
        dispatchWebhookEvent('ticket.commented', {
          ticket: enriched,
          comment,
        });
      }

      res.status(201).json({
        message: 'Comentário registrado.',
        comment,
        ticket: enriched,
      });
    },
  );

  // --- API KEYS (Machine-to-Machine Integration) ---
  router.get(
    '/api-keys',
    requireAuth,
    requireRoles('admin', 'agente'),
    (req: AuthenticatedRequest, res) => {
      const db = loadDb();
      const auth = req.auth!;
      const visible =
        auth.perfil === 'admin'
          ? db.apiKeys
          : db.apiKeys.filter((k) => k.ownerId === auth.sub);
      res.json({
        items: visible.map(sanitizeApiKey),
        total: visible.length,
      });
    },
  );

  router.post(
    '/api-keys',
    requireAuth,
    requireRoles('admin', 'agente'),
    (req: AuthenticatedRequest, res) => {
      const parsed = createApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        sendZodError(res, parsed.error);
        return;
      }

      const db = loadDb();
      const auth = req.auth!;
      const { rawKey, prefix, keyHash } = generateApiKey();
      const now = new Date().toISOString();

      const record = {
        id: newId('key'),
        nome: parsed.data.nome,
        prefix,
        keyHash,
        ownerId: auth.sub,
        ownerNome: auth.nome,
        ownerPerfil: auth.perfil,
        scopes: parsed.data.scopes,
        ativo: true,
        createdAt: now,
        lastUsedAt: null,
      };

      db.apiKeys.unshift(record);
      saveDb(db);

      res.status(201).json({
        message: 'Chave de API criada. Guarde o segredo agora; ele não será exibido novamente.',
        apiKey: sanitizeApiKey(record),
        secretKey: rawKey,
      });
    },
  );

  router.delete(
    '/api-keys/:id',
    requireAuth,
    requireRoles('admin', 'agente'),
    (req: AuthenticatedRequest, res) => {
      const db = loadDb();
      const auth = req.auth!;
      const target = db.apiKeys.find((k) => k.id === req.params.id);
      if (!target) {
        res.status(404).json({
          error: 'api_key_not_found',
          message: 'Chave de API não encontrada.',
        });
        return;
      }
      if (auth.perfil !== 'admin' && target.ownerId !== auth.sub) {
        res.status(403).json({
          error: 'forbidden',
          message: 'Sem permissão para revogar esta chave.',
        });
        return;
      }

      target.ativo = false;
      saveDb(db);

      res.json({
        message: 'Chave de API revogada.',
        apiKey: sanitizeApiKey(target),
      });
    },
  );

  // --- WEBHOOKS ---
  router.get(
    '/webhooks',
    requireAuth,
    requireScope('webhooks:manage'),
    requireRoles('admin', 'agente'),
    (_req, res) => {
      const db = loadDb();
      res.json({
        items: db.webhooks.map(sanitizeWebhook),
        total: db.webhooks.length,
      });
    },
  );

  router.get(
    '/webhooks/deliveries',
    requireAuth,
    requireScope('webhooks:manage'),
    requireRoles('admin', 'agente'),
    (_req, res) => {
      const db = loadDb();
      res.json({
        items: db.webhookDeliveries,
        total: db.webhookDeliveries.length,
      });
    },
  );

  router.post(
    '/webhooks',
    requireAuth,
    requireScope('webhooks:manage'),
    requireRoles('admin', 'agente'),
    (req: AuthenticatedRequest, res) => {
      const parsed = createWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        sendZodError(res, parsed.error);
        return;
      }

      const db = loadDb();
      const auth = req.auth!;
      const record = {
        id: newId('whk'),
        nome: parsed.data.nome,
        url: parsed.data.url,
        secret: generateWebhookSecret(),
        events: parsed.data.events,
        ativo: true,
        createdAt: new Date().toISOString(),
        createdBy: auth.nome,
      };

      db.webhooks.unshift(record);
      saveDb(db);

      res.status(201).json({
        message: 'Webhook cadastrado com sucesso.',
        webhook: sanitizeWebhook(record),
        signingSecret: record.secret,
      });
    },
  );

  router.patch(
    '/webhooks/:id',
    requireAuth,
    requireScope('webhooks:manage'),
    requireRoles('admin', 'agente'),
    (req, res) => {
      const parsed = updateWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        sendZodError(res, parsed.error);
        return;
      }
      const db = loadDb();
      const wh = db.webhooks.find((w) => w.id === req.params.id);
      if (!wh) {
        res.status(404).json({
          error: 'webhook_not_found',
          message: 'Webhook não encontrado.',
        });
        return;
      }
      if (parsed.data.ativo !== undefined) wh.ativo = parsed.data.ativo;
      if (parsed.data.events !== undefined) wh.events = parsed.data.events;
      saveDb(db);
      res.json({ webhook: sanitizeWebhook(wh) });
    },
  );

  router.delete(
    '/webhooks/:id',
    requireAuth,
    requireScope('webhooks:manage'),
    requireRoles('admin', 'agente'),
    (req, res) => {
      const db = loadDb();
      const idx = db.webhooks.findIndex((w) => w.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({
          error: 'webhook_not_found',
          message: 'Webhook não encontrado.',
        });
        return;
      }
      const [removed] = db.webhooks.splice(idx, 1);
      saveDb(db);
      res.json({
        message: 'Webhook removido.',
        deletedId: removed.id,
      });
    },
  );

  router.post(
    '/webhooks/:id/test',
    requireAuth,
    requireScope('webhooks:manage'),
    requireRoles('admin', 'agente'),
    async (req, res) => {
      const db = loadDb();
      const wh = db.webhooks.find((w) => w.id === req.params.id);
      if (!wh) {
        res.status(404).json({
          error: 'webhook_not_found',
          message: 'Webhook não encontrado.',
        });
        return;
      }
      const delivery = await dispatchWebhookTest(wh);
      res.json({
        message: delivery.success
          ? 'Webhook entregue com sucesso.'
          : 'Falha na entrega do webhook de teste.',
        delivery,
      });
    },
  );

  // Built-in loopback receiver so developers can test HMAC webhooks directly
  router.post('/webhooks/sink-echo', (req, res) => {
    res.status(200).json({
      received: true,
      event: req.headers['x-ticketcore-event'] || 'unknown',
      deliveryId: req.headers['x-ticketcore-delivery'] || null,
      signaturePresent: Boolean(req.headers['x-ticketcore-signature']),
      receivedAt: new Date().toISOString(),
    });
  });

  // Unknown API routes return clean JSON 404
  router.use((_req, res) => {
    res.status(404).json({
      error: 'endpoint_not_found',
      message: 'Rota da API não encontrada. Consulte /api/v1/openapi.json.',
    });
  });

  return router;
}
