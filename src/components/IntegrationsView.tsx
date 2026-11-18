import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, Plus, Send, Trash2, Webhook } from 'lucide-react';
import {
  ApiError,
  createApiKey,
  createTicketWithApiKey,
  createWebhook,
  deleteWebhook,
  fetchApiKeys,
  fetchWebhookDeliveries,
  fetchWebhooks,
  revokeApiKey,
  testWebhook,
} from '../lib/api';
import type {
  ApiKeyDTO,
  ApiKeyScope,
  TicketCategory,
  TicketPriority,
  UserDTO,
  WebhookDTO,
  WebhookDeliveryLog,
  WebhookEventType,
} from '../types';

interface IntegrationsViewProps {
  currentUser: UserDTO | null;
  token: string | null;
  onTicketCreatedFromWidget: () => void;
}

type SdkLang = 'typescript' | 'react' | 'python' | 'curl';

const ALL_SCOPES: Array<{ value: ApiKeyScope; label: string }> = [
  { value: 'tickets:read', label: 'tickets:read (Listar e ler chamados)' },
  { value: 'tickets:write', label: 'tickets:write (Criar, atualizar e comentar)' },
  { value: 'webhooks:manage', label: 'webhooks:manage (Configurar webhooks)' },
];

const ALL_EVENTS: Array<{
  value: Exclude<WebhookEventType, 'webhook.test'>;
  label: string;
}> = [
  { value: 'ticket.created', label: 'ticket.created' },
  { value: 'ticket.status_changed', label: 'ticket.status_changed' },
  { value: 'ticket.updated', label: 'ticket.updated' },
  { value: 'ticket.commented', label: 'ticket.commented' },
];

