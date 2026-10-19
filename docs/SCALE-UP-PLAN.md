# Royal Furniture app — phased scale-up plan

**Date:** 19 Oct 2026
**Status:** Planning document only. No phase has been started yet.
**Current live app:** version 3.9.1 — real order requests with WhatsApp confirmation and the Google Sheet order inbox connected.

## How to read this plan

- Spend only when a trigger hits. Do not buy infrastructure "just in case."
- No big rewrite. Each phase keeps the current app selling while the next piece is proven.
- Keep WhatsApp + Google Sheet as a fallback until a replacement is verified with real test orders.
- Effort = one experienced developer, focused, including tests and deployment. It excludes business approvals such as payment-gateway KYC, app-store review, and WhatsApp template approval.
- Money figures are service running costs, not developer labour. Multiply dev-days by your developer's rate for labour cost. Approx. 1 USD = AED 3.67.

## Current baseline (measured at 3.9.1)

- Main JavaScript bundle: 5.92 MB raw, about 1.12 MB gzipped.
- Whole web build: 27 MB, including 21 MB of local product photos (156 files).
- Catalog data baked into the app code: about 3.2 MB of source data, roughly 1,700 products/product images.
- Deployed GitHub Pages site: about 167 MB with 25 retained entry bundles.
- No service worker, no analytics, no error tracking, no CI yet. Product grids do use virtualized lists.
- Orders run through a Google Apps Script + Sheet. Good for launch volume; not designed for bursts or very large order history.

## Phases at a glance

| Phase | Do it when | Effort | Running cost/month |
|---|---|---:|---:|
| 0. Harden what you have | Now, before promoting | 1–2 days | AED 0–100 |
| 1. Real order backend | Before ads, or >20 orders/day | 4–8 days | AED 0–150 |
| 2. Hosting, domain & images | >1–2k visits/day, or slow-load complaints | 2–5 days | AED 20–150 + domain/year |
| 3. Catalog out of the bundle + search | >5k products, or prices change often | 1–3 weeks | AED 0–400 |
| 4. Accounts, payments, inventory | Ready to take money online | 3–6 weeks | AED 300+ + transaction fees |
| 5. Growth ops & native apps | Team cannot keep up manually | Ongoing | AED 500+ |

---

## Phase 0 — Harden the current setup

**Trigger:** Now, before any promotion.
**Effort:** 1–2 days. **Cost:** AED 0–100/month.

Cheap insurance on today's stack:

