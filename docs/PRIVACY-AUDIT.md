# Personal-data audit — 2026-10-17

## Scope and important limits

Reviewed application routes/components, hooks, configuration, standalone HTML,
data-generation scripts, harvested JSON/catalog data, dependencies and log/error/
storage/network call sites. This is a client-only prototype: there is no server,
database, actual login, account registration, payment execution or order dispatch.
The audit describes source behavior, not a captured runtime network trace. Provider
logs, hosting retention, browser autofill/history, device backups and services on
other origins cannot be inspected or erased here. No passwords, dates of birth,
card numbers, CVVs, bank accounts, or geolocation coordinates are collected by the
implemented app. Catalog prices/store addresses are not customer personal data.

## Collection → travel → destination / retention

| Entry point | Data | Travel / processing | Destination and retention |
| --- | --- | --- | --- |
| `app/(tabs)/index.tsx`, `AccountContent` | Name, email, mobile | TextInput → component `profile`; basic validation; name rendered in greeting | React memory only; cleared when Account unmounts, reloads, or local deletion runs. No registration/network call |
| Same file, `CartContent` checkout | Name, phone, delivery address | TextInput → `customer`; validation only. Address cleared when switching to collection | Memory only; now cleared on dismiss/completion, unmount, or deletion. Not copied into order records or sent |
| Same file, checkout choices | Home/collection, showroom selection | Local selection → order status string (collection city), estimated date | Order history in parent React memory until reload/deletion |
| Same file, `HomeScreen`/`AppSession`, `SearchContent`, `ShopContent` | Free-text searches (could include PII), category/filters, saved product IDs, bag/quantity | In-memory catalog matching and local navigation | React state only; no search analytics/query-string submission. Session reset erases all |
| Same file, order/warranty UI | Generated order reference, purchase/ETA dates, items/categories, total/status; claimed warranty selections | Local order callback → parent orders; warranty references in Account state | Memory only; deletion resets both. No warranty request dispatched |
| `app/ProductDetails.tsx` | Size/fabric/color selections, selected product | Local state; product slug used for public product GET | Selection in memory; public product service receives slug, not entered contact information |
| `assets/Royal_Furniture_app.html` checkout | Name/mobile, emirate, showroom, delivery/payment-method choice | DOM inputs → `s.cn`, `s.cp` and selection state; local demo validation | Memory; name/mobile cleared on successful demo order. No card entry or processor call |
| Same HTML store booking | Name/mobile, showroom/day/time slot | DOM inputs → `s.bk`; local validation → booking summary without name/mobile | Memory; booking form cleared on completion; all cleared by deletion/reload |
| Same HTML search/shopping | Query, language, cart, wish list, order/visit history | Local JS state and rendering | Previously history persisted in localStorage `rf`; persistence removed; old key removed on load. Now memory only |
| Browser loads app / remote assets | IP address, user-agent/client hints, request times, requested paths, potentially referrer/cookies according to browser/provider policy | Automatic HTTP transport, not explicit form data | Hosting/CDN/provider infrastructure; retention unknown and outside this repository |

No collected form values are concatenated into API requests, email/WhatsApp links,
logs or order records. A user can independently put personal data into a search or
third-party message; app code cannot control what they share outside it.

## External integrations and exactly what app code sends

| Destination / integration | Outgoing application fields | Automatic metadata / status |
| --- | --- | --- |
| `rylqus.ae/api/products/product-detail/...` (both product implementations) | Product slug in GET path; optional `locale: en`, `country: ae` headers; no body/contact fields | IP/device HTTP metadata. Now `credentials: omit`, `referrerPolicy: no-referrer`; no app cookies/authorization sent |
| Public S3 image bucket (`royal-furniture-…amazonaws.com`) | Catalog image path when remote image fallback is rendered | IP/device metadata; browser image referrer/cookie behavior not centrally controlled by React Native Image. No form fields passed |
| Google Fonts (`fonts.googleapis.com`, downstream `fonts.gstatic.com`) | Font family/weights in stylesheet URL, browser-chosen font resource requests | IP/device metadata; stylesheet link now no-referrer in main app, HTML has no-referrer document policy. Self-host fonts to eliminate provider contact |
| Standalone HTML Google Maps direction link | Fixed public Royal Furniture store address in URL query | Only on user navigation; Maps may use its own account/cookies/location permissions, outside app control |
| Standalone HTML WhatsApp/email/telephone links | Fixed support destination, no prefilled customer details | User-initiated external app/provider; later messages and sender identity handled externally |
| Expo / React Native / router / UI SDKs | Navigation/rendering/device window sizing locally | No analytics/error-tracking/payment/email/AI SDK initialized. Expo CLI development tooling may make tooling requests; production runtime behavior must be checked in deployment |
| `hooks/useFrameworkReady.ts` | Calls optional host `window.frameworkReady()` with no arguments | Host-provided implementation outside repo; no form state passed |

