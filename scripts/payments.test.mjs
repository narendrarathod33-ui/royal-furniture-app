import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { paymentConfiguration, loadCatalog, priceCart, createSandboxPayments } from '../server/stripe-sandbox.mjs';

const random = () => randomBytes(24).toString('hex');
const testKey = ['sk', 'test', random()].join('_');
const signing = ['whsec', random()].join('_');
const sdk = new Stripe(testKey);
const origin = 'https://shop.example';
const catalog = { products: new Map([['chair', { name: 'Chair', price: 100 }]]), sizes: {} };

test('sandbox configuration rejects live/missing keys and invalid flags', () => {
  assert.equal(paymentConfiguration({}).enabled, false);
  for (const env of [{ PAYMENTS_ENABLED: 'yes' }, { PAYMENTS_ENABLED: 'true' }, { PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: ['sk', 'live', random()].join('_'), STRIPE_WEBHOOK_SECRET: signing }]) assert.throws(() => paymentConfiguration(env));
  assert.equal(paymentConfiguration({ PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: testKey, STRIPE_WEBHOOK_SECRET: signing }).enabled, true);
});

test('catalog loads and server pricing rejects forged values/sizes/quantities', async () => {
  const real = await loadCatalog();
  assert(real.products.size > 100);
  const [id, product] = real.products.entries().next().value;
  assert.equal(priceCart([{ productId: id, quantity: 2 }], real).total, Math.round(product.price * 100) * 2);
  for (const items of [[], [{ productId: 'missing', quantity: 1 }], [{ productId: 'chair', quantity: 1, price: 1 }], [{ productId: 'chair', quantity: -1 }], [{ productId: 'chair', quantity: 1.5 }], [{ productId: 'chair::size=unknown', quantity: 1 }], [{ productId: 'chair', quantity: 6 }, { productId: 'chair', quantity: 6 }]]) assert.throws(() => priceCart(items, catalog));
  const sizes = { products: catalog.products, sizes: { chair: [['Large', 200]] } };
  assert.equal(priceCart([{ productId: 'chair::size=Large', quantity: 1 }], sizes).total, 20000);
});

async function fixture() {
  let calls = 0; let params;
  const id = 'cs_test_' + random();
  const stripe = { webhooks: sdk.webhooks, checkout: { sessions: { create: async (value) => { calls++; params = value; return { id, livemode: false, url: 'https://checkout.stripe.com/c/pay/' + id }; } } } };
  const handler = await createSandboxPayments({ origin, settings: { enabled: true, key: testKey, webhookSecret: signing }, stripe, catalog });
  const server = http.createServer((req, res) => {
    res.setHeader('X-Request-ID', 'test-reference');
    const fail = (status) => { res.writeHead(status, { 'Content-Type': 'application/problem+json' }); res.end(JSON.stringify({ type: `https://httpstatuses.com/${status}`, title: 'Request Error', status, detail: 'The request could not be completed.', instance: '/api/payments', correlationId: 'test-reference' })); };
    handler(req, res, new URL(req.url, origin).pathname, fail).catch(() => fail(500));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, base: `http://127.0.0.1:${server.address().port}`, id, get calls() { return calls; }, get params() { return params; } };
}

test('hosted checkout, cookie ownership, signed webhook verification, replay and deletion', async () => {
  const f = await fixture();
  try {
    const post = (body, cookie) => fetch(f.base + '/api/payments/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    const response = await post({ items: [{ productId: 'chair', quantity: 2 }] });
    assert.equal(response.status, 200);
    assert((await response.json()).url.startsWith('https://checkout.stripe.com/'));
    const setCookie = response.headers.get('set-cookie');
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert(setCookie.includes(flag));
    const cookie = setCookie.split(';')[0];
    assert.equal(f.params.line_items[0].price_data.unit_amount, 10000);
    assert(!('customer_email' in f.params));
    assert.equal(f.params.success_url, origin + '/?checkout=success&session_id={CHECKOUT_SESSION_ID}');
    const duplicate = await post({ items: [{ productId: 'chair', quantity: 2 }] }, cookie);
    assert.equal(duplicate.status, 200); assert.equal(f.calls, 1);
    const status = () => fetch(f.base + '/api/payments/status?session_id=' + f.id, { headers: { Cookie: cookie } });
    assert.equal((await (await status()).json()).state, 'pending');
    assert.equal((await fetch(f.base + '/api/payments/status?session_id=' + f.id)).status, 404);
    const event = { id: 'evt_' + random(), livemode: false, type: 'checkout.session.completed', data: { object: { id: f.id, payment_status: 'paid', amount_total: 20000, currency: 'aed' } } };
    const webhook = async (value, signed = true) => {
      const payload = JSON.stringify(value);
      return fetch(f.base + '/api/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signed ? { 'Stripe-Signature': sdk.webhooks.generateTestHeaderString({ payload, secret: signing }) } : {}) }, body: payload });
    };
    assert.equal((await webhook(event, false)).status, 400);
    assert.equal((await webhook({ ...event, livemode: true })).status, 400);
    assert.equal((await webhook({ ...event, data: { object: { ...event.data.object, amount_total: 1 } } })).status, 200);
    assert.equal((await (await status()).json()).state, 'pending');
    assert.equal((await webhook(event)).status, 200);
    assert.equal((await webhook(event)).status, 200);
    const paid = await (await status()).json();
    assert.deepEqual(paid, { state: 'paid', amount: 20000, currency: 'aed' });
    await webhook({ ...event, type: 'checkout.session.expired' });
    assert.equal((await (await status()).json()).state, 'paid');
    const deleted = await fetch(f.base + '/api/payments/local-session', { method: 'DELETE', headers: { Cookie: cookie, Origin: origin } });
    assert.equal(deleted.status, 200);
    assert(deleted.headers.get('set-cookie').includes('Max-Age=0'));
    assert.equal((await status()).status, 404);
  } finally { await new Promise((done) => f.server.close(done)); }
});

test('checkout enforces origin, data minimization and rate limits', async () => {
  const f = await fixture();
  try {
    const attempt = (originHeader, body) => fetch(f.base + '/api/payments/session', { method: 'POST', headers: { Origin: originHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await attempt('https://foreign.example', { items: [] })).status, 403);
    assert.equal((await attempt(origin, { items: [{ productId: 'chair', quantity: 1 }], email: 'discard-me' })).status, 400);
    for (let n = 0; n < 4; n++) assert.equal((await attempt(origin, { items: [] })).status, 400);
    const limited = await attempt(origin, { items: [] });
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal(f.calls, 0);
  } finally { await new Promise((done) => f.server.close(done)); }
});
