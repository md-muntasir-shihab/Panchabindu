# Project Inventory & Baseline Assessment

> **Historical inventory.** Current enumeration finds eight migrations and 14 API route files; resolved packages, auth guards, prohibited-feature findings and test status differ from this snapshot. Use `f:\CODE\Panchagarh\docs\audit\phase-0-reaudit-2026-11-11.md`. No production or external-system state is inferred from repository files.
**Project**: Panchagarh (পঞ্চগড়) — Bangladesh Multi-Vendor Consignment F-Commerce & ERP  
**Assessment Date**: 2026-11-08  
**Phase**: Phase 0 — Re-Audit & Baseline  
**Auditor**: Senior Full-Stack & Security Engineer  

---

## 1. Executive Summary

Panchagarh is a multi-vendor consignment e-commerce and ERP application designed specifically for the Bangladesh retail market. The application is built using Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, and is modeled around strict Bangladesh business realities (Paisa-based integer math, Cash on Delivery, Manual bKash with TrxID submission, district-upazila geo hierarchy, and consignment vendor lifecycle).

The current repository is functionally rich with extensive domain logic implemented across multiple service layers. However, the runtime currently relies 100% on local JSON file persistence (`.data/*.json`) with mock/demo authentication and several severe security vulnerabilities that must be resolved prior to any production usage.

---

## 2. Technology Stack & Runtime Configuration

| Component | Technology | Version | Status / Notes |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `15.5.29` (dep: `^15.4.9`) | Modern App Router architecture |
| **UI Library** | React / React-DOM | `19.2.1` | Concurrent features enabled |
| **Language** | TypeScript | `5.9.3` | Strict mode enabled |
| **Styling** | Tailwind CSS / PostCSS | `4.1.11` | Tailwind v4 via `@tailwindcss/postcss` |
| **Icons** | Lucide React | `0.553.0` | Standard icon system |
| **Animations** | Motion | `12.23.24` | Modern `motion/react` integration |
| **State Management**| Zustand | `5.0.16` | Client stores for cart, wishlist, locale |
| **Validation** | Zod | `4.6.7` (v4 alpha) | Runtime schemas for requests and domain types |
| **Database SDK** | `@supabase/ssr` & `@supabase/supabase-js` | `0.12.7` / `2.119.0` | Installed, but inactive at runtime |
| **Test Runner** | Bun Test | `1.4.4` | 58 domain unit/integration tests |
| **Linting** | ESLint / eslint-config-next | `9.39.1` / `16.0.8` | 0 errors, 3 warnings (`@next/next/no-img-element`) |

---

## 3. Directory Structure

```text
/
├── app/                      # Next.js App Router (Pages, Layouts, API routes)
│   ├── account/              # Customer account order history
│   ├── admin/                # Admin ERP single-page workspace
│   ├── api/                  # 13 REST API route handlers
│   ├── categories/           # Category index page
│   ├── category/[slug]/      # Category detail & product listing
│   ├── checkout/             # Checkout with COD & Manual bKash
│   ├── contact/              # Contact & About us page
│   ├── legal/[slug]/         # Terms, Privacy, Consignment policy
│   ├── order-tracking/[orderNo]/ # Public order tracking
│   ├── product/[slug]/       # Product detail page
│   ├── layout.tsx            # Root layout with fonts & metadata
│   ├── not-found.tsx         # 404 page
│   └── page.tsx              # Storefront homepage
├── docs/                     # Architecture, runbooks, schemas, audit
│   └── audit/                # Phase 0 audit deliverables
├── public/                   # Static assets & sample product images
├── scripts/                  # Utility scripts (e.g., geo seed generator)
├── src/
│   ├── assets/               # Image assets
│   ├── components/
│   │   ├── admin/            # Admin ERP panels & modals (6k lines in admin-erp-client)
│   │   ├── storefront/       # Storefront shells, cards, checkout, account
│   │   └── ui/               # Reusable primitives & responsive sheets
│   ├── lib/
│   │   ├── admin/            # Admin services (phase4a through phase7)
│   │   ├── courier/          # Live courier tracking URL builders
│   │   ├── db/               # In-memory/JSON repository & product sync
│   │   ├── geo/              # 64 Bangladesh districts & upazilas
│   │   ├── i18n/             # Bengali & English dictionaries
│   │   ├── supabase/         # Client, server, and admin Supabase instances
│   │   ├── validators/       # BD phone, address, and order input schemas
│   │   └── money.ts          # Integer Paisa calculations & rounding rules
│   ├── store/                # Zustand stores (cart, wishlist, locale)
│   ├── styles/               # Design tokens & CSS variables
│   └── types/                # Domain models, permissions, database types
└── supabase/
    ├── migrations/           # 7 SQL migration scripts (0001 to 0007)
    ├── geo/                  # Raw districts & upazilas JSON datasets
    ├── config.toml           # Supabase local development configuration
    └── seed.sql              # Seed SQL data
```

---

## 4. Route Inventory