- Collision-proof order IDs (UUID-based) and a double-tap lock on "Place order," fixing the risk that two orders share an ID and one is silently dropped by the Sheet duplicate check.
- Order outbox/retry: the app marks each order submitted/confirmed. If the Sheet round-trip never confirms it, the app re-sends (the script already de-duplicates) and prompts the customer to confirm on WhatsApp.
- Eyes on the app: Sentry free tier for crash alerts (Team plan is $26/month when a team inbox is needed — https://sentry.io/pricing/), privacy-friendly analytics (visits → product views → checkout starts → orders), and a free uptime check on the website and order endpoint.
- Sheet safety: turn on Google Sheets change notifications, protect the Order ID and Mobile columns from accidental edits, make a weekly automatic backup copy, and archive old rows monthly so lookups stay fast.

**Exit test:** place test orders with the network dropping mid-submit — zero lost orders, zero duplicated orders, and the seller gets alerted.

## Phase 1 — Real order backend

**Trigger:** Before running ads, or once orders pass roughly 20/day, or any lost-order incident.
**Effort:** 4–8 days. **Cost:** AED 0–150/month.

Replace the Sheet as the system of record. The Sheet stays as a familiar export.

- Use Supabase (database + API + auth in one). Build on the free tier; Pro is $25/month (about AED 92) with daily backups when going serious — https://supabase.com/pricing.
- Tables: orders, order_items, customers, and an order_events log (every status change recorded).
- The app submits over HTTPS and receives a real confirmation — or keeps retrying from the outbox. The server generates order IDs and timestamps; idempotency keys kill duplicates even if the customer retries.
- Seller view: start with Supabase's built-in table view (free). When that gets annoying, add a simple password-protected admin page (+2–3 days): order list, search by mobile/order number, status and delivery-date editor, WhatsApp buttons, CSV/Sheet export. New-order alert to the seller by email (and optionally a messaging webhook).
- Order tracking becomes an indexed API lookup — instant even at 100,000 orders — and works for future native apps too (today's Sheet sync is web-only).
- Migration: run dual-write (backend + Sheet) for 1–2 weeks and compare daily counts. Then make the Sheet a read-only export.

**Exit test:** 50 test orders including bursts of 10 at the same time — all present exactly once; status/delivery-date edits appear in the customer's app within seconds.

## Phase 2 — Hosting, custom domain & image pipeline

**Trigger:** More than roughly 1,000–2,000 visits/day, slow-load complaints, or before a serious ad campaign.
**Effort:** 2–5 days. **Cost:** AED 20–150/month + domain roughly AED 50–100/year.

- Move the static site to Cloudflare Pages on your own domain (for example shop.yourbrand.ae). Static asset requests on Cloudflare Pages are free and unmetered — https://developers.cloudflare.com/pages/functions/pricing/. This removes the GitHub Pages ceilings (1 GB published site, soft 100 GB/month bandwidth) and allows year-long immutable caching for hashed bundles, which GitHub Pages cannot set. Add security headers at the same time. Keep GitHub Pages live as a fallback during DNS cutover, then prune its retained old bundles.
- Image pipeline: copy/migrate product photos to Cloudflare Images or R2 and serve device-sized variants (thumbnail / card / large) instead of near-full-size images everywhere. Indicative pricing: Images storage $5 per 100,000 images and delivery $1 per 100,000 delivered — https://developers.cloudflare.com/images/pricing/; R2 storage $0.015/GB-month with free egress — https://developers.cloudflare.com/r2/pricing/. At the current ~1,700-image catalog this is single-digit dollars per month.
- Lazy-load below-the-fold images and set a performance budget in the release gates (entry bundle gzip size, home-screen image weight).

**Exit test:** on a mid-range Android over 4G, first load is visibly faster; the home screen transfers a few hundred KB of photos rather than megabytes; repeat visits load mostly from cache.

## Phase 3 — Catalog out of the bundle + real search

**Trigger:** Assortment grows beyond roughly 5,000 products, prices/stock change frequently, or staff need to edit products without a developer.
**Effort:** 1–3 weeks. **Cost:** AED 0–400/month depending on search choice.

- Serve the catalog as versioned data instead of baking it into the JavaScript: a small index plus per-category/per-product shards, or the Phase 1 database. Price and stock edits then go live without an app redeploy, and new visitors stop downloading every product up front.
- Add an import path from the existing spreadsheet/website feed, with stock/availability flags and a change log.
- Stop browsers calling the rylqus.ae product API directly; cache/proxy product-detail data server-side so one slow or changed third-party API cannot break product pages.
- Search: start with database full-text/trigram search (free). Move to a dedicated search service (for example Algolia or Meilisearch; budget roughly AED 0–400/month at this scale) only if Arabic matching and typo tolerance need it.
- Important: this phase touches the earlier "no bundle split" decision. Bring options first (data sharding vs. service-worker caching vs. both), prototype, measure on a real device, and only proceed with the owner's approval.

**Exit test:** change a price in the admin and see it live in the app within a minute with no deploy; app download size no longer grows when products are added.

## Phase 4 — Accounts, payments & inventory

**Trigger:** Ready to take money online instead of arranging payment manually.
**Effort:** 3–6 weeks. **Cost:** AED 300+/month + transaction/SMS fees.

- Customer accounts via mobile OTP (budget per-SMS fees; get a UAE aggregator quote). Carts and order history move server-side and follow the customer across devices.
- Payments: Stripe UAE standard pricing is 2.9% + AED 1 per successful domestic card transaction, +1% for international cards — https://stripe.com/ae/pricing. BNPL (Tamara/Tabby) is by direct contract; budget a higher negotiated percentage and get quotes.
- Business prerequisites (owner tasks, can take longer than the code): trade licence, UAE bank account, gateway KYC, VAT invoicing, published refund/delivery policies.
- The server becomes the source of truth for prices. It re-prices every order, reserves stock on payment, reconciles gateway webhooks (including duplicates), and handles refunds. Cash on delivery can remain, with phone verification to reduce fake orders.
- Reuse the Stripe sandbox server already in the repo as the starting point, hardened for production.

**Exit test:** full test-payment matrix — success, decline, 3-D Secure, cancelled checkout, refund, duplicate webhook — with matching records in the gateway dashboard and the order backend.

## Phase 5 — Growth operations & native apps

**Trigger:** The team cannot keep up manually, or app-store presence becomes a marketing requirement.
**Effort:** Ongoing. **Cost:** AED 500+/month.

- WhatsApp Business Platform with a shared multi-agent inbox and approved message templates (order confirmed, out for delivery, ready for collection). Per-message charges plus a platform subscription — quote-based.
- CRM basics: customer segments, consented abandoned-cart reminders, repeat-buyer offers. No messaging without consent.
- Native iOS/Android apps from the same Expo codebase (Apple Developer $99/year, Google Play $25 one-time, plus build service costs), push notifications for order updates, and deep links from ads/WhatsApp straight to a product.
- Privacy pack for UAE PDPL: consent wording, data-retention rules, staff access control, customer data export/delete process.

## What not to buy yet

Kubernetes, microservices, a custom search cluster, a data warehouse, or a native rewrite. All add cost and complexity with no benefit at the next 10× of growth.

## Recommended next move

1. Approve **Phase 0** now (1–2 days, about free) — it protects real orders immediately.
2. Approve the **Phase 1 design** and create the Supabase project under the business owner's account (invite the developer; never share passwords).
3. Phases 0 + 1 + 2 together are roughly **1–2 weeks of development** and **under about AED 200/month** in running costs — after that, the app is safe to advertise.

## Related project documents

- Orders inbox setup and daily workflow: `docs/ORDERS-SETUP.md` (also saved in Google Drive as "Royal Furniture — Orders setup guide").
- Live order sheet: "Royal Furniture — Orders" in Google Drive.
