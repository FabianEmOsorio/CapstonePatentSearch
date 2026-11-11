/**
 * Shared AppSec helpers for Vercel Serverless Functions.
 * Prefixed with '_' so Vercel treats this file as an internal helper rather than a public route.
 *
 * ============================================================================
 * [OPTIONAL PRODUCTION AUTHENTICATION & RATE-LIMIT GUARD - CURRENTLY DISABLED]
 * Intentionally left public for Capstone classroom demo (`ENABLE_API_AUTH !== 'true'`).
 * To activate strict API authentication in production:
 *   1. Set `ENABLE_API_AUTH=true` and `APP_ACCESS_TOKEN=<strong-secret>` in Vercel Env Vars.
 *   2. Set `ALLOWED_ORIGINS=https://your-domain.vercel.app` if deploying under a new URL.
 *   3. Send `x-access-token: <token>` or `Authorization: Bearer <token>` from the client.
 * Note: `enforceRateLimit` is in-memory per serverless instance; for strict distributed
 * throttling across instances, connect Vercel Firewall WAF or Upstash Redis.
 * ============================================================================
 */
import crypto from 'node:crypto';

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://capstonepatentsearch.vercel.app',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

const rateLimitStore = new Map();

export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  if (DEFAULT_ALLOWED_ORIGINS.has(origin)) return true;

  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (extra.includes(origin)) return true;

  if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) {
    return true;
  }

  return /^https:\/\/capstonepatentsearch(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
}

/**
 * Applies restrictive CORS and baseline security headers.
 * Returns true if the preflight OPTIONS request was already terminated.
 */
export function applyApiSecurity(req, res, allowedMethods = 'GET,OPTIONS') {
  const origin = req.headers?.origin;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');

  if (origin) {
    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', allowedMethods);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-access-token');
    } else if (req.method === 'OPTIONS') {
      res.status(403).json({ error: 'Origen no autorizado por política CORS.' });
      return true;
    }
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

/**
 * Per-instance sliding-window rate limiter to mitigate quota exhaustion bursts.
 */
export function enforceRateLimit(req, res, { windowMs = 60_000, maxRequests = 30 } = {}) {
  const fwd = req.headers?.['x-forwarded-for'];
  const rawIp = Array.isArray(fwd) ? fwd[0] : (fwd || '');
  const clientIp = rawIp.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const routeKey = `${req.url?.split('?')[0] || 'api'}:${clientIp}`;
  const now = Date.now();

  const bucket = rateLimitStore.get(routeKey);
  if (!bucket || now > bucket.resetAt) {
    if (rateLimitStore.size > 2000) rateLimitStore.clear();
    rateLimitStore.set(routeKey, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  if (bucket.count > maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Demasiadas solicitudes en un corto intervalo. Intenta nuevamente en unos segundos.' });
    return false;
  }

  return true;
}

/**
 * Optional token authentication guard (DISABLED unless ENABLE_API_AUTH === 'true').
 */
export function enforceOptionalAuth(req, res) {
  if (process.env.ENABLE_API_AUTH !== 'true') {
    return true;
  }

  const expected = (process.env.APP_ACCESS_TOKEN || '').trim();
  if (!expected) {
    res.status(503).json({ error: 'Autenticación activada sin APP_ACCESS_TOKEN configurado en el servidor.' });
    return false;
  }

  const rawAuth = String(req.headers?.authorization || '');
  const bearer = rawAuth.toLowerCase().startsWith('bearer ') ? rawAuth.slice(7).trim() : '';
  const headerToken = String(req.headers?.['x-access-token'] || bearer || '').trim();

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(headerToken, 'utf8');
  const valid = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!valid) {
    res.status(401).json({ error: 'No autorizado. Se requiere token de acceso válido.' });
    return false;
  }

  return true;
}

export function safeHttpUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

export function sanitizePubNumber(pub) {
  if (!pub || typeof pub !== 'string') return 'N/A';
  const cleaned = pub.trim().replace(/[^A-Za-z0-9._-]/g, '').replace(/\.{2,}/g, '');
  return cleaned || 'N/A';
}

export function isValidModelName(model) {
  if (!model || typeof model !== 'string') return false;
  const trimmed = model.trim();
  return /^[a-zA-Z0-9._-]{2,64}$/.test(trimmed) && !trimmed.includes('..');
}

export function sanitizeErrorMessage(err) {
  const msg = String(err?.message || 'Error interno del servicio');
  return msg
    .replace(/([?&](?:key|api_key|token|secret)=)[^&\s]+/gi, '$1***')
    .replace(/(AIza[0-9A-Za-z\-_]{10,}|sk-[0-9A-Za-z\-_]{10,}|gsk_[0-9A-Za-z\-_]{10,})/g, '***')
    .slice(0, 180);
}
