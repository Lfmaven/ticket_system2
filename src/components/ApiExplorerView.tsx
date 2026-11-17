import { useMemo, useState } from 'react';
import { Check, Copy, Play } from 'lucide-react';
import { executeRawApiRequest, type RawApiResponse } from '../lib/api';

interface EndpointPreset {
  id: string;
  group: 'Sistema' | 'Autenticação' | 'Usuários & RBAC' | 'Tickets';
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  requiresAuth: boolean;
  defaultBody?: string;
}

const ENDPOINTS: EndpointPreset[] = [
  {
    id: 'health',
    group: 'Sistema',
    method: 'GET',
    path: '/health',
    summary: 'Healthcheck, uptime e contagem de registros',
    requiresAuth: false,
  },
  {
    id: 'openapi',
    group: 'Sistema',
    method: 'GET',
    path: '/openapi.json',
    summary: 'Especificação OpenAPI 3.1 da API v1',
    requiresAuth: false,
  },
  {
    id: 'auth-register',
    group: 'Autenticação',
    method: 'POST',
    path: '/auth/register',
    summary: 'Registrar novo usuário (hash scrypt + validação Zod)',
    requiresAuth: false,
    defaultBody: JSON.stringify(
      {
        nome: 'Fernanda Oliveira',
        email: 'fernanda.teste@empresa.com',
        senha: 'SenhaForte2026',
      },
      null,
      2,
    ),
  },
  {
    id: 'auth-login',
    group: 'Autenticação',
    method: 'POST',
    path: '/auth/login',
    summary: 'Autenticar usuário e emitir accessToken + refreshToken',
    requiresAuth: false,
    defaultBody: JSON.stringify(
      {
        email: 'admin@ticketcore.dev',
        senha: 'Admin@2026',
      },
      null,
      2,
    ),
  },
  {
    id: 'auth-me',
    group: 'Autenticação',
    method: 'GET',
    path: '/auth/me',
    summary: 'Retornar perfil do usuário autenticado pelo JWT',
    requiresAuth: true,
  },
  {
    id: 'users-list',
    group: 'Usuários & RBAC',
    method: 'GET',
    path: '/users',
    summary: 'Listar usuários (restrito a admin e agente)',
    requiresAuth: true,
  },
  {
    id: 'users-role',
    group: 'Usuários & RBAC',
    method: 'PATCH',
    path: '/users/usr_cliente_02/role',
    summary: 'Alterar perfil RBAC ou status ativo (restrito a admin)',
    requiresAuth: true,
    defaultBody: JSON.stringify(
      {
        perfil: 'agente',
        ativo: true,
      },
      null,
      2,
    ),
  },
  {
    id: 'tickets-stats',
    group: 'Tickets',
    method: 'GET',
    path: '/tickets/stats',
    summary: 'Estatísticas agregadas por status, prioridade e SLA',
    requiresAuth: true,
  },
  {
    id: 'tickets-list',
    group: 'Tickets',
    method: 'GET',
    path: '/tickets?page=1&limit=10&sort=priority',
    summary: 'Listar tickets com paginação, filtros e escopo RBAC',
    requiresAuth: true,
  },
  {
    id: 'tickets-create',
    group: 'Tickets',
    method: 'POST',
    path: '/tickets',
    summary: 'Criar novo ticket com cálculo automático de SLA',
    requiresAuth: true,
    defaultBody: JSON.stringify(
      {
        titulo: 'Timeout intermitente no webhook de notificações',
        descricao:
          'Requisições POST enviadas após 18h retornam 504 Gateway Timeout após 10 segundos.',
        prioridade: 'alta',
        categoria: 'infraestrutura',
      },
      null,
      2,
    ),
  },
  {
    id: 'tickets-patch',
    group: 'Tickets',
    method: 'PATCH',
    path: '/tickets/TCK-1002',
    summary: 'Transicionar status e atribuir responsável com auditoria',
    requiresAuth: true,
    defaultBody: JSON.stringify(
      {
        status: 'em_andamento',
        responsavelId: 'usr_agente_01',
      },
      null,
      2,
    ),
  },
  {
    id: 'tickets-comment',
    group: 'Tickets',
    method: 'POST',
    path: '/tickets/TCK-1001/comments',
    summary: 'Adicionar comentário público ou nota interna de agente',
    requiresAuth: true,
    defaultBody: JSON.stringify(
      {
        conteudo: 'Validado em produção após aplicação do middleware Zod.',
        interno: false,
      },
      null,
      2,
    ),
  },
];

interface ApiExplorerViewProps {
  accessToken: string | null;
}

