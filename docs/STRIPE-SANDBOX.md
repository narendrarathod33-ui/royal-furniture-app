# Stripe hosted sandbox checkout

Implemented 2026-10-18. **Test mode only. No real payment or fulfilment.**
The existing local demo remains available without a Stripe account. A second
Stripe sandbox button appears in the bag only when the backend is enabled.

## 1. Get your sandbox values (do not share them in chat)

In your Stripe Dashboard, enter a Sandbox / test environment and get its secret
API key. Store it in **server environment settings** as `STRIPE_SECRET_KEY`.
The server accepts test-mode secret keys only and rejects live keys at startup.
No publishable key is needed: the browser redirects to a server-created Checkout
URL and does not initialize Stripe.js.

Register the sandbox webhook destination:

```
https://YOUR-HTTPS-DOMAIN/api/payments/webhook
```

Subscribe to `checkout.session.completed`, `checkout.session.expired`, and
`checkout.session.async_payment_succeeded`. Set `STRIPE_WEBHOOK_SECRET` to that
endpoint's signing secret. It is different from your Stripe API key. Do not put
either secret in app source, Git, screenshots, chat or public-prefixed variables.

For a local backend, the authenticated Stripe CLI can forward sandbox events:

```sh
stripe listen --forward-to http://127.0.0.1:8080/api/payments/webhook
```

Use the signing secret printed by that listener, not the Dashboard endpoint's
secret. Only one matching webhook setup is needed. CLI loopback forwarding is
server-side tooling; the browser still calls only relative same-origin API paths.
The hosted frontend needs HTTPS for the Secure cookie to work.

## 2. Run the backend and exported frontend together

Set these through your host's server environment settings:

| Variable | Value / behavior |
| --- | --- |
| `APP_ORIGIN` | Exact public HTTPS origin, no trailing slash; redirects are derived from this, never request input |
| `PORT` | Internal server port, default 8080 |
| `PAYMENTS_ENABLED` | `true` to enable; defaults off |
| `STRIPE_SECRET_KEY` | Your sandbox secret API key; required only when enabled |
| `STRIPE_WEBHOOK_SECRET` | Your sandbox endpoint/listener signing secret; required only when enabled |

```sh
npm install
npm run typecheck
npm run build:web
npm run test:production
npm run test:payments
npm start
```

For local secret-file loading on Node 20.6+, copy `.env.example` to an ignored
`.env.sandbox`, fill it privately, and run:

```sh
node --env-file=.env.sandbox scripts/serve-production.mjs
```

`npm start` itself does not auto-load env files. Use a trusted HTTPS reverse proxy
and keep the internal HTTP port private. Both the app and `/api/payments/*` must
be served on the **same HTTPS origin**. Serve the whole repository runtime, not
just `dist`: the backend reads the committed catalog and harvested size-price JSON.
Keep those source files private; only `dist` is exposed by the static server.

The Expo/Metro development preview is not this backend. It will show sandbox as
not enabled. Do not point browser code to localhost or insert secret keys to try
to enable it. Open the standalone HTTPS deployment in a browser tab; production
anti-framing headers intentionally prevent embedding in the Arena preview.

## 3. Make a test payment

1. Open your HTTPS sandbox deployment, add an item to the bag.
2. Choose **Pay with Stripe · test mode** (not Local demo checkout).
3. On Stripe's hosted page use fictitious contact information and Stripe's standard
   success test card `4242 4242 4242 4242`, any future expiry and any valid CVC.
   Never enter real card or personal information in this sandbox.
4. Return to the app. It displays pending until the signed webhook marks the
   owned session paid, then displays **Test payment confirmed**.
5. Verify the matching test payment and webhook delivery in Stripe Dashboard.
6. Test declining card `4000 0000 0000 0002`, authentication-required card
   `4000 0025 0000 3155`, cancel/back, duplicate webhook deliveries and failed
   webhook delivery. Card scenarios can also be selected from Stripe's testing docs.

The local bag is in memory and resets during full-page navigation. No real order
is created, inventory reserved, fulfilment triggered, shipping calculated, tax
calculated or customer notifications sent. The hosted page shows the authoritative
server-priced total. Do not treat local UI totals as a binding live quote.

Unknown/live-only size options are rejected rather than trusting browser prices.
Catalog sibling sizes use their real catalog IDs; harvested size options require
an exact server-known label with a price. Choose another locally priced item/size
if the API returns an unavailable-size message. This is intentionally fail-closed.

## Data and security behavior

- `POST /api/payments/session`: accepts **only** product IDs and integer quantities;
  extra customer/price fields are rejected. Prices/names come from server files,
  amounts are in AED minor units, limits are 30 lines / 10 units per product and
  Stripe's maximum total. No account/checkout contact data is forwarded.
- Stripe receives product names, amounts/quantities, currency, return URLs, and the
  payment/contact details the tester enters directly on Stripe's page. It also
  receives normal browser/network metadata. Review Stripe's retention/privacy
  policies; provider records are not erased by local account deletion.
- `__Host-rf_checkout` is an opaque random ownership cookie: HttpOnly, Secure,
  SameSite=Lax, Path=/, expires after 24 hours. No PII in cookies/localStorage.
- `GET /api/payments/status` returns only state, amount and currency to the owning
  cookie. A session ID in a return URL alone grants no access and proves no payment.
- Webhook signatures verify raw request bytes with the official Stripe SDK. Live
  events are refused; paid status requires matching amount/currency. Replays are
  idempotent state updates, and expiration cannot overwrite paid state.
- Checkout creation is limited to five attempts per minute per socket IP; arbitrary
  X-Forwarded-For is ignored. Behind a reverse proxy this can group all users under
  the proxy IP. Configure a proper edge rate limiter before multi-user deployment;
  do not trust unvalidated forwarded IPs. Bounded in-memory state is sandbox-only.
- Local account deletion clears the cookie and server session status, then resets
  local app data. It does **not** delete Stripe-held records or cancel an already
  created hosted Checkout Session. Complete provider cleanup separately if needed.
- Card-only hosted payments. No payment information passes through our endpoint.
  All errors are generic with a correlation ID; secrets and webhook bodies are not logged.

## Sandbox-only limits / before live payments

Status/ownership/order maps are held in process memory, capped and removed after
24 hours. Restart loses them; multiple instances do not share them. A completed
Stripe test payment may then show unknown even though Stripe still has a record.
Do not blindly pay again: check the Dashboard. There is **no durable order store**
and no production fulfilment. Only one backend instance is supported for this test.

Before live launch, implement a durable transactional order database, reliable
webhook inbox/idempotent fulfilment, trusted pricing/inventory/tax/shipping,
customer authentication/authorization, refunds, retention/deletion processes,
shared rate limits and a production merchant configuration. Do not simply remove
the live-key guard. The payment feature intentionally cannot accept real money.

## Verification performed

Typecheck, production export, static-server tests and payment tests are run locally.
Payment tests use a mocked Checkout creation call plus real Stripe SDK signature
verification with randomly generated test-only signing material. They cover invalid
configuration, catalog validation, price tampering, ownership, duplicate creation,
unsigned/live/mismatched webhook events, replay, expiration, deletion and throttling.

**No real Stripe network transaction has been run**: sandbox credentials and a
public webhook destination were not supplied. Complete steps 1–3 above before
claiming end-to-end sandbox readiness.
