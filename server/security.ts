/**
 * @project Lfmaven/ticket_system
 * @author Lfmaven (https://github.com/Lfmaven/ticket_system)
 */
import crypto from 'node:crypto';
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

const ACCESS_SECRET =
  process.env.JWT_SECRET || 'dev-lfmaven-ticket-system-access-key-2026';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'dev-lfmaven-ticket-system-refresh-key-2026';

export const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

export function issueTokenPair(user: UserRecord) {
  const baseClaims = {
    sub: user.id,
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
  };

  const accessToken = jwt.sign(
    { ...baseClaims, type: 'access' },
    ACCESS_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      issuer: TOKEN_ISSUER,
    },
  );

  const refreshToken = jwt.sign(
    { ...baseClaims, type: 'refresh' },
    REFRESH_SECRET,
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
  const decoded = jwt.verify(token, ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
  }) as JwtPayloadClaims;

  if (decoded.type !== 'access') {
    throw new Error('Tipo de token inválido');
  }
  return { ...decoded, authMethod: 'jwt' };
}

export function verifyRefreshToken(token: string): JwtPayloadClaims {
  const decoded = jwt.verify(token, REFRESH_SECRET, {
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
  if (!token) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Token JWT vazio.',
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

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

export function rateLimit(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
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
