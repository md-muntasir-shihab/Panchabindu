# PHASE 01 — SYSTEM ARCHITECTURE SPECIFICATION
## পঞ্চগড় (PANCHAGARH) — Multi-Vendor Consignment F-Commerce Platform

**Document Status:** `IMPLEMENTED`  
**Phase:** `PHASE 01 — ARCHITECTURE & CONTRACT`  
**Architecture Style:** Modular Monolith (Next.js App Router + Server-Side DAL + PostgreSQL/Supabase)

---

## ১. Architectural Principles

1. **Modular Monolith First:** Zero unnecessary microservices. Storefront, Admin ERP, Public APIs, and Protected Admin APIs run within a unified Next.js TypeScript codebase with strict module boundaries.
2. **Server-Authoritative Financial & Security Logic:** Client components never compute authoritative order totals, commission splits, or permissions. Every calculation executes server-side in integer **Poisha** (`1 BDT = 100 Poisha`).
3. **Zero-Leak DTO Serialization:** Public Storefront responses and non-privileged staff responses pass through deterministic allowlist/denylist serializers (`src/types/permissions.ts`) before leaving the server.
4. **Free / Open-Source-First:** No mandatory paid SaaS dependencies, no payment gateways, and no marketing tracking pixels.

---

## ২. High-Level System Topology

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER STOREFRONT LAYER                           │
│  - Modern D2C Header (পঞ্চগড় Monogram, Live Instant Search, Category Bar) │
│  - Unified Collection Showcase (সব পণ্য | নির্বাচিত | বেস্ট সেলার | নতুন)  │
│  - Dynamic Variant PDP, Slide-Over Cart Drawer & Single-Page Checkout      │
│  - Payment: Cash on Delivery (COD) & Manual bKash (TrxID Submission)       │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ HTTPS / JSON (Public DTO Allowlist)
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    SERVER-SIDE APPLICATION & DAL LAYER                     │
│  - Public Storefront API (/api/storefront, /api/orders, /api/promo)        │
│  - Protected Admin Workspace API (/api/admin/workspace)                    │
│  - Courier Webhook Receiver (/api/webhooks/courier — HMAC-SHA256)          │
│  - Pure Integer Money Engine (src/lib/money.ts)                            │
│  - Product-Vendor Sync & Ledger Accrual (src/lib/db/product-sync.ts)       │
└──────────────────┬──────────────────────────────────────┬──────────────────┘
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│     POSTGRESQL / SUPABASE STORE     │  │      EXTERNAL ADAPTER LAYER       │
│  - 7 Versioned Migrations + RLS     │  │  - Pathao Adapter (Configurable)  │
│  - Append-Only Vendor & COD Ledgers │  │  - Steadfast Adapter (Config)     │
│  - Immutable Audit Logs             │  │  - BD Post (Manual Workflow)      │
│  - SHA-256 Disaster Recovery Snap   │  │  - Free Fallbacks (wa.me, sms:)   │
└─────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## ৩. Four-Role RBAC Architecture (No 5th Role)

Per `00_CUSTOM_INSTRUCTION.md` Section 1.1 and `02_BACKEND_MASTER_PROMPT.md` Section 2.5, the platform enforces **strictly four internal roles**:

| Role Slug | Role Name (বাংলা / English) | Scope & Restrictions |
|---|---|---|
| `super_admin` | **Super Admin** | Full access to all 13 Admin Groups, 3-tier pricing, net profit, maker-checker settlements, credentials vault, and security audit logs. |
| `vendor` | **Vendor / Supplier** | Strict isolation to own `vendorId` products, stock, consignments, and payable ledger. Cross-vendor access returns `404 Not Found`. Customer phone/address masked by default. Never sees platform margin. |
| `marketing_manager` | **Marketing Manager** | Storefront sections, banners, categories, product copy/media, SEO, review moderation, and social order entry. Never receives `supplierCostPoisha` or `platformMarginPoisha`. |
| `packaging_manager` | **Supply & Packaging Manager** | Consignment stock receiving, QC inspection, stock reservation/movement, 3-part A4 printing, and courier booking/handover. Never sees supplier cost, profit, or financial ledgers. |

---

## ৪. Admin Dashboard 13-Group Navigation Architecture

The Admin ERP (`src/components/admin/admin-erp-client.tsx`) organizes operational modules into permission-aware groups:

1. **GROUP 01 — OVERVIEW:** Today Operational Command Screen, Role-aware KPIs, Pending Actions, Fraud Alerts.
2. **GROUP 02 — ORDER MANAGEMENT:** Master Orders Grid, One-Click Row/Bulk Actions, Next Best Action badges, Smart Manual Order Entry (`storefront`, `facebook`, `whatsapp`, `phone_call`, `other`).
3. **GROUP 03 — PRODUCT & CATALOG:** Product Management Studio, Multi-Variant SKU Builder, 3-Tier Poisha Pricing Calculator, Category Manager, 8-Way Ecosystem Inspector.
4. **GROUP 04 — VENDOR & CONSIGNMENT:** 15-Question Vendor Onboarding, Consignment Dispatch Lots, Vendor Price Proposals, Vendor Scorecard & Statements.
5. **GROUP 05 — INVENTORY & WAREHOUSE:** Stock Overview (`On Hand`, `Reserved`, `Available`, `Damaged`), QC Receiving, Append-Only Stock Movement History.
6. **GROUP 06 — COURIER & DELIVERY:** Pathao, Steadfast, and Bangladesh Post manual workflow, District/Upazila Delivery Rate Table, Pickup Batch & Handover Manifest PDF, Courier 360 Aging Buckets.
7. **GROUP 07 — PAYMENT & FINANCE:** COD Collection & Remittance Reconciliation, Manual bKash `TrxID` Verification, Double-Entry Journal & Executive Accounting, Escrow-style Holding Ledger (`Pending` / `Locked` / `Available`), Payout Maker-Checker Flow.
8. **GROUP 08 — CUSTOMER & FRAUD:** Customer 360 CRM, Order Risk Score Engine, Address Quality Gate, Blacklist & Manual Fraud Review.
9. **GROUP 09 — STOREFRONT & CONTENT:** Dynamic Branding (`পঞ্চগড় / Panchagarh`), Section Manager, Delay Banner, Legal Pages & SEO.
10. **GROUP 10 — REVIEWS & SUPPORT:** Verified-Purchase Product Review Moderation Queue & Abandoned Cart Recovery (`wa.me` 1-click reminder).
11. **GROUP 11 — REPORTS & ANALYTICS:** Permission-aware CSV/JSON Exports, Money Map, Product 360, ROAS & Net Profit Breakdown.
12. **GROUP 12 — TEAM & ACCESS:** Staff Accounts, Mandatory First-Login Password + TOTP 2FA Gate, Granular Field-Level Permission Matrix.
13. **GROUP 13 — SYSTEM & SECURITY:** Masked Credentials Vault, Automation Rules Engine (with Dry-Run & Global Kill-Switch), Google Sheets One-Way Mirror, Immutable Audit Logs, SHA-256 Disaster Recovery Snapshot.
