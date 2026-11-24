# Essential E-Commerce Admin — Gap Check

> Rule: do not rebuild what exists. Built only from `[TRACED]` facts (routes, panels, docs); `UNVERIFIED` = repo's own audit docs are partial for that area (see `docs/audit/functional-inventory.md`). Priorities: P0 must, P1 should, P2 later.

| Feature | Exists? | Quality | Priority | Disposition in this task |
| --- | --- | --- | --- | --- |
| Dashboard | Yes — `admin-command-dashboard.tsx` (snapshot cards, TrendChart, tested `dashboard-summary.ts`) | Good (tested for empty/vendor degradation) | — | Extend with Analytics panel entry only |
| Orders: list/filters/status workflow/detail/notes | Yes — `orders-grid-minimal`, `order-details-sheet`, dispatch sheet, phase4a service | Audited 2026-11-21, UNVERIFIED beyond audit | — | Not touched |
| Print invoice/packing slip | Yes — Print Engine & Invoice Studio (3 tabs, print history, RBAC-redacted part 3) | Audited, good | — | Not touched |
| Cancel / refund / return | Yes — cancellation-request + return-request API routes; escrow/reversal policy | Partial (courier return path NOT_CONNECTED live) | — | Not touched; COD refusal rate feeds analytics only |
| Products CRUD/variants/price/stock/images/categories/publish | Yes — Product Studio (4 tabs, 4 modals), catalog CSV import, media API | Audited, good | — | Not touched; `out_of_stock_view` event reads stock state read-only |
| Inventory: levels/low-stock alerts/history | Partial — vendor stock route + admin inventory module; UNVERIFIED depth | Partial | P1 | Roadmap (stock-history ledger) |
| Customers section (CRM 360) | Partial — `crm-contacts-panel` (48 KB) + `customer-az-profile-view` (85 KB), notes/tags UI, abandoned recovery panel | UNVERIFIED (no audit doc for these panels) | **P0 (this branch)** | Extend: Activity tab (consent-gated) + Privacy tab (consent record, export, anonymize, reveal-audit) + masked by default + RFM-lite segments + safe CSV export |
| Coupons/promotions | Yes — promo validate route + promo panels (phase4c) | UNVERIFIED | — | Not touched |
| Shipping zones/rates/courier handoff | Yes — BD district/weight delivery quote, courier CSV bulk export, Pathao/Steadfast/RedX adapters (fail-closed), webhooks | Partial (live providers NOT_CONNECTED) | — | Not touched |
| Payment methods settings | Yes — manual bKash (+nagad/rocket manual, disabled), COD; submissions review workflow | Partial (no automated gateway) | — | Not touched |
| Notifications/templates | Partial — messaging hub panel, SMS adapters (TextBee) fail-closed, WhatsApp cloud config | Partial (live delivery UNVERIFIED) | P1 | Roadmap (template editor + delivery logs) |
| Reviews moderation | Yes — `/api/reviews` + review moderation & vendor scorecards (phase4c) | UNVERIFIED | — | Not touched |
| Banners/content pages | Partial — storefront-content-panel (15 KB, small) | Partial | P1 | Roadmap (richer banners, page CMS) |
| Reports & CSV export | Partial — courier CSV, dashboard summaries, Google Sheets mirror (D-10 ambiguous) | Partial — no consolidated sales/customer report | P1 | This branch adds: analytics CSV exports (5 views) + customers list CSV export |
| Staff accounts/roles/permissions | Yes — 18-module RBAC matrix, hidden fields, first-login gate, TOTP 2FA, users audit doc 2026-11-24 | Good (adversarial RLS NOT_TESTED) | — | Reuse: new analytics/customers permissions go through existing module system |
| Settings (store/tax/currency/policies) | Yes — settings control center module, legal pages | UNVERIFIED | — | Not touched (privacy-policy text addition is a content change, listed in privacy.md) |
| Audit log of admin actions | Yes — `audit_logs` append-only (even super_admin cannot delete) | Good | — | Reuse: every customer reveal/export/edit/anonymize appends here |
| Abandoned carts | Yes — recovery engine + reminders + consent language | Good | — | Feed Funnel view from it; no rebuild |
| Basic SEO | Yes — sitemap, robots, metadata per page, JSON-LD product | Good | — | Not touched |
| **Visitor/product analytics** | **No** (only `@vercel/analytics` external + order-based dashboard) | — | **P0 (this branch)** | Build: tracker module, consent banner, ingestion, 5 admin views |
| **Storage health widget** | **No** | — | **P0 (free-tier guardrail)** | Build into Analytics → Errors & Storage health view |
| **Automated encrypted backups** | Partial — backup snapshot panel exists (phase6), no scheduled encrypted dump | Partial | P1 | RUNBOOK documents the scheduled GitHub Action + age encryption; code optional follow-up |

## Build decision for this branch

- Build now (P0): first-party analytics tracker + consent banner + ingestion + 5 views; Customer 360 extension (Activity/Privacy tabs, masking+reveal audit, RFM-lite, safe CSV); storage health widget.
- Cheap P1 included: none beyond the above (CSV exports are part of the views).
- Roadmap (later, not this branch): inventory stock-history ledger, notification templates/delivery logs, banner/CMS depth, scheduled encrypted backup automation code.
- One feature, one place: analytics lives under the existing admin "Reports & Analytics" group as a new panel (Dashboard → Analytics), customers stay in the existing CRM panel — no new top-level menus.
