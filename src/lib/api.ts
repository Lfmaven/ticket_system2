import type {
  ApiKeyDTO,
  ApiKeyScope,
  AuthSession,
  TicketCategory,
  TicketDTO,
  TicketPriority,
  TicketStats,
  TicketStatus,
  UserDTO,
  UserRole,
  WebhookDTO,
  WebhookDeliveryLog,
  WebhookEventType,
} from '../types';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Array<{ campo: string; mensagem: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Array<{ campo: string; mensagem: string }>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data.error || 'request_failed',
      data.message || 'Erro ao comunicar com a API.',
      data.details,
    );
  }
  return data as T;
}

export async function loginRequest(email: string, senha: string): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  });
}

export async function registerRequest(
  nome: string,
  email: string,
  senha: string,
): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ nome, email, senha }),
  });
}

export async function refreshTokenRequest(refreshToken: string): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function fetchMe(token: string): Promise<{ user: UserDTO }> {
  return apiFetch<{ user: UserDTO }>('/auth/me', { token });
}

export async function fetchTickets(
  token: string,
  params: {
    status?: string;
    priority?: string;
    category?: string;
    q?: string;
    sort?: string;
    page?: number;
    limit?: number;
  },
): Promise<{
  items: TicketDTO[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}> {
  const qs = new URLSearchParams();
  if (params.status && params.status !== 'todos') qs.set('status', params.status);
  if (params.priority && params.priority !== 'todas') qs.set('priority', params.priority);
  if (params.category && params.category !== 'todas') qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch(`/tickets${query ? `?${query}` : ''}`, { token });
}

export async function fetchTicketStats(token: string): Promise<TicketStats> {
  return apiFetch<TicketStats>('/tickets/stats', { token });
}

export async function fetchTicketById(
  token: string,
  id: string,
): Promise<{ ticket: TicketDTO }> {
  return apiFetch<{ ticket: TicketDTO }>(`/tickets/${encodeURIComponent(id)}`, {
    token,
  });
}

export async function createTicket(
  token: string,
  payload: {
    titulo: string;
    descricao: string;
    prioridade: TicketPriority;
    categoria: TicketCategory;
  },
): Promise<{ ticket: TicketDTO }> {
  return apiFetch<{ ticket: TicketDTO }>('/tickets', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export async function updateTicket(
  token: string,
  id: string,
  payload: {
    titulo?: string;
    descricao?: string;
    status?: TicketStatus;
    prioridade?: TicketPriority;
    categoria?: TicketCategory;
    responsavelId?: string | null;
  },
): Promise<{ ticket: TicketDTO }> {
  return apiFetch<{ ticket: TicketDTO }>(`/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  });
}

export async function deleteTicket(
  token: string,
  id: string,
): Promise<{ message: string; deletedId: string }> {
  return apiFetch<{ message: string; deletedId: string }>(
    `/tickets/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export async function addTicketComment(
  token: string,
  id: string,
  payload: { conteudo: string; interno: boolean },
): Promise<{ ticket: TicketDTO }> {
  return apiFetch<{ ticket: TicketDTO }>(
    `/tickets/${encodeURIComponent(id)}/comments`,
    {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchUsers(
  token: string,
  params?: { perfil?: string; q?: string },
): Promise<{ items: UserDTO[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.perfil) qs.set('perfil', params.perfil);
  if (params?.q) qs.set('q', params.q);
  const query = qs.toString();
  return apiFetch(`/users${query ? `?${query}` : ''}`, { token });
}

export async function updateUserRole(
  token: string,
  id: string,
  payload: { perfil?: UserRole; ativo?: boolean },
): Promise<{ user: UserDTO }> {
  return apiFetch<{ user: UserDTO }>(`/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  });
}

export async function exportTicketsCsv(
  token: string,
  params: {
    status?: string;
    priority?: string;
    category?: string;
    q?: string;
  },
): Promise<void> {
  const qs = new URLSearchParams();
  if (params.status && params.status !== 'todos') qs.set('status', params.status);
  if (params.priority && params.priority !== 'todas') qs.set('priority', params.priority);
  if (params.category && params.category !== 'todas') qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  const query = qs.toString();

  const res = await fetch(`/api/v1/tickets/export${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      data.error || 'export_failed',
      data.message || 'Falha ao exportar tickets em CSV.',
    );
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateSuffix = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `tickets-${dateSuffix}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface RawApiResponse {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: unknown;
}

export async function executeRawApiRequest(params: {
  method: string;
  path: string;
  token?: string;
  bodyText?: string;
}): Promise<RawApiResponse> {
  const start = performance.now();
  const headers: Record<string, string> = {};
  if (params.token) {
    headers.Authorization = `Bearer ${params.token}`;
  }
  if (params.bodyText && ['POST', 'PATCH', 'PUT'].includes(params.method)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`/api/v1${params.path}`, {
    method: params.method,
    headers,
    body:
      params.bodyText && ['POST', 'PATCH', 'PUT'].includes(params.method)
        ? params.bodyText
        : undefined,
  });

  const durationMs = Number((performance.now() - start).toFixed(1));
  const rawHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    rawHeaders[key] = value;
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep text as-is if non-JSON
  }

  return {
    status: res.status,
    statusText: res.statusText,
    durationMs,
    headers: rawHeaders,
    body: parsed,
  };
}

export async function fetchApiKeys(
  token: string,
): Promise<{ items: ApiKeyDTO[]; total: number }> {
  return apiFetch('/api-keys', { token });
}

export async function createApiKey(
  token: string,
  payload: { nome: string; scopes: ApiKeyScope[] },
): Promise<{ apiKey: ApiKeyDTO; secretKey: string; message: string }> {
  return apiFetch('/api-keys', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export async function revokeApiKey(
  token: string,
  id: string,
): Promise<{ apiKey: ApiKeyDTO; message: string }> {
  return apiFetch(`/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchWebhooks(
  token: string,
): Promise<{ items: WebhookDTO[]; total: number }> {
  return apiFetch('/webhooks', { token });
}

export async function createWebhook(
  token: string,
  payload: {
    nome: string;
    url: string;
    events: Exclude<WebhookEventType, 'webhook.test'>[];
  },
): Promise<{ webhook: WebhookDTO; signingSecret: string; message: string }> {
  return apiFetch('/webhooks', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export async function deleteWebhook(
  token: string,
  id: string,
): Promise<{ deletedId: string }> {
  return apiFetch(`/webhooks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

export async function testWebhook(
  token: string,
  id: string,
): Promise<{ delivery: WebhookDeliveryLog; message: string }> {
  return apiFetch(`/webhooks/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    token,
  });
}

export async function fetchWebhookDeliveries(
  token: string,
): Promise<{ items: WebhookDeliveryLog[]; total: number }> {
  return apiFetch('/webhooks/deliveries', { token });
}

export async function createTicketWithApiKey(
  apiKey: string,
  payload: {
    titulo: string;
    descricao: string;
    prioridade: TicketPriority;
    categoria: TicketCategory;
  },
): Promise<{ ticket: TicketDTO }> {
  return apiFetch('/tickets', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(payload),
  });
}
