# Tracking Plan — Lean, First-Party Analytics

> One tiny `analytics` module owns ALL tracking. Nothing here fires before consent; Decline = no behavior tracking. Server revenue numbers always come from the orders document (server-side), never from the browser.

## 1. Consent model

- Storage: `localStorage` key `pb_analytics_consent` = `{ v: 1, choice: "accept" | "decline" | "choose", ts: ISO }`. Banner: Bangla + English, Accept / Decline / Choose; "আমার পছন্দ বদলান" link in footer.
- No consent recorded → no behavior events (no session ID, no events sent). Server revenue stats (from orders) are unaffected because they are normal business records.
- Consent record is append-only on the server when a linked customer accepts: `customerId, choice, version, ts`.
- Anonymous→customer merge at login ONLY if analytics/personalization consent accepted; never retroactively for visitors who declined.

## 2. Visitor identity

- `visitorId`: random UUID in localStorage (first-party, random — NOT a fingerprint).
- `sessionId`: random UUID per session (30-min inactivity window, client-side).
- No raw IPs stored. UTM/referrer stored from `document.referrer` + URL params, coarse only.
- Staff/bot exclusion: requests with the admin session cookie on `/admin|/vendor` are excluded by the client (never fire) and by the server (drop).

## 3. Event catalog

| Event | Properties (max) | Where captured | Chart
| --- | --- | --- | --- |
| `page_view` | path, ref (coarse host), utm_source/medium/campaign, locale, device, screen_bucket, tz_offset_h | `PageDataRoute` mount (App.tsx key already remounts per route) | Overview trend, Traffic views
| `session_start` | visitor_new (bool), device, os, browser, language | same mount, once per session | Live now, new vs returning
| `session_end` | duration_s, page_count, entry, exit | `visibilitychange`/`pagehide` via `navigator.sendBeacon` | Session duration, pages/session
| `heartbeat` | every 60s while visible+active | module timer | Live visitors now (5-min window)
| `product_view` | product_id, slug, category_id, price_poisha (SERVER-CANONICAL from page data, never client-trusted) | ProductDetailClient mount | Products view
| `product_dwell` | product_id, active_dwell_ms (pauses on hidden/idle ≥60s), scroll_pct | final value via `sendBeacon` on `visibilitychange`/`pagehide` | Avg/median dwell, scroll
| `gallery_use` | product_id, action(open/arrows/zoom) | gallery component | Products view
| `variant_select` | product_id, variant_id | variant UI | Products view
| `add_to_cart` | product_id, variant_id?, qty, position (list slot) | cart store action | Funnel, Products
| `wishlist_add` | product_id | wishlist store action | Products
| `out_of_stock_view` | product_id, variant_id | stock-guarded UI | Products
| `list_click` | list_id (home/shop/category), product_id, position | ProductCard click-through | Products
| `search` | q (≤80 chars, server-trimmed), filters, results_count | ShopCatalogClient | Search view (zero-result list)
| `checkout_step` | step: cart→address→payment→confirm | CheckoutClient | Funnel
| `js_error` | message (≤200), stack_top (≤200), path | window.onerror/unhandledrejection, rate-limited 5/min | Errors view
| `api_failure` | path (≤120), status, ms | fetch wrapper (only failed responses) | Errors view
| `web_vitals` | lcp, inp, cls (rounded) | PerformanceObserver, once per load | Errors view

Server-side events (source of truth, written by the backend, never by the browser):
| Event | Source |
| --- | --- |
| `order_placed` / `order_cancelled` / `order_returned` | orders document transitions (funnel purchase + revenue) |
| `cod_refusal` | courier status document (return rate) |

Revenue views compute ONLY from the orders document: orders, revenue, AOV, by source/product/category, cancellations/refunds, COD refusal rate. Browser numbers are never trusted for money.

## 4. Transport & module design

- Single typed module `artifacts/panchabindu/src/lib/analytics/tracker.ts` (plus `consent-banner.tsx` UI). No other file may call fetch/beacon for tracking.
- Batch: buffer up to 20 events or 15 s, whichever first; flush via `fetch keepalive` POST `/api/analytics/ingest`; on `visibilitychange`/`pagehide` flush remaining with `navigator.sendBeacon` (Blob, `application/json`).
- Budget: module gzipped target < 3 KB `[ASSUMED]` — verify in RUNBOOK; async import after first paint so it never affects LCP/INP; no layout shift (banner is `position:fixed` bottom, rendered after consent check, `display` toggled).
- Kill switch: `ANALYTICS_ENABLED_SERVER` (env) → ingestion returns 204 always; client also checks `VITE_ANALYTICS_OFF=1` build flag and never buffers.
- De-duplication: each event gets a client `event_uuid`; server drops duplicates within the batch document; `page_view` suppressed for identical path within 3 s (route remount / StrictMode double-invoke protection).
- Failure policy: swallow all tracker errors; tracker must never throw into app code; if ingestion is down/slow/500 the shop and checkout are unaffected (fire-and-forget, no await on the critical path).

## 5. Storage (inside the existing ten-document JSONB contract)

- `analytics_events` document: array of compact events, each ≤ 300 bytes, hard cap `ANALYTICS_MAX_DOCUMENT_BYTES` (default 2 MB) — on overflow the oldest events are dropped first and a `storage_dropped` counter increments.
- `analytics_daily` document: per-day aggregate map `YYYY-MM-DD (Asia/Dhaka) → { views, sessions, addToCart, checkoutSteps{...}, purchases, revenuePoisha, perProduct: {productId → views, dwellMsSum, atc, purchases}, perSource: {...} }`, trimmed to 730 days.
- Retention: raw events purged after `ANALYTICS_RAW_RETENTION_DAYS` (default 35) by the purge routine (app-start best-effort + scheduled GitHub Action calling a secured admin endpoint), never by trusting the client.
- No PII in either document: no names, phones, emails, addresses, raw IPs, or precise location. Only `customerId` (already business data in orders) appears on consented linked sessions.

## 6. Ingestion endpoint rules

- `POST /api/analytics/ingest`: JSON only, max body 32 KB, max 20 events/batch, max 10 batches/min/IP (in-memory bucket), CORS locked to `APP_URL` origins (same-origin by default), schema-validated per event (unknown props dropped, strings trimmed/capped), staff-session requests dropped, no client-trusted prices/amounts accepted.
- Endpoint must never touch auth state, must never throw, always returns 204 or 400 with no PII in errors.

## 7. Admin views (5 only)

1. Overview — today/7d/30d + compare, live now (heartbeat window), orders/revenue/AOV from orders document, trend lines.
2. Products — views, avg/median dwell, ATC rate, purchase rate, "high interest, low sales" list.
3. Funnel & Abandonment — view→ATC→checkout steps→purchase with drop-off; abandoned carts (value, items, last step) from the existing abandoned-cart engine.
4. Traffic & Audience — sources, UTM, devices, hours heatmap. Coarse only.
5. Errors & Storage health — JS/API errors, vitals, DB document size vs 2 MB cap + projected 500 MB budget, warning at 70%.

Each view: date range + compare period, CSV export (formula-neutralized), loading/empty/error states, `Asia/Dhaka` timezone.