Camera, WebView, AsyncStorage and related packages are installed but not used to
collect/persist personal data. Tabby, Tamara, PayPal, Apple/Samsung Pay and card
labels in demo copy are **not** live payment integrations. There is no hidden
payment transmission implemented by those labels.

## Logs and errors

Reviewed console/logger/print calls and catch/error paths throughout app, scripts
and HTML. No user-data logging found, so no PII log needed redaction.
`data/tools/build-master.mjs` prints aggregate catalog counts/file size only.
`scripts/check-secrets.py` reports paths/line numbers, never matched values.
Fetch errors use generic local messages, not raw response/error dumps. Platform,
Metro and third-party infrastructure logs are not controlled by these statements.

## Passwords and API boundaries

No password form, hash generation, password persistence, auth endpoint or user API
exists; adding a hash to a non-existent flow would not improve security. Future
real authentication must use a trusted backend/provider and Argon2id, bcrypt or
scrypt with appropriate salts/work factors; never persist plaintext. Transport
must use TLS. No sensitive server credential belongs in the browser.

There are no owned API responses to filter. Added a recursive field allowlist in
`app/privacy/productResponse.ts`, applied at both external product JSON ingestion
points, dropping unrecognized fields (including user objects, email, password hashes
and internal IDs) before component state retains them. Only product descriptions,
variants/specifications, images, price, stock and display metadata are retained.
This is **client retention filtering, not server response filtering**: the external
provider's full JSON still reaches browser memory/network tools before projection.
An upstream leak must be fixed by that provider or a controlled backend. Product
free-text fields can themselves contain unexpected content; a key allowlist cannot
prove that an upstream description contains no PII. Do not use this helper for a
future user/account API; define that endpoint's own explicit schema and authorization.

## Storage and deletion fixes

- Main app has no cookie writes, localStorage/sessionStorage writes, AsyncStorage
  use, database or durable account record. No cookie flags to repair. Future server
  session cookies must be HttpOnly, Secure and SameSite with CSRF protection.
- Removed HTML localStorage history loading/writing, purged legacy `rf` on load,
  and also attempt that migration when the main app mounts on the same origin.
  Blocked storage failures are safely ignored. Old copies on other origins/devices
  are not erased: open the updated HTML there or clear that site's browser storage.
- Added Account → **Delete account & local data** → confirmation/cancel. Confirmation
  remounts the entire application session, clearing profile, draft checkout, orders,
  warranty selections, cart, saved items, searches, product selections and notices.
  Returns to a fresh Home screen; does not pretend to delete a server account.
- Added More → **Delete all local demo data** with confirmation in standalone HTML;
  removes old `rf` then reloads to reset all in-memory forms/history/preferences.
- Checkout now clears PII on close/success and clears address when collection is
  selected. Replaced misleading checkout/contact confirmation text with demo-only
  wording: no real order was sent and staff will not contact the user from this app.
- Escaped standalone HTML user-input values before inserting them into generated
  markup, reducing input-to-markup injection risk. This is not a full XSS audit.
- Restricted public product requests to no credentials/referrer; no surplus form
  fields were sent before or after. Added response retention allowlisting.

Deletion cannot securely overwrite garbage-collected RAM, remove screenshots,
browser-managed autofill, host logs, provider logs, caches on other devices or
unrelated site storage. There is no server deletion endpoint because no server
account exists. Production account deletion needs authenticated server-side erasure,
processor deletion propagation, retention/legal rules and documented backup handling.

## Validation and deployment follow-up

- `npm run typecheck`: passed after changes.
- Product allowlist assertions: reject nested email/hash/user/internal ID fields,
  retain product display fields and regional price.
- Standalone HTML inline JavaScript syntax compiled successfully.
- Manual browser interaction/network verification still required: Account deletion
  cancel/confirm, checkout dismissal and success, HTML booking/deletion, remote image
  referrers, and all third-party requests on the actual hosting origin.
- Configure host access-log minimization/retention; publish an accurate privacy
  notice. Self-host fonts/images if avoiding third-party IP exposure is required.
- This prototype is not production authentication, checkout or data-subject-request
  infrastructure. Do not represent it as such or request real personal information.

## Update — Stripe sandbox added 2026-10-18

The optional sandbox now adds a backend and opaque ownership cookie. See
[the sandbox data-flow and retention details](STRIPE-SANDBOX.md#data-and-security-behavior).
Contact forms still are not submitted. Product IDs/quantities go to the backend,
server-priced product names/amounts and return URLs go to Stripe, and payment/contact
details entered on Stripe's hosted page go directly to Stripe. Local deletion clears
our short-lived sandbox records/cookie, not Stripe-held records. No real payments or
fulfilment are enabled. Earlier client-only observations describe pre-sandbox behavior.
