import { paymentConfiguration, createSandboxPayments } from '../server/stripe-sandbox.mjs';
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function configuration(env = process.env) {
  let origin;
  try {
    const url = new URL(env.APP_ORIGIN);
    if (url.protocol !== 'https:' || url.origin !== env.APP_ORIGIN || url.username || url.password) throw new Error();
    origin = url.origin;
  } catch { throw new Error('APP_ORIGIN must be your exact HTTPS frontend origin, without a trailing slash.'); }
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  return { origin, port, payments: paymentConfiguration(env) };
}

export async function createProductionServer(config, directory = resolve('dist')) {
  const payments = await createSandboxPayments({ origin: config.origin, settings: config.payments || { enabled: false } });
  const root = await realpath(directory);
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs, body]) => !/\bsrc\s*=/i.test(attrs) && body.trim())
    .map(([, , body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  const csp = ["default-src 'self'", `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://royal-furniture-515966538173-ap-south-1-an.s3.ap-south-1.amazonaws.com",
    "connect-src 'self' https://rylqus.ae", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"].join('; ');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  return http.createServer(async (req, res) => {
    const id = randomUUID();
    const headers = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=31536000', 'Content-Security-Policy': csp,
      'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Request-ID': id, 'Cache-Control': 'no-store' };
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    const fail = (status) => {
      const title = { 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' }[status] || 'Request Error';
      res.writeHead(status, { 'Content-Type': 'application/problem+json; charset=utf-8' });
      res.end(JSON.stringify({
        type: `https://httpstatuses.com/${status}`,
        title,
        status,
        detail: status >= 500 ? 'The request could not be completed.' : 'The request could not be completed with the supplied data or credentials.',
        instance: req.url,
        correlationId: id,
      }));
    };
    try {
      const apiPath = new URL(req.url, config.origin).pathname;
      if (apiPath.startsWith('/api/payments/')) return await payments(req, res, apiPath, fail);
      // No CORS grant is needed for same-origin content.
      if (req.headers.origin && req.headers.origin !== config.origin) return fail(403);
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return fail(405); }
      const pathname = decodeURIComponent(new URL(req.url, config.origin).pathname);
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some((part) => part.startsWith('.')) || /\.(?:map|env)$/i.test(pathname)) return fail(404);
      let file = resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + sep)) return fail(404);
      if (pathname === '/') file = resolve(root, 'index.html');
      // Explicit SPA routes only; unknown API/debug/config paths must remain 404.
      if (['/index', '/(tabs)', '/(tabs)/index'].includes(pathname)) file = resolve(root, 'index.html');
      file = await realpath(file);
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) return fail(404);
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) || error instanceof URIError) return fail(404);
      // Server-only diagnostic code, no request bodies, paths, headers or raw errors.
      process.stderr.write(JSON.stringify({ event: 'request_failed', correlationId: id, code: 'STATIC_READ_FAILED' }) + '\n');
      fail(500);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = configuration();
    const server = await createProductionServer(config);
    server.on('error', () => { process.stderr.write('Production server could not listen.\n'); process.exit(1); });
    server.listen(config.port, '0.0.0.0');
  } catch (error) {
    process.stderr.write(error.message.startsWith('APP_ORIGIN') || error.message.startsWith('PORT') || error.message.startsWith('STRIPE_') || error.message.startsWith('PAYMENTS_') ? error.message + '\n' : 'Production build missing or unreadable. Run npm run build:web first.\n');
    process.exitCode = 1;
  }
}
