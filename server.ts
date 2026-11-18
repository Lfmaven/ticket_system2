/**
 * @project Lfmaven/ticket_system
 * @author Lfmaven (https://github.com/Lfmaven/ticket_system)
 */
import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApiRouter } from './server/routes.ts';
import { loadDb } from './server/store.ts';

function resolveCorsOrigin(reqOrigin: string | undefined): string | null {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!configured || configured === '*') {
    return reqOrigin || '*';
  }
  const allowlist = configured.split(',').map((o) => o.trim());
  if (reqOrigin && allowlist.includes(reqOrigin)) {
    return reqOrigin;
  }
  return null;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const startedAt = Date.now();
  const isProd = process.env.NODE_ENV === 'production';

  // Eliminate Express technology disclosure (CWE-200)
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Ensure initial DB seed exists on startup
  loadDb();

  // CORS + Security headers + response timing
  app.use((req, res, next) => {
    const start = performance.now();
    const allowedOrigin = resolveCorsOrigin(req.headers.origin);
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      if (allowedOrigin !== '*') {
        res.setHeader('Vary', 'Origin');
      }
    }
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-API-Key',
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Response-Time, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Content-Disposition',
    );

    // Hardened HTTP security headers (CWE-693)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (isProd) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data:",
          "connect-src 'self'",
          "frame-ancestors 'self'",
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; '),
      );
    }
    res.setHeader('X-Service-Author', 'Lfmaven/ticket_system');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    const origEnd = res.end.bind(res);
    res.end = ((...args: Parameters<typeof origEnd>) => {
      if (!res.headersSent) {
        const ms = (performance.now() - start).toFixed(1);
        res.setHeader('X-Response-Time', `${ms}ms`);
      }
      return origEnd(...args);
    }) as typeof res.end;
    next();
  });

  app.use(express.json({ limit: '256kb' }));

  // Malformed JSON error handler
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: 'invalid_json',
        message: 'Corpo JSON malformado. Verifique a sintaxe enviada.',
      });
      return;
    }
    next(err);
  });

  // Cloud Run / Load Balancer direct healthcheck endpoints
  const healthHandler = (_req: Request, res: Response) => {
    const db = loadDb();
    res.status(200).json({
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
  };

  app.get('/healthz', healthHandler);
  app.get('/api/health', healthHandler);

  // Mount API v1
  const apiRouter = createApiRouter();
  app.use('/api/v1', apiRouter);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        maxAge: '1d',
        index: false,
      }),
    );
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res
          .status(503)
          .send('Build dist/index.html não encontrado. Execute npm run build.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(
      `TicketCore API & Workbench rodando em http://0.0.0.0:${port} (${process.env.NODE_ENV || 'development'})`,
    );
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