export function ApiExplorerView({ accessToken }: ApiExplorerViewProps) {
  const [selectedId, setSelectedId] = useState<string>(ENDPOINTS[3].id);
  const selected = useMemo(
    () => ENDPOINTS.find((e) => e.id === selectedId) || ENDPOINTS[0],
    [selectedId],
  );

  const [pathInput, setPathInput] = useState(selected.path);
  const [bodyInput, setBodyInput] = useState(selected.defaultBody || '');
  const [sendBearer, setSendBearer] = useState(true);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<RawApiResponse | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const handleSelectEndpoint = (ep: EndpointPreset) => {
    setSelectedId(ep.id);
    setPathInput(ep.path);
    setBodyInput(ep.defaultBody || '');
    setResponse(null);
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await executeRawApiRequest({
        method: selected.method,
        path: pathInput,
        token: sendBearer && accessToken ? accessToken : undefined,
        bodyText: bodyInput,
      });
      setResponse(res);
    } finally {
      setRunning(false);
    }
  };

  const curlCommand = useMemo(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const parts = [`curl -X ${selected.method} "${base}/api/v1${pathInput}"`];
    if (sendBearer && accessToken) {
      parts.push(`  -H "Authorization: Bearer ${accessToken.slice(0, 24)}..."`);
    }
    if (bodyInput && ['POST', 'PATCH', 'PUT'].includes(selected.method)) {
      parts.push(`  -H "Content-Type: application/json"`);
      parts.push(`  -d '${bodyInput.replace(/\s+/g, ' ')}'`);
    }
    return parts.join(' \\\n');
  }, [selected.method, pathInput, sendBearer, accessToken, bodyInput]);

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1800);
  };

  const methodColor: Record<EndpointPreset['method'], string> = {
    GET: 'text-blue-700',
    POST: 'text-emerald-700',
    PATCH: 'text-amber-700',
    DELETE: 'text-red-700',
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
      {/* Left: Endpoint Catalog */}
      <aside className="rounded-lg border border-slate-200 bg-white lg:col-span-4 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Endpoints Disponíveis ({ENDPOINTS.length})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Selecione uma rota para testar contra o servidor Express em execução
          </p>
        </div>

        <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
          {ENDPOINTS.map((ep) => {
            const active = ep.id === selected.id;
            return (
              <button
                key={ep.id}
                type="button"
                onClick={() => handleSelectEndpoint(ep)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                  active ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`mt-0.5 w-14 shrink-0 font-mono text-xs font-semibold ${methodColor[ep.method]}`}
                >
                  {ep.method}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-medium text-slate-900">
                    {ep.path}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                    {ep.summary}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right: Request Builder & Live Response */}
      <section className="space-y-5 lg:col-span-8">
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {selected.group}
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{selected.requiresAuth ? 'Requer JWT Bearer' : 'Rota Pública'}</span>
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">
                {selected.summary}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleCopyCurl}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedCurl ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedCurl ? 'cURL copiado' : 'Copiar cURL'}</span>
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center rounded-md border border-slate-300 bg-slate-50">
              <span
                className={`px-3 py-2 font-mono text-xs font-semibold border-r border-slate-300 ${methodColor[selected.method]}`}
              >
                {selected.method}
              </span>
              <span className="pl-3 font-mono text-xs text-slate-500 select-none">
                /api/v1
              </span>
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                aria-label="Caminho do endpoint"
                className="w-full bg-transparent px-1 py-2 font-mono text-xs text-slate-900 focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={running}
              onClick={handleRun}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4" />
              <span>{running ? 'Enviando...' : 'Executar'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sendBearer}
                onChange={(e) => setSendBearer(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>
                Injetar cabeçalho <code className="font-mono">Authorization: Bearer</code> da sessão atual
              </span>
            </label>
            <span className="font-mono text-slate-500">
              {accessToken ? 'JWT ativo em memória' : 'Sem token (testará 401)'}
            </span>
          </div>

          {['POST', 'PATCH', 'PUT'].includes(selected.method) && (
            <div>
              <label
                htmlFor="api-json-body"
                className="block text-xs font-medium text-slate-700"
              >
                Corpo JSON da Requisição
              </label>
              <textarea
                id="api-json-body"
                rows={7}
                value={bodyInput}
                onChange={(e) => setBodyInput(e.target.value)}
                spellCheck={false}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Response Panel */}
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h4 className="text-xs font-semibold text-slate-700">
              Resposta HTTP
            </h4>
            {response ? (
              <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                <span
                  className={`font-semibold ${
                    response.status >= 200 && response.status < 300
                      ? 'text-emerald-700'
                      : response.status >= 400 && response.status < 500
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }`}
                >
                  HTTP {response.status} {response.statusText}
                </span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span className="text-slate-600">{response.durationMs} ms</span>
                {response.headers['x-ratelimit-remaining'] && (
                  <>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span className="text-slate-600">
                      RateLimit restante: {response.headers['x-ratelimit-remaining']}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-500">
                Clique em Executar para inspecionar o payload real
              </span>
            )}
          </div>

          <pre className="max-h-[420px] overflow-auto bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-100">
            {response
              ? JSON.stringify(response.body, null, 2)
              : '// Aguardando execução da requisição...'}
          </pre>
        </div>
      </section>
    </div>
  );
}
