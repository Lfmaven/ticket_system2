# `ticket_system` — TicketCore API & Workbench

> **Autor e Mantenedor:** **Lfmaven** · [`github.com/Lfmaven/ticket_system`](https://github.com/Lfmaven/ticket_system)

API RESTful completa de **Gestão de Tickets, Usuários, RBAC e Webhooks**, construída para operar em produção e integrar-se facilmente a aplicações Web, Mobile, serviços Backend e automações. Acompanha console administrativo interativo, gráficos de distribuição, explorador de endpoints e referência refatorada em Python/Flask.

---

## Sumário

- [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
- [Instalação e Execução](#instalação-e-execução)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Guia Rápido de Integração em Apps Externos](#guia-rápido-de-integração-em-apps-externos)
- [Referência de Endpoints (`/api/v1`)](#referência-de-endpoints-apiv1)
- [Matriz RBAC e Políticas de SLA](#matriz-rbac-e-políticas-de-sla)
- [Contas de Demonstração](#contas-de-demonstração)
- [Autoria e Propriedade Intelectual](#autoria-e-propriedade-intelectual)

---

## Visão Geral da Arquitetura

- **Backend RESTful**: Node.js 22 + Express 4 + TypeScript, validação de entrada com **Zod** (`422`), rate limiting por IP (`429`), CORS habilitado e headers de segurança.
- **Autenticação Dual**:
  - **Usuários finais**: **JWT HS256** (`issuer: lfmaven-ticket-system`) com `accessToken` (15 min) + `refreshToken` (7 dias) e hash de senha **scrypt** com salt aleatório de 16 bytes.
  - **Aplicações e serviços (M2M)**: chaves **`X-API-Key`** (`tc_live_...`) com escopos granulares (`tickets:read`, `tickets:write`, `webhooks:manage`).
- **Webhooks em Tempo Real**: disparo assíncrono nos eventos `ticket.created`, `ticket.status_changed`, `ticket.updated` e `ticket.commented` com assinatura **HMAC-SHA256** (`X-TicketCore-Signature`).
- **Console Web (Frontend)**: React 19 + Tailwind CSS v4 + Recharts (distribuição por status e prioridade, busca global em tempo real, exportação CSV para `admin` e aba **Integrações & SDK**).

---

## Instalação e Execução

### Pré-requisitos
- **Node.js** `>= 22.0.0`
- **npm** `>= 10.0.0`

### 1. Clonar e instalar dependências
```bash
git clone https://github.com/Lfmaven/ticket_system.git
cd ticket_system
npm install
```

### 2. Configurar ambiente
```bash
cp .env.example .env
```
Edite o arquivo `.env` com suas chaves de produção (veja a seção [Variáveis de Ambiente](#variáveis-de-ambiente)).

### 3. Executar em desenvolvimento (API + Frontend na porta 3000)
```bash
npm run dev
```

### 4. Validar tipos, compilar e rodar em produção
```bash
npm run lint
npm run build
NODE_ENV=production PORT=3000 npm start
```

> **Probes de disponibilidade:** `GET /healthz`, `GET /api/health` e `GET /api/v1/health` retornam `HTTP 200` JSON com uptime, métricas e identificação do autor (`Lfmaven`).

---

## Variáveis de Ambiente

Todas as variáveis aceitas pela aplicação estão listadas abaixo (consulte `.env.example` para o modelo inicial):

| Variável             | Obrigatória em Produção | Padrão em Desenvolvimento                        | Descrição |
| -------------------- | :---------------------: | ------------------------------------------------ | --------- |
| `PORT`               | Não                     | `3000`                                           | Porta HTTP em que o servidor Express escuta. |
| `NODE_ENV`           | Sim (`production`)      | `development`                                    | Em `production`, serve os arquivos estáticos compilados de `dist/`. |
| `JWT_SECRET`         | Sim                     | Chave dev (`dev-lfmaven-ticket-system-...`)      | Segredo HMAC-SHA256 usado na assinatura dos `accessToken`. |
| `JWT_REFRESH_SECRET` | Sim                     | Chave dev (`dev-lfmaven-ticket-system-...`)      | Segredo HMAC-SHA256 usado na assinatura dos `refreshToken`. |
| `DATA_DIR`           | Não                     | `./data` (fallback para `/tmp/ticketcore-data`)  | Diretório onde `ticket_system.json` é persistido de forma atômica. |
| `APP_URL`            | Não                     | Injetado pelo runtime                            | URL pública da instância hospedada (links e callbacks). |
| `GEMINI_API_KEY`     | Não                     | —                                                | Reservada caso recursos de IA sejam habilitados no servidor. |

---

## Guia Rápido de Integração em Apps Externos

Existem duas formas recomendadas de integrar o `ticket_system` em sua aplicação:

### Opção A: Integração Direta de App/Backend com `X-API-Key`
Ideal para portais SaaS, aplicativos mobile, webhooks de erro ou rotinas automatizadas.

1. Acesse o console web na aba **Integrações & SDK** (autenticado como `admin` ou `agente`).
2. Gere uma nova chave escolhendo os escopos necessários (`tickets:read`, `tickets:write`, `webhooks:manage`).
3. Envie a chave no cabeçalho HTTP `X-API-Key`:

#### Exemplo TypeScript / JavaScript (`fetch`)
```ts
const API_BASE = "https://seu-dominio-ticket-system/api/v1";
const API_KEY = process.env.TICKET_SYSTEM_API_KEY!;

export async function abrirChamado(dados: {
  titulo: string;
  descricao: string;
  prioridade?: "baixa" | "media" | "alta" | "critica";
  categoria?: "bug" | "acesso" | "financeiro" | "infraestrutura" | "duvida";
}) {
  const response = await fetch(`${API_BASE}/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify(dados),
  });

  if (!response.ok) {
    const erro = await response.json();
    throw new Error(`${erro.error}: ${erro.message}`);
  }

  return response.json(); // { message, ticket }
}
```

#### Exemplo Python (`requests`)
```python
import os
import requests

API_BASE = "https://seu-dominio-ticket-system/api/v1"
HEADERS = {
    "X-API-Key": os.environ["TICKET_SYSTEM_API_KEY"],
    "Content-Type": "application/json",
}

res = requests.post(
    f"{API_BASE}/tickets",
    headers=HEADERS,
    json={
        "titulo": "Erro 502 no gateway de pagamentos",
        "descricao": "Falha intermitente observada ao confirmar pedido #8412.",
        "prioridade": "alta",
        "categoria": "infraestrutura",
    },
    timeout=10,
)
res.raise_for_status()
print(res.json()["ticket"]["codigo"])
```

#### Exemplo cURL
```bash
curl -X POST "https://seu-dominio-ticket-system/api/v1/tickets" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tc_live_sua_chave_aqui" \
  -d '{
    "titulo": "Falha ao sincronizar perfil",
    "descricao": "Usuário recebeu HTTP 403 após atualização de e-mail.",
    "prioridade": "media",
    "categoria": "acesso"
  }'
```

### Opção B: Autenticação de Usuário Final via JWT (`Bearer`)
Ideal para portais de clientes onde cada usuário possui sua própria sessão e enxerga apenas seus chamados:

1. Cadastre ou autentique o usuário via `POST /api/v1/auth/register` ou `POST /api/v1/auth/login`.
2. Utilize `Authorization: Bearer <accessToken>` nas chamadas subsequentes.
3. Renove tokens expirados usando `POST /api/v1/auth/refresh` com `{ "refreshToken": "..." }`.

### Verificando Assinatura de Webhooks (HMAC-SHA256)
Todo evento disparado para sua URL inclui `X-TicketCore-Signature: t=<timestamp>,v1=<hmac>` e `User-Agent: Lfmaven-TicketSystem-Webhooks/1.2`:

```ts
import crypto from "node:crypto";

export function verifyTicketSignature(
  signatureHeader: string,
  rawBody: string,
  webhookSecret: string
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  if (!parts.t || !parts.v1) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(parts.v1, "hex"),
    Buffer.from(expected, "hex")
  );
}
```

---

## Referência de Endpoints (`/api/v1`)

| Método   | Rota                       | Autenticação / Escopo          | Descrição |
| -------- | -------------------------- | ------------------------------ | --------- |
| `GET`    | `/health`                  | Pública                        | Status, uptime e identificação do autor. |
| `GET`    | `/openapi.json`            | Pública                        | Especificação OpenAPI 3.1. |
| `POST`   | `/auth/register`           | Pública                        | Cadastro de cliente (hash scrypt + Zod). |
| `POST`   | `/auth/login`              | Pública                        | Login e emissão de `accessToken` + `refreshToken`. |
| `POST`   | `/auth/refresh`            | Pública (`refreshToken`)       | Renovação do `accessToken`. |
| `GET`    | `/auth/me`                 | JWT / `X-API-Key`              | Dados do usuário autenticado. |
| `GET`    | `/users`                   | `admin`, `agente`              | Lista usuários cadastrados. |
| `PATCH`  | `/users/:id/role`          | `admin`                        | Altera `perfil` RBAC ou `ativo`. |
| `GET`    | `/tickets/stats`           | `tickets:read`                 | Agregações por status, prioridade e SLA. |
| `GET`    | `/tickets/export`          | `admin` + `tickets:read`       | Exportação CSV filtrada (UTF-8 BOM). |
| `GET`    | `/tickets`                 | `tickets:read`                 | Lista paginada com filtros (`status`, `priority`, `q`, `sort`). |
| `POST`   | `/tickets`                 | `tickets:write`                | Abre chamado com código `TCK-*` e cálculo de SLA. |
| `GET`    | `/tickets/:id`             | `tickets:read`                 | Detalhes, comentários e trilha de auditoria. |
| `PATCH`  | `/tickets/:id`             | `tickets:write`                | Atualiza campos e aplica máquina de estados. |
| `DELETE` | `/tickets/:id`             | `tickets:write` (`admin`/dono) | Remove ticket conforme regra de permissão. |
| `POST`   | `/tickets/:id/comments`    | `tickets:write`                | Adiciona comentário público ou nota interna. |
| `GET`    | `/api-keys`                | `admin`, `agente`              | Lista chaves de API cadastradas. |
| `POST`   | `/api-keys`                | `admin`, `agente`              | Emite nova chave `tc_live_...`. |
| `DELETE` | `/api-keys/:id`            | `admin`, `agente` (dono)       | Revoga chave de API. |
| `GET`    | `/webhooks`                | `webhooks:manage`              | Lista webhooks configurados. |
| `POST`   | `/webhooks`                | `webhooks:manage`              | Cadastra destino de webhook com segredo HMAC. |
| `POST`   | `/webhooks/:id/test`       | `webhooks:manage`              | Dispara evento de teste assinado. |
| `GET`    | `/webhooks/deliveries`     | `webhooks:manage`              | Consulta últimas 50 entregas HTTP. |
| `DELETE` | `/webhooks/:id`            | `webhooks:manage`              | Remove webhook. |

---

## Matriz RBAC e Políticas de SLA

### Perfis de Acesso (RBAC)
- **`admin`**: acesso irrestrito à fila global, gestão de usuários/papéis, exclusão de chamados, API Keys, Webhooks e exportação CSV.
- **`agente`**: acesso à fila global, atribuição de responsáveis, alteração de prioridade, notas internas, API Keys e Webhooks próprios.
- **`cliente`**: acesso isolado aos próprios chamados, criação, comentários públicos e reabertura de tickets resolvidos.

### Prazos de SLA Automáticos
| Prioridade | Prazo SLA |
| ---------- | --------- |
| `critica`  | `4 horas` |
| `alta`     | `12 horas` |
| `media`    | `48 horas` |
| `baixa`    | `72 horas` |

---

## Contas de Demonstração

| Perfil    | E-mail                   | Senha          |
| --------- | ------------------------ | -------------- |
| `admin`   | `admin@ticketcore.dev`   | `Admin@2026`   |
| `agente`  | `agente@ticketcore.dev`  | `Agente@2026`  |
| `cliente` | `cliente@ticketcore.dev` | `Cliente@2026` |

---

## Segurança e Code Scanning Alerts

O repositório inclui proteção contra vulnerabilidades OWASP e pipelines automatizados de análise estática:
- **CodeQL (`/.github/workflows/codeql.yml`)**: análise SAST com as suítes `security-extended` e `security-and-quality` gerando alertas diretamente na aba **Security → Code scanning** do GitHub.
- **Security Audit CI (`/.github/workflows/security-audit.yml`)**: verifica tipagem estrita, build de produção e vulnerabilidades em dependências (`npm audit --omit=dev --audit-level=high`).
- **Dependabot (`/.github/dependabot.yml`)**: atualizações automáticas semanais de segurança para `npm` e `github-actions`.
- **Controles na API**: ausência de segredos hardcoded (CSPRNG runtime quando env não definida), proteção **SSRF** (`CWE-918`) com validação DNS/IP, proteção contra **CSV Formula Injection** (`CWE-1236`), lockout contra força bruta (`CWE-307`), remoção de `X-Powered-By` (`CWE-200`) e cabeçalhos `CSP`/`HSTS`/`Permissions-Policy`. Consulte [`SECURITY.md`](SECURITY.md).

---

## Autoria e Propriedade Intelectual

Desenvolvido e mantido por **Lfmaven** — [`https://github.com/Lfmaven/ticket_system`](https://github.com/Lfmaven/ticket_system).  
Identificadores de autoria estão configurados em `package.json` (`author`, `repository`), nos cabeçalhos HTTP (`X-Service-Author: Lfmaven/ticket_system`), no emissor JWT (`iss: lfmaven-ticket-system`), no `User-Agent` de webhooks (`Lfmaven-TicketSystem-Webhooks/1.2`) e nos endpoints `/health` e `/openapi.json`. Caso reutilize ou distribua este código, mantenha os créditos originais ao autor **Lfmaven**.
