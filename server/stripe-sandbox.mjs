import Stripe from 'stripe';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';

export function paymentConfiguration(env = process.env) {
  const enabled = env.PAYMENTS_ENABLED === 'true';
  if (env.PAYMENTS_ENABLED && !['true', 'false'].includes(env.PAYMENTS_ENABLED)) throw new Error('PAYMENTS_ENABLED must be true or false.');
  if (!enabled) return { enabled: false };
  if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('STRIPE_SECRET_KEY must be a Stripe test-mode secret key. Live keys are refused.');
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new Error('STRIPE_WEBHOOK_SECRET must be the signing secret for your sandbox webhook.');
  return { enabled, key: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET };
}

export async function loadCatalog() {
  const products = new Map();
  // These generated TypeScript files contain JSON literals, not executable configuration.
  for (const name of ['royalFurnitureData', 'dealsCatalog', 'catalogData']) {
    const source = await readFile(new URL(`../app/data/${name}.ts`, import.meta.url), 'utf8');
    const data = JSON.parse(source.slice(source.indexOf('=') + 1).replace(/\s+as const;?\s*$/, ''));
    for (const item of Array.isArray(data) ? data : data.products) products.set(item.id, { name: item.n, price: item.o });
  }
  const sizes = JSON.parse(await readFile(new URL('../harvest/sizes-priced.json', import.meta.url), 'utf8')).sizes;
  return { products, sizes };
}

