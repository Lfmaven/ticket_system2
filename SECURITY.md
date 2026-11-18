# Política de Segurança (`Lfmaven/ticket_system`)

## Versões Suportadas

| Versão | Suporte de Segurança |
| ------ | -------------------- |
| `1.2.x` | Suportada (Ativa)    |
| `< 1.2` | Não suportada        |

---

## Controles de Segurança Implementados

1. **Zero Segredos Hardcoded (CWE-798)**:
   - `JWT_SECRET` e `JWT_REFRESH_SECRET` são carregados exclusivamente via variáveis de ambiente (com geração CSPRNG `crypto.randomBytes(32)` em tempo de execução fora do controle de versão caso não definidos em dev).
2. **Hashing de Senhas & Chaves de API**:
   - Senhas armazenadas com **scrypt** (`64 bytes`, salt aleatório de 16 bytes) e comparação em tempo constante (`crypto.timingSafeEqual`).
   - Chaves `X-API-Key` armazenadas apenas como digest **SHA-256** (`keyHash`).
3. **Proteção contra SSRF (CWE-918)**:
   - Webhooks aceitam apenas URLs **HTTPS** externas (ou o receptor isolado `internal://sink-echo`), bloqueiam `localhost`, domínios `.local`/`.internal`, IPs privados/loopback/metadata (`169.254.0.0/16`, `10.0.0.0/8`, `127.0.0.0/8`, `::1`, `fe80::/10`), validam DNS antes do envio e desabilitam redirecionamentos HTTP (`redirect: 'error'`).
4. **Proteção contra CSV Formula Injection (CWE-1236)**:
   - Células iniciadas por `=`, `+`, `-`, `@`, `\t` ou `\r` são neutralizadas antes da serialização RFC-4180.
5. **Proteção contra Força Bruta & DoS (CWE-307 / CWE-770)**:
   - Bloqueio temporário após 5 tentativas consecutivas de login inválidas (`HTTP 429` + `Retry-After`), rate limiting com limpeza automática de memória e limite de payload JSON em `256kb`.
6. **Cabeçalhos HTTP Endurecidos (CWE-693 / CWE-200)**:
   - `x-powered-by` desabilitado, `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` e `Permissions-Policy`.
7. **GitHub Code Scanning & Dependabot**:
   - Workflows configurados em `.github/workflows/codeql.yml`, `.github/workflows/security-audit.yml` e `.github/dependabot.yml`.

---

## Reportando Vulnerabilidades

Caso identifique qualquer falha de segurança no projeto **`Lfmaven/ticket_system`**, **não abra uma issue pública**. Reporte de forma privada diretamente ao mantenedor **Lfmaven** via [GitHub Security Advisories](https://github.com/Lfmaven/ticket_system/security/advisories).
