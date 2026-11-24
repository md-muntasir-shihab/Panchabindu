# /admin — Full Admin Panel Audit: Inventory, Connection Map, Threat Matrix

> Page: Admin ERP Workspace · Route: `/admin` · Role: super_admin + RBAC-scoped staff · Date: 2026-11-24
> Method: code-trace via GitHub reader (no shell in agent env). All claims tagged [TRACED] / [EXECUTED].

## 1. Navigation inventory (from ADMIN_NAV_GROUPS in admin-erp-client.tsx) [TRACED]

7 groups, 15 tabs, every tab renders one panel component:

| Nav group (BN/EN) | Tab key | Panel component | Audit status |
| --- | --- | --- | --- |
| ওভারভিউ/Overview | dashboard | AdminCommandDashboard | NOT YET (money dashboard; arithmetic tests exist) |
| | today_screen | AdminErpClient (inline action queues) | NOT YET |
| অর্ডার ও ডেলিভারি/Orders & Delivery | orders_grid | OrdersGridMinimal (+4 sheets) | **AUDITED 2026-11-21** |
| | smart_order_entry | AdminErpClient inline | NOT YET |
| | courier_360 | CourierAndEscrowPanel / CourierReceivablesPanel | NOT YET |
| | print_engine | PrintEnginePanel | **AUDITED 2026-11-21** |
| পণ্য ও ক্যাটালগ/Catalog | product_studio | ProductStudioPanel + CatalogImportPanel | **AUDITED 2026-11-21** |
| ভেন্ডর ও পেআউট/Vendors & Payouts | vendors_hub | VendorsHubPanel (Money & Supply view: test:vendors 15 cases) | PARTIAL — money-core traced 2026-11-24 |
| | vendor_payouts | VendorPayoutsLedgerPanel + VendorPayoutRegisterPanel | money-core traced 2026-11-24 |
| ফাইন্যান্স/Finance | finance_product360 | Phase4cPanels (GL, refunds, reversals, MFS) | NOT YET |
| CRM, মেসেজিং ও সিঙ্ক | crm_contacts | CrmContactsPanel / ContactManagementPanel | NOT YET |
| | messaging_hub | MessagingHubPanel | NOT YET |
| | sync_health | SyncHealthPanel | NOT YET |
| সিস্টেম ও নিরাপত্তা/System & Security | phase5_readiness | Phase5ReadinessPanel | NOT YET |
| | users_and_rbac | Phase7PortalPanel (RBAC matrix) | NOT YET |
| | control_center | Phase6OpsPanel | NOT YET |

Role filtering happens on the original nav items (not the presentation groups) [TRACED — source comment].

## 2. Connection map [TRACED]

- **Data feed:** `GET /api/admin/workspace` single snapshot (orders, vendors, escrow, payouts, finance, CRM, sync, RBAC) — authorized via cookie-first session + `Cache-Control: private, no-store`; every mutation is a POST operation gated by `workspace-policy.ts` (fail-closed RBAC).
- **Auth:** `POST /api/admin/auth` (login, first-login gate, MFA, logout). Cookie: `bg_admin_session` HttpOnly; CSRF double-submit via `bg_admin_csrf_token` + `x-csrf-token`.
- **Aux endpoints:** `/api/admin/vendors`, `/api/admin/vendor-payouts`, `/api/admin/system-health`, `/api/admin/emergency`, `/api/media`, `/api/catalog/import`, `/api/print/:orderNo`, `/api/page-data` (SPA shell).
- **External:** courier webhook + status cron = intentionally NOT_INTEGRATED (fail closed). Supabase Storage for media/KYC. Sentry optional.
- **Pages fed by this panel:** storefront order counts, vendor portal (same session cookie, role-partitioned), dashboard counters.

## 3. Threat Matrix (Step B — researched 2026-11-24, official sources)