export function priceCart(items, catalog) {
  if (!Array.isArray(items) || !items.length || items.length > 30) throw new Error('INVALID_CART');
  const merged = new Map();
  for (const item of items) {
    if (!item || Object.keys(item).some((key) => !['productId', 'quantity'].includes(key)) || typeof item.productId !== 'string' || item.productId.length > 400 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw new Error('INVALID_CART');
    const [base, encoded, ...extra] = item.productId.split('::size=');
    const product = catalog.products.get(base);
    if (!product || extra.length) throw new Error('INVALID_CART');
    let price = product.price;
    let name = product.name;
    if (encoded !== undefined) {
      const size = decodeURIComponent(encoded);
      const slug = base.replace(/^\d+-/, '');
      const options = catalog.sizes[slug] || catalog.sizes[slug.replace(/-[0-9a-f]{6}$/, '')] || [];
      const option = options.find(([label]) => label === size);
      // Unknown/live-only sizes fail closed: never trust client prices or guess a size price.
      if (!option || !Number.isFinite(option[1])) throw new Error('INVALID_CART');
      price = option[1]; name += ` — ${size}`;
    }
    const amount = Math.round(price * 100);
    if (!Number.isSafeInteger(amount) || amount < 50) throw new Error('INVALID_CART');
    const prior = merged.get(item.productId);
    const quantity = (prior?.quantity || 0) + item.quantity;
    if (quantity > 10) throw new Error('INVALID_CART');
    merged.set(item.productId, { productId: item.productId, name, amount, quantity });
  }
  const lines = [...merged.values()].sort((a, b) => a.productId.localeCompare(b.productId));
  const total = lines.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  if (!Number.isSafeInteger(total) || total > 99999999) throw new Error('INVALID_CART');
  return { lines, total };
}

async function rawBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function createSandboxPayments({ origin, settings, stripe: injectedStripe, catalog: injectedCatalog }) {
  if (!settings.enabled) return async (req, res, path, fail) => {
    if (path === '/api/payments/config' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"enabled":false}'); }
    else fail(404);
  };
  const stripe = injectedStripe || new Stripe(settings.key, { timeout: 10000, maxNetworkRetries: 1 });
  const catalog = injectedCatalog || await loadCatalog();
  const owners = new Map();
  const orders = new Map();
  const idempotency = new Map();
  const attempts = new Map();
  const TTL = 24 * 60 * 60 * 1000;
  const reply = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  return async (req, res, path, fail) => {
    const now = Date.now();
      for (const [id, value] of owners) if (now - value > TTL) owners.delete(id);
      for (const [id, value] of orders) if (now - value.created > TTL) orders.delete(id);
      for (const [id, value] of idempotency) if (now - value.created > TTL) idempotency.delete(id);
    for (const [ip, value] of attempts) if (now - value.start >= 60000) attempts.delete(ip);
    if (path === '/api/payments/webhook') {
      if (req.method !== 'POST') return fail(405);
      let event;
      try { event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], settings.webhookSecret); }
      catch { return fail(400); }
      if (event.livemode !== false) return fail(400);
      const session = event.data.object;
      const order = orders.get(session.id);
      if (order && ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && session.payment_status === 'paid' && session.amount_total === order.total && session.currency === 'aed') order.state = 'paid';
      if (order && order.state !== 'paid' && event.type === 'checkout.session.expired') order.state = 'expired';
      // Idempotent state assignment only. No fulfillment or customer/event persistence.
      return reply(res, { received: true });
    }
    if (req.headers.origin && req.headers.origin !== origin) return fail(403);
    if (path === '/api/payments/config' && req.method === 'GET') return reply(res, { enabled: true, mode: 'sandbox' });
    if (path === '/api/payments/session' && req.method === 'POST') {
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return fail(403);
      const idempotencyKey = req.headers['idempotency-key'];
      if (idempotencyKey && (!/^[\x21-\x7e]{1,128}$/.test(idempotencyKey) || idempotencyKey.length > 128)) return fail(400);
      const ip = req.socket.remoteAddress; // Never trust arbitrary X-Forwarded-For.
      const rate = attempts.get(ip) || { start: now, count: 0 };
      if (attempts.size >= 10000 && !attempts.has(ip)) return fail(503);
      attempts.set(ip, rate);
      if (++rate.count > 5) { res.setHeader('Retry-After', '60'); return fail(429); }
      let priced;
      try { const body = JSON.parse((await rawBody(req)).toString()); if (Object.keys(body).some((key) => key !== 'items')) throw new Error(); priced = priceCart(body.items, catalog); }
      catch { return fail(400); }
      let owner = req.headers.cookie?.match(/(?:^|;\s*)__Host-rf_checkout=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (!owners.has(owner)) {
        if (owners.size >= 1000) return fail(503);
        owner = randomBytes(32).toString('hex'); owners.set(owner, now);
        res.setHeader('Set-Cookie', `__Host-rf_checkout=${owner}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
      }
      const fingerprint = createHash('sha256').update(JSON.stringify(priced.lines)).digest('hex');
      if (idempotencyKey) {
        const key = `${owner}:${idempotencyKey}`;
        const previousKey = idempotency.get(key);
        if (previousKey && previousKey.fingerprint !== fingerprint) return fail(409);
        if (previousKey) return reply(res, { url: previousKey.url });
      }
      const previous = [...orders.entries()].find(([, order]) => order.owner === owner && order.fingerprint === fingerprint && order.state === 'pending' && now - order.created < 25 * 60000);
      if (previous) return reply(res, { url: previous[1].url });
      if (orders.size >= 1000) return fail(503);
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment', payment_method_types: ['card'],
          line_items: priced.lines.map((item) => ({ price_data: { currency: 'aed', unit_amount: item.amount, product_data: { name: item.name } }, quantity: item.quantity })),
          success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/?checkout=cancelled`, expires_at: Math.floor(now / 1000) + 1800,
        }, { idempotencyKey: createHash('sha256').update(`${owner}:${fingerprint}:${Math.floor(now / 1800000)}`).digest('hex') });
        if (session.livemode !== false || !session.url?.startsWith('https://checkout.stripe.com/')) throw new Error();
        orders.set(session.id, { owner, total: priced.total, fingerprint, state: 'pending', created: now, url: session.url });
        if (idempotencyKey) idempotency.set(`${owner}:${idempotencyKey}`, { fingerprint, url: session.url, created: now });
        return reply(res, { url: session.url });
      } catch { return fail(502); }
    }
    if (path === '/api/payments/status' && req.method === 'GET') {
      const owner = req.headers.cookie?.match(/(?:^|;\s*)__Host-rf_checkout=([a-f0-9]{64})(?:;|$)/)?.[1];
      const id = new URL(req.url, origin).searchParams.get('session_id');
      const order = orders.get(id);
      if (!owner || !owners.has(owner) || !order || order.owner !== owner) return fail(404);
      return reply(res, { state: order.state, amount: order.total, currency: 'aed' });
    }
    if (path === '/api/payments/local-session' && req.method === 'DELETE') {
      if (req.headers.origin !== origin) return fail(403);
      const owner = req.headers.cookie?.match(/(?:^|;\s*)__Host-rf_checkout=([a-f0-9]{64})(?:;|$)/)?.[1];
      for (const [id, order] of orders) if (order.owner === owner) orders.delete(id);
      owners.delete(owner);
      res.setHeader('Set-Cookie', '__Host-rf_checkout=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
      return reply(res, { deleted: true });
    }
    fail(404);
  };
}