export function IntegrationsView({
  currentUser,
  token,
  onTicketCreatedFromWidget,
}: IntegrationsViewProps) {
  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1`
      : 'https://seu-app.run.app/api/v1';

  const [apiKeys, setApiKeys] = useState<ApiKeyDTO[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookDTO[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // API Key creation state
  const [keyName, setKeyName] = useState('App Web Produção');
  const [keyScopes, setKeyScopes] = useState<ApiKeyScope[]>([
    'tickets:read',
    'tickets:write',
  ]);
  const [createdSecretKey, setCreatedSecretKey] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Webhook creation state
  const [whName, setWhName] = useState('Receptor Sandbox Seguro');
  const [whUrl, setWhUrl] = useState('internal://sink-echo');
  const [whEvents, setWhEvents] = useState<
    Array<Exclude<WebhookEventType, 'webhook.test'>>
  >(['ticket.created', 'ticket.status_changed', 'ticket.commented']);
  const [createdWhSecret, setCreatedWhSecret] = useState<string | null>(null);

  // SDK snippet selector
  const [sdkLang, setSdkLang] = useState<SdkLang>('typescript');
  const [copiedSdk, setCopiedSdk] = useState(false);

  // Widget Simulator
  const [simApiKey, setSimApiKey] = useState('');
  const [simTitulo, setSimTitulo] = useState(
    'Erro no checkout via integração mobile',
  );
  const [simDescricao, setSimDescricao] = useState(
    'Cliente reportou falha ao finalizar pagamento no app iOS v2.4.',
  );
  const [simPrioridade, setSimPrioridade] = useState<TicketPriority>('alta');
  const [simCategoria, setSimCategoria] = useState<TicketCategory>('bug');
  const [simResult, setSimResult] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const isStaff =
    currentUser?.perfil === 'admin' || currentUser?.perfil === 'agente';

  const loadAll = useCallback(async () => {
    if (!token || !isStaff) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [keysRes, whRes, dlvRes] = await Promise.all([
        fetchApiKeys(token),
        fetchWebhooks(token),
        fetchWebhookDeliveries(token),
      ]);
      setApiKeys(keysRes.items);
      setWebhooks(whRes.items);
      setDeliveries(dlvRes.items);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Erro ao carregar dados de integração.',
      );
    } finally {
      setLoading(false);
    }
  }, [token, isStaff]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateApiKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusyAction(true);
    setErrorMsg(null);
    try {
      const res = await createApiKey(token, {
        nome: keyName,
        scopes: keyScopes,
      });
      setCreatedSecretKey(res.secretKey);
      setSimApiKey(res.secretKey);
      setCopiedSecret(false);
      await loadAll();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Erro ao gerar API Key.',
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!token) return;
    setBusyAction(true);
    try {
      await revokeApiKey(token, id);
      await loadAll();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Erro ao revogar chave.',
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateWebhook = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusyAction(true);
    setErrorMsg(null);
    try {
      const res = await createWebhook(token, {
        nome: whName,
        url: whUrl,
        events: whEvents,
      });
      setCreatedWhSecret(res.signingSecret);
      await loadAll();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Erro ao cadastrar webhook.',
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleTestWebhook = async (id: string) => {
    if (!token) return;
    setBusyAction(true);
    setErrorMsg(null);
    try {
      await testWebhook(token, id);
      await loadAll();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Erro ao testar webhook.',
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!token) return;
    setBusyAction(true);
    try {
      await deleteWebhook(token, id);
      await loadAll();
    } finally {
      setBusyAction(false);
    }
  };

  const handleWidgetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    setSimResult(null);
    setErrorMsg(null);
    try {
      const res = await createTicketWithApiKey(simApiKey.trim(), {
        titulo: simTitulo,
        descricao: simDescricao,
        prioridade: simPrioridade,
        categoria: simCategoria,
      });
      setSimResult(
        `Ticket ${res.ticket.codigo} criado com sucesso via X-API-Key! SLA até ${new Date(
          res.ticket.slaDueAt,
        ).toLocaleString('pt-BR')}.`,
      );
      onTicketCreatedFromWidget();
      await loadAll();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Erro ao testar criação via X-API-Key.',
      );
    } finally {
      setBusyAction(false);
    }
  };

  const activeKeyPlaceholder =
    createdSecretKey || simApiKey || 'tc_live_sua_chave_aqui';

  const sdkCode = useMemo(() => {
    if (sdkLang === 'typescript') {
      return `// ticketcore-sdk.ts — Cliente pronto para Apps Web, Node.js ou React Native
export class TicketCoreClient {
  constructor(
    private baseUrl = "${baseUrl}",
    private apiKey = "${activeKeyPlaceholder}"
  ) {}

  async createTicket(input: {
    titulo: string;
    descricao: string;
    prioridade?: "baixa" | "media" | "alta" | "critica";
    categoria?: "bug" | "acesso" | "financeiro" | "infraestrutura" | "duvida";
  }) {
    const res = await fetch(\`\${this.baseUrl}/tickets\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async listTickets(status = "todos") {
    const res = await fetch(\`\${this.baseUrl}/tickets?status=\${status}\`, {
      headers: { "X-API-Key": this.apiKey },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
}`;
    }

    if (sdkLang === 'react') {
      return `// useSupportTicket.tsx — Hook React para abrir chamados direto do seu App
import { useState } from "react";

export function useSupportTicket(apiKey: string) {
  const [loading, setLoading] = useState(false);

  async function submitTicket(titulo: string, descricao: string) {
    setLoading(true);
    try {
      const res = await fetch("${baseUrl}/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          titulo,
          descricao,
          prioridade: "media",
          categoria: "bug",
        }),
      });
      return await res.json();
    } finally {
      setLoading(false);
    }
  }

  return { submitTicket, loading };
}`;
    }

    if (sdkLang === 'python') {
      return `# ticketcore_client.py — Integração Python (Flask / FastAPI / Scripts)
import requests

BASE_URL = "${baseUrl}"
HEADERS = {
    "X-API-Key": "${activeKeyPlaceholder}",
    "Content-Type": "application/json",
}

resp = requests.post(
    f"{BASE_URL}/tickets",
    headers=HEADERS,
    json={
        "titulo": "Falha ao sincronizar pedido #4921",
        "descricao": "Gateway retornou timeout durante confirmação.",
        "prioridade": "alta",
        "categoria": "bug",
    },
    timeout=10,
)
resp.raise_for_status()
print(resp.json()["ticket"]["codigo"])`;
    }

    return `curl -X POST "${baseUrl}/tickets" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${activeKeyPlaceholder}" \\
  -d '{
    "titulo": "Erro de integração no app parceiro",
    "descricao": "Payload retornou 422 ao enviar webhook.",
    "prioridade": "alta",
    "categoria": "bug"
  }'`;
  }, [sdkLang, baseUrl, activeKeyPlaceholder]);

  if (!currentUser || !token) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        Faça login para acessar chaves de API, webhooks e SDKs de integração.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Intro & Base URL */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Integrações para Aplicativos, Backends e Webhooks
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl">
              Conecte aplicativos web, mobile ou automações diretamente usando chaves <code className="font-mono text-slate-800">X-API-Key</code> com CORS habilitado e receba notificações em tempo real assinadas com HMAC-SHA256.
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2">
            <p className="text-xs font-medium text-slate-500">Base URL da API</p>
            <p className="mt-0.5 font-mono text-xs font-medium text-slate-900 select-all">
              {baseUrl}
            </p>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* API Keys + Webhooks */}
      {!isStaff ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          O gerenciamento de <code className="font-mono">X-API-Key</code> e Webhooks é restrito aos perfis <span className="font-mono font-semibold">admin</span> e <span className="font-mono font-semibold">agente</span>. Abaixo você ainda pode copiar os SDKs para integração com JWT de cliente.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
          {/* API Keys Panel */}
          <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-5">
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-4 w-4 text-blue-600" />
              <h3 className="text-base font-semibold text-slate-900">
                Chaves de API (X-API-Key)
              </h3>
            </div>

            <form onSubmit={handleCreateApiKey} className="space-y-3 border-b border-slate-200 pb-5">
              <div>
                <label
                  htmlFor="apikey-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Nome da aplicação
                </label>
                <input
                  id="apikey-name"
                  type="text"
                  required
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">
                  Escopos permitidos
                </span>
                <div className="space-y-1">
                  {ALL_SCOPES.map((sc) => {
                    const checked = keyScopes.includes(sc.value);
                    return (
                      <label
                        key={sc.value}
                        className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setKeyScopes((prev) => [...prev, sc.value]);
                            } else if (keyScopes.length > 1) {
                              setKeyScopes((prev) =>
                                prev.filter((item) => item !== sc.value),
                              );
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                        />
                        <span className="font-mono">{sc.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Gerar Nova Chave</span>
              </button>
            </form>

            {createdSecretKey && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3.5 space-y-2">
                <p className="text-xs font-semibold text-emerald-900">
                  Chave gerada (exibida apenas uma vez):
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 border border-emerald-200">
                    {createdSecretKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdSecretKey);
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 1800);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 whitespace-nowrap shrink-0"
                  >
                    {copiedSecret ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedSecret ? 'Copiada' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">
                Chaves cadastradas ({apiKeys.length})
              </p>
              {loading && apiKeys.length === 0 ? (
                <p className="text-xs text-slate-500">Carregando...</p>
              ) : apiKeys.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhuma chave criada ainda. Gere uma chave acima para autenticar apps externos.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
                  {apiKeys.map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {k.nome}
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                          <span
                            className={
                              k.ativo ? 'text-emerald-700' : 'text-red-700'
                            }
                          >
                            {k.ativo ? 'Ativa' : 'Revogada'}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate font-mono text-xs text-slate-500 tabular-nums">
                          {k.prefix}... · {k.scopes.join(', ')}
                        </p>
                      </div>
                      {k.ativo && (
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => handleRevokeKey(k.id)}
                          className="text-xs font-medium text-red-700 hover:text-red-800 whitespace-nowrap shrink-0"
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Webhooks Panel */}
          <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-5">
            <div className="flex items-center gap-2.5">
              <Webhook className="h-4 w-4 text-blue-600" />
              <h3 className="text-base font-semibold text-slate-900">
                Webhooks de Eventos (HMAC-SHA256)
              </h3>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-3 border-b border-slate-200 pb-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="wh-name"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Nome do destino
                  </label>
                  <input
                    id="wh-name"
                    type="text"
                    required
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="wh-url"
                    className="block text-xs font-medium text-slate-700"
                  >
                    URL receptora (HTTPS ou internal://sink-echo)
                  </label>
                  <input
                    id="wh-url"
                    type="text"
                    required
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {ALL_EVENTS.map((ev) => {
                  const checked = whEvents.includes(ev.value);
                  return (
                    <label
                      key={ev.value}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setWhEvents((prev) => [...prev, ev.value]);
                          } else if (whEvents.length > 1) {
                            setWhEvents((prev) =>
                              prev.filter((item) => item !== ev.value),
                            );
                          }
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                      />
                      <span className="font-mono">{ev.label}</span>
                    </label>
                  );
                })}
              </div>

              <button
                type="submit"
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Cadastrar Webhook</span>
              </button>
            </form>

            {createdWhSecret && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                Segredo de assinatura HMAC (<code className="font-mono">X-TicketCore-Signature</code>):{' '}
                <code className="font-mono font-semibold text-slate-900 select-all">
                  {createdWhSecret}
                </code>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">
                Endpoints inscritos ({webhooks.length})
              </p>
              {webhooks.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhum webhook cadastrado. Use a URL pré-preenchida <code className="font-mono">/webhooks/sink-echo</code> para testar entregas reais.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
                  {webhooks.map((wh) => (
                    <div
                      key={wh.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {wh.nome}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-500">
                          {wh.url}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => handleTestWebhook(wh.id)}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Testar
                        </button>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => handleDeleteWebhook(wh.id)}
                          aria-label={`Remover ${wh.nome}`}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {deliveries.length > 0 && (
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <p className="text-xs font-medium text-slate-500">
                  Últimas entregas ({deliveries.length})
                </p>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-200">
                  {deliveries.slice(0, 8).map((dlv) => (
                    <div
                      key={dlv.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-medium text-slate-900">
                          {dlv.event}
                        </span>
                        <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                        <span className="text-slate-600">{dlv.webhookNome}</span>
                      </div>
                      <div className="font-mono tabular-nums whitespace-nowrap shrink-0">
                        <span
                          className={
                            dlv.success ? 'text-emerald-700' : 'text-red-700'
                          }
                        >
                          HTTP {dlv.statusCode ?? 'ERR'}
                        </span>
                        <span className="ml-2 text-slate-400">
                          {dlv.durationMs}ms
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SDK Snippets + External App Widget Simulator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <section className="rounded-lg border border-slate-200 bg-white lg:col-span-7 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  { id: 'typescript', label: 'TypeScript SDK' },
                  { id: 'react', label: 'React Hook' },
                  { id: 'python', label: 'Python' },
                  { id: 'curl', label: 'cURL' },
                ] as Array<{ id: SdkLang; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSdkLang(tab.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    sdkLang === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(sdkCode);
                setCopiedSdk(true);
                setTimeout(() => setCopiedSdk(false), 1800);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedSdk ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedSdk ? 'Código copiado' : 'Copiar SDK'}</span>
            </button>
          </div>

          <pre className="max-h-[420px] overflow-auto bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-100">
            {sdkCode}
          </pre>
        </section>

        {/* External App Widget Simulator */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Simulador de Widget em App Externo
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Teste a abertura de um ticket simulando um aplicativo parceiro autenticado apenas via <code className="font-mono">X-API-Key</code>.
            </p>
          </div>

          {simResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
              {simResult}
            </div>
          )}

          <form onSubmit={handleWidgetSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="sim-apikey"
                className="block text-xs font-medium text-slate-700"
              >
                X-API-Key (gere acima para preencher automaticamente)
              </label>
              <input
                id="sim-apikey"
                type="text"
                required
                value={simApiKey}
                onChange={(e) => setSimApiKey(e.target.value)}
                placeholder="tc_live_..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="sim-titulo"
                className="block text-xs font-medium text-slate-700"
              >
                Assunto do chamado
              </label>
              <input
                id="sim-titulo"
                type="text"
                required
                value={simTitulo}
                onChange={(e) => setSimTitulo(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="sim-categoria"
                  className="block text-xs font-medium text-slate-700"
                >
                  Categoria
                </label>
                <select
                  id="sim-categoria"
                  value={simCategoria}
                  onChange={(e) =>
                    setSimCategoria(e.target.value as TicketCategory)
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="bug">Bug</option>
                  <option value="acesso">Acesso</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="infraestrutura">Infraestrutura</option>
                  <option value="duvida">Dúvida</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="sim-prioridade"
                  className="block text-xs font-medium text-slate-700"
                >
                  Prioridade
                </label>
                <select
                  id="sim-prioridade"
                  value={simPrioridade}
                  onChange={(e) =>
                    setSimPrioridade(e.target.value as TicketPriority)
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="sim-desc"
                className="block text-xs font-medium text-slate-700"
              >
                Descrição
              </label>
              <textarea
                id="sim-desc"
                rows={3}
                required
                value={simDescricao}
                onChange={(e) => setSimDescricao(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={busyAction || !simApiKey.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>Enviar Ticket via X-API-Key</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