| # | Threat | Applies? | Test/verdict | Source |
| --- | --- | --- | --- | --- |
| T1 | **Vite dev-server RCE** GHSA-p4f5-76q4-ffq7 (Critical 9.1, CWE-116) | **YES — CONFIRMED AFFECTED**: lockfile has vite 7.3.2 (`>=7.0.0,<=7.3.7`), dev script runs `vite --host 0.0.0.0` (network-exposed = attack precondition met). Dev tooling only — production Vercel bundle unaffected. Fix: **7.3.8**. OWASP A03. | [EXECUTED research] fix = user runs `npm i -D vite@^7.3.8` + lockfile regen (agent cannot run npm; do NOT hand-edit lockfile) | GitHub Advisory, pub 2026-11-10 |
| T2 | Vite `?vite-wasm-instance` 4-byte file disclosure GHSA-vfpm-58rq-9qcg | NO — affects 8.2.x/8.3.x only; project on 7.3.2 | [EXECUTED research] | GitHub Advisory, pub 2026-10-06 |
| T3 | Drizzle ORM SQLi CVE-2026-39356 (GHSA-gpj5-g38j-94v9) | NO — affected `<0.45.2`; project pins **0.45.2** (the patched release) | [EXECUTED research] | NVD/SentinelOne, pub 2026-04-07 |
| T4 | supabase-js advisory | No known advisory for 2.119.0 as of 2026-11-24; Supabase VDP policy reviewed | [EXECUTED research — absence of advisory, freshness ASSUMED] | supabase/supabase-js security page |
| T5 | zod 4.6.7 | No advisory found (registry latest 4.6.7, 2026-10-12) | [ASSUMED — freshness; recheck with `npm audit`/OSV locally] | npm/PkgPulse |
| T6 | Broken access control (OWASP A01/API BOLA-BFLA) on `/api/admin/workspace` | Low risk — fail-closed policy, RBAC snapshot test, cookie-first auth [TRACED] | covered by `test:security` suites | repo security tests |
| T7 | XSS via session-token body echo (AUTH-01) | **YES — server fix committed (36b95b2, 5301a8a); frontend cleanup pending** | see modules/auth01-frontend-cleanup.md | this audit |
| T8 | Admin login brute force | Rate limit 25/15min/IP + lockout fields [TRACED] | covered in phase1-security tests | repo |
| T9 | Price/money tampering | Server-side integer-poisha + eligibility guards [TRACED] | money.test, manual-courier-vendor tests | repo |
| T10 | Webhook forgery | HMAC fail-closed + 503 NOT_INTEGRATED [TRACED] | webhook tests | repo |

## 4. Findings

```
ID: SEC-01
Severity: P1 (dev-tooling supply chain; production unaffected)
Category: Security (OWASP Top10-2025 A03) | Mapping: CWE-116
Where: artifacts/panchabindu/package.json (vite 7.3.2 devDependency), dev script "--host 0.0.0.0"
What: Vite dev server exposed to the network is vulnerable to remote code execution (GHSA-p4f5-76q4-ffq7, CVSS 9.1 Critical, published 2026-11-10). Any host on the LAN can execute arbitrary code via the __vite-browser-external virtual-module injection and read files outside server.fs.
Impact: full developer-machine compromise + .env secret disclosure while `npm run dev` is running on a shared network.
Evidence: [EXECUTED research] GitHub Advisory GHSA-p4f5-76q4-ffq7 (affects >=7.0.0,<=7.3.7; patched 7.3.8); lockfile vite 7.3.2 [TRACED]; dev script --host 0.0.0.0 [TRACED].
In scope? YES — fix command below (user runs; agent has no shell and must not hand-edit bun.lock/pnpm-lock.yaml).
Fix: npm i -D vite@^7.3.8  (regenerates lockfile); verify with: npm ls vite  → 7.3.8+
```

```
ID: AUTH-01 (carryover, in progress)
Severity: P1 | Security (A07)
Status: server fix + regression test committed (36b95b2, 5301a8a); frontend cleanup instructions committed; awaiting user's test run (previous run failed on environment: missing node_modules, Node 26, Windows symlink EPERM — not code failures).
```

```
ID: VEN-01 (carryover, deferred)
Severity: P3 | audit attribution missing in resetVendorControls()
```

## 5. Test plan (user runs — Windows)

Prerequisites: Node 22.x (nvm use 22), npm install, Developer Mode ON or Admin PowerShell (symlink permission), branch audit/admin-panel-2026-11-24.

```powershell
npm i -D vite@^7.3.8          # SEC-01
npm ls vite                     # expect 7.3.8+
npm run typecheck
npm run test:security --workspace=@workspace/scripts   # 12 files incl. AUTH-01 regression
npm run test:orders:api && npm run test:print:api && npm run test:catalog:api
npm run test:dashboard && npm run test:vendors
npx madge --circular artifacts/panchabindu/src --extensions ts,tsx   # duplicate/dead scan (P4)
npx gitleaks detect --source .  # secrets
npm audit                        # dependency advisories (OSV alternative: osv-scanner -r .)
```

Browser matrix (after dev server runs): Playwright at 360/390/430/768/1024/1280/1440/1920 across the 15 tabs — script exists as scripts/src/admin-*-audit-browser.mjs for 4 audited modules; remaining 11 tabs need equivalent runs (deferred to per-tab rounds).

## 6. Status

PASS WITH KNOWN RISKS (trace-level): T1 must be fixed by user command; AUTH-01 verification pending; 11 of 15 tabs still need their dedicated functional+browser round.
