# Account Page (/account) — Threat Matrix & Audit Trace

Page: Account (`/account`), role: customer (guest + authenticated). Branch: `audit/account-2026-11-24`, base `main` @ 23522b8. Agent has GitHub read/write but no shell — no dynamic execution was possible; all findings are `[TRACED]` (verified by reading code paths) or `[ASSUMED]` with stated verification method.

## Connection map [TRACED]

- `/account` → `App.tsx` → `GET /api/page-data?pagePath=/account` → `routes/page-data.ts` `case 'account'` → props `siteSettings, categories, products` → `AccountClient`.
- Auth/session: `GET /api/account/orders` (session probe, unauthenticated returns `{authenticated:false, orders:[]}`), `POST /api/account/orders` (discriminated-union actions: register, login, change_password, update_personal_profile, update_delivery_profile, get_orders, logout).
- All routes are mounted via `routes/imported.ts` on Express 5; 405 + `Allow` on method mismatch; raw bytes preserved for webhook signatures.

## Backend auth findings [TRACED]

`/api/account/orders/route.ts` — **no P0/P1 found.** Server-side Zod discriminated-union validation, origin+CSRF check on POST, JSON body size cap (16 KB), BD phone normalization, httpOnly+secure+lax session cookie, rate limits: login-per-identifier 10/15min, register-per-IP 20/hr, password-change 5/15min, password-per-IP 100/15min. Money is never computed client-side from this page. Password policy: min 10 chars.

### Notes
1. `authBypassed: session.sessionId === 'bypass-customer-session'` is exposed in the GET response. It only reflects sandbox-auth mode (env-gated); it does not bypass auth on any real route `[TRACED]` via crypto-session gate. **Verify in staging with `PANCHABINDU_ENABLE_SANDBOX_AUTH` unset.**
2. Admin security component (`components/security/account-security.tsx`) targets `/api/admin/auth`, not customer account — belongs to the admin page scope, not this page.

## Stack advisories (researched 2026-11-24, live web search)

| Package | Version in lockfile | Advisory | Affected? | Action |
|---|---|---|---|---|
| react / react-server-dom-* | 19.1.0 | CVE-2026-126187 (CVSS 9.5 Critical) — RCE via React Server Components flight payloads | **Not affected** — repo uses Vite SPA (no RSC/SSR frameworks). Advisory itself states apps without RSC are unaffected. | None needed; monitor. |
| vite | ^7.3.8 | CVE-2026-112946 — files outside server.fs.allow served in dev server | **Not affected in production** (Vite dev server only; Vercel serves built assets) | None for prod; dev-only. |
| express | ^5.3.0 | Oct 2026 advisory wave (see expressjs.com blog 2026-10-28 CVE-2026-111181) | **Review needed** — check whether pinned range covers the patch; run `npm audit` locally to confirm. | User to verify with `npm audit`. |
| @supabase/supabase-js | ^2.119.0 | No known 2.x RCE-class advisories at research time | None found | Monitor. |
| drizzle-orm | ^0.45.2 | No advisories found | Not affected | None. |

Research sources: cve.org CVE-2026-126187 (published 2026-10-14), GHSA-xqc2-xf4c-x3h3, expressjs.com blog 2026-10-28, Vite GHSA feed — retrieved 2026-11-24.

## Threat matrix (customer account page)

| Threat | Applies? | Test method | Source/Mapping | Verdict |
|---|---|---|---|---|
| Credential stuffing / brute force on login | Yes | 10/15min per-identifier limit + 100/15min per-IP `[TRACED]` | OWASP A07 | Mitigated server-side. |
| BOLA: customer A reading customer B's orders | Yes | `getAuthenticatedCustomerOrders(token)` — orders bound to session token, not a client-supplied ID `[TRACED]` | API1 BOLA | Mitigated by design. |
| Mass assignment (role/price tampering via update profile) | Yes | Zod discriminated union whitelists fields; no role/price fields exist in schemas `[TRACED]` | API3 | Mitigated by schema whitelist. |
| CSRF on login/register/profile POST | Yes | `verifyOriginAndCsrf(req)` gate on POST `[TRACED]` | OWASP A01 | Mitigated. |
| Session fixation / no logout invalidation | Yes | `revokeCustomerSession` + cookie delete on logout `[TRACED]` | OWASP A07 | Mitigated. |
| XSS in profile fields (name/address echo) | Yes | React auto-escapes output; no `dangerouslySetInnerHTML` in page files read `[TRACED]` | OWASP A03 | Mitigated (pending account-client.tsx full read). |
| Rate-limit bypass via identifier normalization | Partial | Email lowercased + phone normalized before rate-limit keying — normalizing before keying prevents bypass `[TRACED]` | OWASP A07 | Mitigated. |
| Sandbox auth bypass leak | Low | `authBypassed` flag only reflects env-gated sandbox mode `[TRACED]`; verify in staging with env unset | A07 | Verify in staging `[ASSUMED]`. |
| Admin session token XSS theft (AUTH-01, cross-page) | Yes | Fixed on this branch: `admin-fetch.ts` header path removed + regression test flipped | A07/A03 | **COMMITTED** `7cf87e6`+`8f09ebc`; admin-erp-client.tsx edit pending. |

## Account page UX/UI scope

`account-client.tsx` (107 KB) — login/signup/profile redesign requires full-file read; **blocked on agent file-size limit** (see ACCT-BLOCK in LEDGER). Backend chain verified safe; frontend redesign deferred until file access is possible (attach file to chat / shell / browser pairing).

## Residual risks / user verification

1. Run `npm audit` to confirm express 5.3 advisory coverage and any transitive advisories (agent could not execute it).
2. Verify staging with sandbox auth env vars unset — `authBypassed` must be false.
3. Manually test: register (phone+email), login, change password (session clears), delivery-profile save, logout — in the dev preview.
