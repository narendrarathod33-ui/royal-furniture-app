import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductionServer, configuration } from './serve-production.mjs';

test('production configuration fails closed', () => {
  for (const env of [{}, { APP_ORIGIN: 'http://example.com' }, { APP_ORIGIN: 'https://example.com/' }, { APP_ORIGIN: 'https://example.com', PORT: 'invalid' }]) assert.throws(() => configuration(env));
  assert.equal(configuration({ APP_ORIGIN: 'https://example.com' }).port, 8080);
});

test('built production responses are hardened including failures', async () => {
  const server = await createProductionServer({ origin: 'https://example.com' });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, options, status] of [['/', {}, 200], ['/.env', {}, 404], ['/missing.js', {}, 404], ['/admin-backdoor', {}, 404], ['/test', {}, 404], ['/debug', {}, 404], ['/seed-data', {}, 404], ['/login', { method: 'POST' }, 405], ['/', { headers: { Origin: 'https://evil.example' } }, 403], ['/', { headers: { Origin: 'https://example.com' } }, 200]]) {
      const response = await fetch(base + path, options);
      assert.equal(response.status, status, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
      assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
      assert(!response.headers.get('content-security-policy').includes("'unsafe-eval'"));
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      if (status !== 200) {
        const body = await response.json();
        assert.deepEqual(Object.keys(body).sort(), ['correlationId', 'detail', 'instance', 'status', 'title', 'type']);
        assert.equal(body.correlationId, response.headers.get('x-request-id'));
        assert.equal(body.status, status);
        assert.match(response.headers.get('content-type'), /^application\/problem\+json/);
        assert(!JSON.stringify(body).includes('Error:'));
      } else if (path === '/') {
        const html = await response.text();
        assert(!html.includes('localhost:'));
        const script = html.match(/src="([^"]+\.js)"/)[1];
        const bundle = await fetch(base + script);
        assert.equal(bundle.status, 200);
        assert.match(bundle.headers.get('content-type'), /javascript/);
        assert(!/\b__DEV__=true\b/.test(await bundle.text()));
      }
    }
  } finally { await new Promise((done) => server.close(done)); }
});
