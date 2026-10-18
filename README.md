# Royal Furniture

Expo / React Native furniture catalog with a web preview.

## Run

```sh
npm install
EXPO_NO_TELEMETRY=1 npx expo start --web --host lan --port 4000
```

`npm run typecheck` checks TypeScript. `npm run build:web` exports the web app.
No environment variables are currently required; `.env.example` documents this.

## Secret safety and deployment

**Rotate any previously hardcoded secrets immediately.** Removing a value from
source or moving it into an environment variable does not remove it from Git
history, previous builds, caches, logs, or already downloaded browser bundles.
Revoke the old credential at its provider first, replace it in server-side secret
storage, and coordinate history cleanup if an exposure is found. Never paste real
credentials into issues, documentation, examples, or scan reports.

This is an Expo client, not a trusted backend. `EXPO_PUBLIC_*` values are embedded
in the shipped bundle. Next.js `NEXT_PUBLIC_*` and React `REACT_APP_*` have the same
public-exposure implications in their respective frameworks. An unprefixed variable
is not automatically safe if build configuration injects it into the client.
Never ship service-role keys, Stripe secret keys, database URLs, OAuth client
secrets, JWT signing secrets, or private third-party API credentials to the client.
Moving a private key into a public environment variable is not remediation.

For future integrations:

- Supabase: only a public anon/publishable key may reach the client, and only after
  verifying RLS is enabled on **every exposed table**, with least-privilege policies
  and anonymous/authenticated access tests. Also review views, functions and storage
  policies. Service-role/secret keys belong exclusively on the backend. No Supabase
  project, schema, or keys exist in this checkout; live RLS was **not verified**.
- Stripe: only publishable keys may reach the client. Secret keys and webhook
  signing secrets stay on the backend; create/verify payments server-side.
- Database connections, OAuth secrets, JWT signing keys, AWS credentials, OpenAI,
  SendGrid and Twilio keys belong in backend environment variables/secret storage.
  Firebase web config can be public, but restrict keys and enforce Firebase rules;
  Firebase service-account credentials must remain server-side.
- Keep logs allowlisted: never dump environment variables, authorization headers,
  request bodies, provider errors, or connection strings. Return generic public
  errors, not raw backend exceptions.

`.env*` files are ignored except `.env.example`. Keep its entries placeholder-only.
Use deployment-provider secret storage for actual backend secrets; there is no
backend in this repository to hold or proxy such credentials today.

## Audit (2026-10-17)

Reviewed tracked source/configuration, HTML, scripts, generated catalogs and harvest
JSON, dependency lockfile, and all locally reachable Git history (two commits).
Keyword review plus credential-pattern scanning found **no hardcoded credentials**
and no public-prefixed secret environment variables. No secrets needed migration.

| Check | Result |
| --- | --- |
| Supabase anon/service-role, Stripe publishable/secret | No integration or keys found |
| Database URIs, OAuth/JWT secrets, provider credentials | None found |
| Browser environment injection | No environment reads or secret injection found in app/config |
| App logs and error handlers | No credential logging found; product fetch failures are handled generically |
| Build-tool logs | `data/tools/build-master.mjs` prints catalog counts/size only |
| API responses | No server/API route handlers exist here; external product service responses cannot be audited from this checkout |
| Public URLs | Product API, unsigned S3 image URLs, fonts/maps/support links; not credentials |
| Environment-file protection | Broadened ignore to `.env*`, retaining `.env.example` |

Run the repeatable, redacted pattern check before deployment:

```sh
python3 scripts/check-secrets.py --history
```

This check reports locations, not values. It supplements manual review, not a
full provider-aware scanner or an assurance that arbitrary opaque strings are
safe. It skips binary content. Remote/unreachable history, hosting environment
settings, provider-side permissions, the live database, and third-party service
logs/responses are outside this audit. Deployment approval still requires those
checks where applicable. The account and checkout UI are prototypes, not a
production authentication/payment implementation.

## Production deployment

See [the deployment audit](docs/DEPLOYMENT-AUDIT.md) for every requested check,
limitations, and deployment steps. The supported production entry point is:

```sh
npm run build:web
npm run test:production
APP_ORIGIN=https://your-actual-domain.example PORT=8080 npm start
```

`APP_ORIGIN` is required by this production server; `PORT` defaults to 8080.
Neither is needed by the client or development preview. Supply runtime variables
through your hosting environment (the server does not auto-load `.env`). Use an
HTTPS edge proxy, not direct public HTTP. Do not deploy the Expo development server.

## Optional Stripe hosted sandbox checkout

See [Stripe sandbox setup](docs/STRIPE-SANDBOX.md). Set server-only
`PAYMENTS_ENABLED=true`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` alongside
`APP_ORIGIN`, then run the exported app using `npm start`. Live keys are rejected.
`npm run test:payments` runs the offline payment security tests.

This adds a server API, an opaque secure ownership cookie and short-lived in-memory
payment status when enabled. Earlier audit descriptions of a client-only app are
historical; the sandbox document describes the new data flow and limitations.
