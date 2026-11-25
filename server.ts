import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const ID_SEG = '[a-zA-Z0-9_-]{8,64}';
const NAME_SEG = '[a-zA-Z0-9._~%-]{1,128}';

const ALLOWED_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^\/user\/tokens\/verify$/ },
  { method: 'GET', pattern: /^\/accounts$/ },
  { method: 'GET', pattern: /^\/zones$/ },
  { method: 'GET', pattern: new RegExp(`^/zones/${ID_SEG}$`) },
  { method: 'GET', pattern: new RegExp(`^/accounts/${ID_SEG}/workers/scripts$`) },
  {
    method: 'GET',
    pattern: new RegExp(`^/accounts/${ID_SEG}/workers/scripts/${NAME_SEG}/secrets$`),
  },
  {
    method: 'PUT',
    pattern: new RegExp(`^/accounts/${ID_SEG}/workers/scripts/${NAME_SEG}/secrets$`),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/accounts/${ID_SEG}/workers/scripts/${NAME_SEG}/secrets/${NAME_SEG}$`),
  },
  {
    method: 'PUT',
    pattern: new RegExp(`^/accounts/${ID_SEG}/workers/scripts/${NAME_SEG}/secrets/${NAME_SEG}$`),
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^/accounts/${ID_SEG}/workers/scripts/${NAME_SEG}/secrets/${NAME_SEG}$`),
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^/accounts/${ID_SEG}/workers/scripts/${NAME_SEG}/secrets-bulk$`),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores$`),
  },
  {
    method: 'POST',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores$`),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores/${ID_SEG}$`),
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores/${ID_SEG}$`),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores/${ID_SEG}/secrets$`),
  },
  {
    method: 'POST',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores/${ID_SEG}/secrets$`),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores/${ID_SEG}/secrets/${ID_SEG}$`),
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores/${ID_SEG}/secrets/${ID_SEG}$`),
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^/accounts/${ID_SEG}/secrets_store/stores/${ID_SEG}/secrets/${ID_SEG}$`),
  },
  {
    method: 'POST',
    pattern: new RegExp(
      `^/accounts/${ID_SEG}/secrets_store/stores/${ID_SEG}/secrets/${ID_SEG}/duplicate$`
    ),
  },
];

function validateCloudflareTarget(method: string, rawPath: string): { valid: boolean; cleanPath?: string; reason?: string } {
  if (!ALLOWED_METHODS.has(method)) {
    return { valid: false, reason: 'Método HTTP não permitido.' };
  }
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) {
    return { valid: false, reason: 'Caminho de API inválido.' };
  }
  if (rawPath.includes('..') || rawPath.includes('\\') || rawPath.includes('@') || rawPath.includes('://')) {
    return { valid: false, reason: 'Caminho de API rejeitado.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawPath, CF_API_BASE);
  } catch {
    return { valid: false, reason: 'URL de destino malformada.' };
  }

  const pathname = parsedUrl.pathname;
  const isAllowed = ALLOWED_ROUTES.some(
    (route) => route.method === method && route.pattern.test(pathname)
  );

  if (!isAllowed) {
    return { valid: false, reason: 'Endpoint fora da lista permitida da Cloudflare API v4.' };
  }

  return {
    valid: true,
    cleanPath: `${pathname}${parsedUrl.search}`,
  };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.post('/api/cloudflare/request', async (req: Request, res: Response) => {
    const tokenHeader = req.header('X-Cloudflare-Token');
    if (!tokenHeader || typeof tokenHeader !== 'string' || tokenHeader.trim().length < 10) {
      res.status(401).json({
        success: false,
        errors: [{ code: 401, message: 'API Token da Cloudflare ausente ou inválido.' }],
      });
      return;
    }

    const body = req.body as { method?: unknown; path?: unknown; payload?: unknown } | undefined;
    const method = typeof body?.method === 'string' ? body.method.toUpperCase() : '';
    const rawPath = typeof body?.path === 'string' ? body.path : '';

    const validation = validateCloudflareTarget(method, rawPath);
    if (!validation.valid || !validation.cleanPath) {
      res.status(400).json({
        success: false,
        errors: [{ code: 400, message: validation.reason || 'Requisição inválida.' }],
      });
      return;
    }

    const targetUrl = `${CF_API_BASE}${validation.cleanPath}`;
    const hasBody = method !== 'GET' && method !== 'DELETE' && body?.payload !== undefined;

    try {
      const cfResponse = await fetch(targetUrl, {
        method,
        headers: {
          Authorization: `Bearer ${tokenHeader.trim()}`,
          'Content-Type': 'application/json',
        },
        body: hasBody ? JSON.stringify(body.payload) : undefined,
      });

      const responseText = await cfResponse.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = {
          success: cfResponse.ok,
          errors: cfResponse.ok
            ? []
            : [{ code: cfResponse.status, message: responseText || 'Erro inesperado da Cloudflare.' }],
          result: null,
        };
      }

      res.status(cfResponse.status).json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha de rede ao conectar à Cloudflare.';
      res.status(502).json({
        success: false,
        errors: [{ code: 502, message }],
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Secrets Manager server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