### 4.1 Storefront Routes (Customer-Facing)
| Route | File Path | Method | Purpose |
| :--- | :--- | :--- | :--- |
| `/` | `app/page.tsx` | Page | Homepage with hero banner, category grid, featured products |
| `/categories` | `app/categories/page.tsx` | Page | All categories grid |
| `/category/[slug]` | `app/category/[slug]/page.tsx` | Page | Category products with sorting and basic price filter |
| `/product/[slug]` | `app/product/[slug]/page.tsx` | Page | Product detail, variant selector, specs, reviews |
| `/checkout` | `app/checkout/page.tsx` | Page | Multi-step checkout (Address, COD, Manual bKash) |
| `/order-tracking/[orderNo]` | `app/order-tracking/[orderNo]/page.tsx` | Page | Real-time order progress timeline |
| `/account` | `app/account/page.tsx` | Page | Customer order history lookup via phone + OTP |
| `/contact` | `app/contact/page.tsx` | Page | Contact form, helpline numbers, warehouse address |
| `/legal/[slug]` | `app/legal/[slug]/page.tsx` | Page | Terms of service, privacy policy, refund policy |

### 4.2 Admin ERP Routes
| Route | File Path | Method | Purpose |
| :--- | :--- | :--- | :--- |
| `/admin` | `app/admin/page.tsx` | Page | Complete 13-group Multi-Vendor Consignment ERP portal |

### 4.3 API Route Handlers
| Route | File Path | Methods | Auth Required | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/api/admin/auth` | `app/api/admin/auth/route.ts` | POST | Public | Admin login, 2FA verify, logout |
| `/api/admin/workspace` | `app/api/admin/workspace/route.ts` | GET, POST | Cookie (Vulnerable) | Full ERP operational data & mutations |
| `/api/orders` | `app/api/orders/route.ts` | POST | Public | Customer checkout order creation |
| `/api/orders/track/[secureToken]` | `app/api/orders/track/[secureToken]/route.ts` | GET | Public | Public order tracking endpoint |
| `/api/orders/cancellation-request` | `app/api/orders/cancellation-request/route.ts` | POST | Public | Customer-initiated order cancellation |
| `/api/payments/manual-bkash/submissions`| `app/api/payments/manual-bkash/submissions/route.ts` | POST | Public | Customer bKash TrxID submission |
| `/api/account/orders` | `app/api/account/orders/route.ts` | POST | Public (Demo OTP) | Customer order history lookup |
| `/api/cart/abandoned` | `app/api/cart/abandoned/route.ts` | POST | Public | Incomplete checkout snapshot |
| `/api/promo/validate` | `app/api/promo/validate/route.ts` | POST | Public | Coupon code validation |
| `/api/reviews` | `app/api/reviews/route.ts` | POST | Public | Verified buyer product review submission |
| `/api/storefront` | `app/api/storefront/route.ts` | GET | Public | Catalog and category query endpoint |
| `/api/storefront/inquiry` | `app/api/storefront/inquiry/route.ts` | POST | Public | Customer inquiry form submission |
| `/api/webhooks/courier` | `app/api/webhooks/courier/route.ts` | POST | HMAC Header | Courier webhook status updates |

---

## 5. Persistence Layer Inventory

The application currently has two distinct persistence mechanisms:

1. **Active Runtime Persistence (`.data/*.json`)**:
   - `erp-store.json`: Catalog, orders, order items, customers, reviews, promo codes, site settings.
   - `erp-admin-store.json`: Admin users, custom roles, immutable audit logs, phone call logs, blacklisted phones.
   - `erp-phase4b-store.json`: Print slip configurations, district delivery rates, pickup batches, courier remittance records, vendor escrow balances.
   - `erp-phase4c-store.json`: Operational expenses, ad spend records, messaging templates & dispatch logs, automation rules & logs.
   - `erp-phase6-store.json`: Abandoned cart snapshots, courier webhook logs, review moderation records, disaster recovery snapshots.
   - `erp-phase7-store.json`: Consignment stock dispatch lots, vendor price proposals, supplier product offers, flash campaigns, double-entry ledger reversals, customer refunds.

2. **Inactive Supabase PostgreSQL Layer**:
   - Migration scripts `0001_enums_and_extensions.sql` through `0007_rls_policies.sql` define 35 relational tables.
   - Database client files in `src/lib/supabase/` exist, but zero queries are routed to Supabase in any service or API route.
   - System relies entirely on local file read/writes.

---

## 6. Prohibited Features & Compliance Status

| Prohibited Feature | Required Status | Current State | Verification Result |
| :--- | :--- | :--- | :--- |
| **Facebook Pixel** | Strictly Forbidden | Absent | **PASS** — No `fbq` or pixel tracking code found |
| **TikTok Pixel** | Strictly Forbidden | Absent | **PASS** — No TikTok tracking code found |
| **Google Analytics** | Strictly Forbidden | Absent | **PASS** — No `gtag` or GA scripts found |
| **Flash Sale Countdown** | Strictly Forbidden | Absent | **PASS** — No artificial countdown timers on storefront |
| **Bundle / Combo Offers**| Strictly Forbidden | Absent | **PASS** — No marketing bundle engines |
| **Payment Gateways** | Strictly Forbidden | Absent | **PASS** — No SSLCommerz, Shurjopay, or automated gateway |
| **Nagad / Rocket** | Strictly Forbidden | Minor references in Admin UI | **VERIFY_REQUIRED / CLEANUP** — Admin panel has `nagad_merchant_150bp` payout option that must be pruned |
| **RedX Courier** | Approval Required | Present in Enum & UI | **VERIFY_REQUIRED / CLEANUP** — RedX references should be aligned to Pathao, Steadfast, and Bangladesh Post |
