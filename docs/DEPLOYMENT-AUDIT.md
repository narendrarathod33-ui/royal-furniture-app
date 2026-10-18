# Predeployment security checks — 2026-10-18

## Result

The client builds and the added production static-server checks pass. This is
**not** approval of an unknown live deployment, real checkout, or authentication.
The app remains a local-data prototype; no real account/order/payment backend exists.

| Requested check | Initial finding | Remediation / final status |
| --- | --- | --- |
| 1. Environment variables | Client has no required secret environment values; no existing production server configuration | PASS for implemented server: required APP_ORIGIN validates as exact HTTPS origin and fails closed; PORT defaults to 8080 and rejects invalid values. Missing build fails startup clearly. No DB/auth/API secrets to validate. `.env.example` updated |
| 2. Debug code | No app debug console calls, test credentials, test endpoints, commented-out executable blocks, or incomplete-security TODO/FIXME found | PASS in reviewed app source. Production uses Expo export, not Metro/dev/tunnel. No debug switch in static server. Offline catalog generator's aggregate console output is intentional CLI output, not app debugging. Test files are not served |
| 3. Error handling | App fetch errors already generic; no server HTTP error policy | FIXED: static server failures return generic JSON plus correlationId / X-Request-ID. No raw errors, stack, paths, queries or headers returned. Internal failures log correlation ID plus safe event/code server-side; routine 4xx are not logged. External API failure formats remain outside our control |
| 4. Headers | No production response-header enforcement existed | FIXED in production server: nosniff, DENY, one-year HSTS, restrictive CSP on successes and application errors; also no-referrer and restrictive Permissions-Policy. Live edge/proxy headers still need verification |
| 5. Auth rate limits | No login/signup/reset/OTP endpoints exist; Account is local UI only | NOT APPLICABLE, not an implemented limiter. POST /login and all writes are rejected; no auth route was invented. Before real auth launches, implement 5 login attempts/min/IP and 3 password resets/hour/IP (plus signup/OTP controls), shared across instances with trusted-proxy configuration |
| 6. CORS | No backend CORS config or wildcard found | PASS for added static server: no Access-Control-Allow-Origin grant, rejects explicit foreign Origin, only configured origin accepted. No credentials/proxying. Public external product API CORS cannot be changed in this repository |
| 7. Database | No database driver, connection, credentials, schema or database listener | NOT APPLICABLE to code. Production DB TLS, credentials, port exposure and firewall rules cannot be verified without deployed infrastructure. Require verified TLS, non-default least-privilege credentials and private network/firewall before any future DB-backed launch |

## Deploy the hardened build

Requires Node.js 20+ and a trusted HTTPS-terminating reverse proxy/load balancer:

```sh
npm install
npm run typecheck
python3 scripts/check-secrets.py --history
npm run build:web
npm run test:production
APP_ORIGIN=https://your-actual-domain.example PORT=8080 npm start
```

Use your hosting provider's runtime environment configuration for APP_ORIGIN.
The Node server does not automatically load `.env` files. Do not set APP_ORIGIN
from user request headers. PORT is the internal HTTP port behind the TLS edge;
restrict direct access to that port to the proxy. Terminate TLS at the edge,
redirect HTTP to HTTPS there, preserve these headers, and ensure edge-generated
errors/redirects have the same required headers. HSTS only takes effect over HTTPS.
No certificates or deployment credentials were supplied, so TLS/edge behavior was
not tested here. Do not expose plain HTTP as the production site.

`npm run dev` is for development only. Do not deploy the Metro server. The live
Arena preview remains a development preview; its iframe requires embedding, whereas
the production server deliberately sends DENY/frame-ancestors none. Do not weaken
production anti-framing headers to make it appear in a preview iframe.

If you choose another static hosting service instead of `npm start`, these Node
headers **will not apply**. Reproduce the policy at that host/CDN and retest. No
provider-specific configuration was guessed or claimed deployed.

## Policy specifics

- Serve only real files under `dist`; do not expose source, repository directories,
  environment files, tests, source maps or the standalone legacy HTML.
- Unknown routes are 404, including test/debug/backdoor/seed routes. Explicit current
  SPA entry paths work; extend that allowlist when adding real client routes.
- Scripts restricted to self plus SHA-256 hashes of any exported inline bootstrap
  scripts. No unsafe-inline scripts, unsafe-eval, external script domains or objects.
- Inline styles are necessary for React Native Web; style-src permits unsafe-inline
  styles only. Fonts restricted to self/Google Fonts, images to self/data/blob and
  the existing public image bucket, connections to self/the existing product API.
- Public product API requests remain credential-free. This server is not an API
  proxy and does not bypass third-party CORS.
- No raw detailed exceptions logged: operational diagnostics use safe codes and
  correlation IDs, avoiding inadvertent PII from raw exceptions/request metadata.
- A CSP is not a substitute for output escaping, authorization or dependencies review.

## Tests actually run

- Expo production web export: passed, minified production bundle generated.
- TypeScript: passed.
- Secret-pattern scan with local reachable history: passed (zero potential findings).
- Node tests: missing/invalid origin and port fail configuration; success, missing
  file, hidden env, test/debug/backdoor/seed routes, rejected write, and foreign/same
  origins checked; security headers present on each; generic error body and
  correlation ID match; JS asset MIME and serving verified.
- Browser execution/CSP compatibility across all screens and actual live-domain
  headers have **not** been tested. Confirm Fonts/images/product details, account
  deletion and checkout demo behavior on staging before release.

No claims are made about unprovided infrastructure or external provider security.

## Update — optional sandbox backend, 2026-10-18

The static server now also hosts the optional Stripe sandbox API. See
[setup and security limits](STRIPE-SANDBOX.md). When enabled it requires server-only
Stripe test/signing secrets and fails startup when they are missing. No auth or DB
was added. Checkout creation is rate-limited; webhook requests use signature
verification rather than browser Origin authorization. Cookies are opaque and
HttpOnly/Secure/SameSite. All payment routes retain the existing security headers.
This is single-instance, ephemeral sandbox state, not live commerce infrastructure.
