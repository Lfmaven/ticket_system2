/**
 * @project Lfmaven/ticket_system
 * @author Lfmaven (https://github.com/Lfmaven/ticket_system)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type {
  ApiKeyScope,
  JwtPayloadClaims,
  UserRecord,
  UserRole,
} from './types.ts';

export const SERVICE_AUTHOR = 'Lfmaven';
export const TOKEN_ISSUER = 'lfmaven-ticket-system';

export const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface RuntimeSecrets {
  accessSecret: string;
  refreshSecret: string;
}

let cachedSecrets: RuntimeSecrets | null = null;

function resolveSecretsDir(): string {
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

function getRuntimeSecrets(): RuntimeSecrets {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const envAccess = process.env.JWT_SECRET?.trim();
  const envRefresh = process.env.JWT_REFRESH_SECRET?.trim();

  if (envAccess && envRefresh) {
    cachedSecrets = {
      accessSecret: envAccess,
      refreshSecret: envRefresh,
    };
    return cachedSecrets;
  }

  // Generate or load an ephemeral CSPRNG keypair outside source control
  // to avoid hardcoded credentials (CWE-798).
  const keyFile = path.join(resolveSecretsDir(), '.runtime-keys.json');
  try {
    if (fs.existsSync(keyFile)) {
      const parsed = JSON.parse(
        fs.readFileSync(keyFile, 'utf-8'),
      ) as Partial<RuntimeSecrets>;
      if (parsed.accessSecret && parsed.refreshSecret) {
        cachedSecrets = {
          accessSecret: envAccess || parsed.accessSecret,
          refreshSecret: envRefresh || parsed.refreshSecret,
        };
        return cachedSecrets;
      }
    }
  } catch {
    // Regenerate cleanly if unreadable
  }

  const generated: RuntimeSecrets = {
    accessSecret: envAccess || crypto.randomBytes(32).toString('hex'),
    refreshSecret: envRefresh || crypto.randomBytes(32).toString('hex'),
  };

  try {
    fs.writeFileSync(keyFile, JSON.stringify(generated), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    // Keep in-memory if filesystem is read-only
  }

  cachedSecrets = generated;
  return cachedSecrets;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expectedHex] = parts;
  if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(expectedHex)) {
    return false;
  }
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derivedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): {
  rawKey: string;
  prefix: string;
  keyHash: string;
} {
  const random = crypto.randomBytes(24).toString('hex');
  const rawKey = `tc_live_${random}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, 14),
    keyHash: hashApiKey(rawKey),
  };
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  payloadJson: string,
): string {
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payloadJson}`)
    .digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

// --- SSRF Guard (CWE-918) ---
function isPrivateOrReservedIpv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 cloud metadata & link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateOrReservedIpv4(ip);
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80') ||
      normalized.startsWith('ff')
    ) {
      return true;
    }
    if (normalized.startsWith('::ffff:')) {
      const v4 = normalized.slice(7);
      return isPrivateOrReservedIpv4(v4);
    }
    return false;
  }
  return true;
}

export function validateWebhookUrlSyntax(rawUrl: string): {
  valid: boolean;
  reason?: string;
} {
  if (rawUrl === 'internal://sink-echo') {
    return { valid: true };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'URL inválida.' };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason:
        'Apenas URLs HTTPS externas ou o receptor interno internal://sink-echo são permitidos.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      reason: 'Credenciais embutidas na URL do webhook não são permitidas.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return {
      valid: false,
      reason: 'Domínios internos ou loopback não são permitidos por proteção SSRF.',
    };
  }

  if (net.isIP(host) !== 0 && isPrivateOrReservedIp(host)) {
    return {
      valid: false,
      reason: 'Endereços IP privados, loopback ou metadata não são permitidos.',
    };
  }

  return { valid: true };
}

export async function assertSafeOutboundWebhookUrl(rawUrl: string): Promise<URL> {
  const syntaxCheck = validateWebhookUrlSyntax(rawUrl);
  if (!syntaxCheck.valid) {
    throw new Error(syntaxCheck.reason || 'URL de webhook bloqueada por política de segurança.');
  }

  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();

  if (net.isIP(host) !== 0) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('IP de destino privado bloqueado (SSRF Guard).');
    }
    return parsed;
  }

  const resolved = await dns.lookup(host, { all: true });
  if (resolved.length === 0) {
    throw new Error('Hostname do webhook não pôde ser resolvido.');
  }

  for (const entry of resolved) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw new Error(
        'Hostname resolve para endereço IP privado ou reservado (SSRF Guard).',
      );
    }
  }

  return parsed;
}

export function issueTokenPair(user: UserRecord) {
  const { accessSecret, refreshSecret } = getRuntimeSecrets();
  const baseClaims = {
    sub: user.id,
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
  };

  const accessToken = jwt.sign(
    { ...baseClaims, type: 'access' },
    accessSecret,
    {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      issuer: TOKEN_ISSUER,
    },
  );

  const refreshToken = jwt.sign(
    { ...baseClaims, type: 'refresh' },
    refreshSecret,
    {
      algorithm: 'HS256',
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      issuer: TOKEN_ISSUER,
    },
  );

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer' as const,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export function verifyAccessToken(token: string): JwtPayloadClaims {
  const { accessSecret } = getRuntimeSecrets();
  const decoded = jwt.verify(token, accessSecret, {
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
  }) as JwtPayloadClaims;

  if (decoded.type !== 'access') {
    throw new Error('Tipo de token inválido');
  }
  return { ...decoded, authMethod: 'jwt' };
}

export function verifyRefreshToken(token: string): JwtPayloadClaims {
  const { refreshSecret } = getRuntimeSecrets();
  const decoded = jwt.verify(token, refreshSecret, {
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
  }) as JwtPayloadClaims;

  if (decoded.type !== 'refresh') {
    throw new Error('Tipo de refresh token inválido');
  }
  return decoded;
}

export interface AuthenticatedRequest extends Request {
  auth?: JwtPayloadClaims;
}

type ApiKeyResolver = (
  keyHash: string,
) => {
  ownerId: string;
  ownerNome: string;
  ownerEmail: string;
  ownerPerfil: UserRole;
  scopes: ApiKeyScope[];
} | null;

let registeredApiKeyResolver: ApiKeyResolver | null = null;

export function setApiKeyResolver(resolver: ApiKeyResolver) {
  registeredApiKeyResolver = resolver;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const apiKeyHeader = req.headers['x-api-key'];
  const rawApiKey =
    typeof apiKeyHeader === 'string' ? apiKeyHeader.trim() : '';

  if (rawApiKey && registeredApiKeyResolver) {
    const resolved = registeredApiKeyResolver(hashApiKey(rawApiKey));
    if (!resolved) {
      res.status(401).json({
        error: 'invalid_api_key',
        message: 'Chave X-API-Key inválida ou revogada.',
      });
      return;
    }
    req.auth = {
      sub: resolved.ownerId,
      email: resolved.ownerEmail,
      nome: resolved.ownerNome,
      perfil: resolved.ownerPerfil,
      type: 'access',
      authMethod: 'api_key',
      scopes: resolved.scopes,
    };
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      message:
        'Credencial ausente. Envie Authorization: Bearer <jwt> ou X-API-Key: <chave>.',
    });
    return;
  }

  const token = header.slice(7).trim();
  if (!token || token.length > 4096) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Token JWT inválido ou vazio.',
    });
    return;
  }

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({
      error: 'invalid_token',
      message:
        'Token inválido ou expirado. Faça login novamente ou use /auth/refresh.',
    });
  }
}

export function requireScope(scope: ApiKeyScope) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Autenticação obrigatória.',
      });
      return;
    }
    if (
      req.auth.authMethod === 'api_key' &&
      (!req.auth.scopes || !req.auth.scopes.includes(scope))
    ) {
      res.status(403).json({
        error: 'insufficient_scope',
        message: `Esta API Key não possui o escopo necessário: ${scope}.`,
      });
      return;
    }
    next();
  };
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Autenticação obrigatória.',
      });
      return;
    }
    if (!roles.includes(req.auth.perfil)) {
      res.status(403).json({
        error: 'forbidden',
        message: `Acesso restrito. Perfis permitidos: ${roles.join(', ')}.`,
      });
      return;
    }
    next();
  };
}

// --- Brute-force Login Protection (CWE-307) ---
interface FailedLoginTracker {
  failures: number;
  lockedUntil: number;
  windowResetAt: number;
}

const failedLogins = new Map<string, FailedLoginTracker>();
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_LOCKOUT_MS = 5 * 60_000;

export function checkLoginLockout(email: string, ip: string): number {
  const key = `${email}:${ip}`;
  const entry = failedLogins.get(key);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.lockedUntil > now) {
    return Math.ceil((entry.lockedUntil - now) / 1000);
  }
  if (entry.windowResetAt <= now) {
    failedLogins.delete(key);
  }
  return 0;
}

export function recordFailedLogin(email: string, ip: string): void {
  if (failedLogins.size > 10_000) {
    const now = Date.now();
    for (const [k, v] of failedLogins.entries()) {
      if (v.windowResetAt <= now && v.lockedUntil <= now) {
        failedLogins.delete(k);
      }
    }
  }
  const key = `${email}:${ip}`;
  const now = Date.now();
  const existing = failedLogins.get(key);
  if (!existing || existing.windowResetAt <= now) {
    failedLogins.set(key, {
      failures: 1,
      lockedUntil: 0,
      windowResetAt: now + LOGIN_WINDOW_MS,
    });
    return;
  }
  existing.failures += 1;
  if (existing.failures >= MAX_LOGIN_FAILURES) {
    existing.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
}

export function clearFailedLogins(email: string, ip: string): void {
  failedLogins.delete(`${email}:${ip}`);
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();
const MAX_RATE_BUCKETS = 10_000;

export function rateLimit(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (buckets.size > MAX_RATE_BUCKETS) {
      for (const [k, b] of buckets.entries()) {
        if (b.resetAt <= now) {
          buckets.delete(k);
        }
      }
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const nextBucket: RateBucket = {
        count: 1,
        resetAt: now + options.windowMs,
      };
      buckets.set(key, nextBucket);
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(options.max - 1));
      res.setHeader(
        'X-RateLimit-Reset',
        String(Math.ceil(nextBucket.resetAt / 1000)),
      );
      next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfter = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: `Limite de requisições atingido. Tente novamente em ${retryAfter}s.`,
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    existing.count += 1;
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, options.max - existing.count)),
    );
    res.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil(existing.resetAt / 1000)),
    );
    next();
  };
}
