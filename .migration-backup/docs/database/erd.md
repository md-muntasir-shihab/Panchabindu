# DATABASE ENTITY RELATIONSHIP DIAGRAM (ERD)
## পঞ্চগড় (PANCHAGARH) — Multi-Vendor Consignment F-Commerce

**Document Status:** `IMPLEMENTED`  
**Phase:** `PHASE 01 — ARCHITECTURE & CONTRACT`  
**Schema Source of Truth:** `docs/schema.md` & `supabase/migrations/0001..0007`

---

## ১. Relational Entity Diagram

```text
┌───────────────────────────┐       1 : N       ┌───────────────────────────┐
│          vendors          │──────────────────▶│         products          │
│  - vendor_id (PK)         │                   │  - product_id (PK)        │
│  - vendor_code (UNIQUE)   │                   │  - vendor_id (FK)         │
│  - default_commission_bp  │                   │  - category_id (FK)       │
│  - hold_days_override     │                   │  - commission_override_bp │
└─────────────┬─────────────┘                   └─────────────┬─────────────┘
              │                                               │
              │ 1 : N                                         │ 1 : N
              ▼                                               ▼
┌───────────────────────────┐                   ┌───────────────────────────┐
│       vendor_ledger       │                   │     product_variants      │
│  - ledger_id (PK)         │                   │  - variant_id (PK)        │
│  - vendor_id (FK)         │                   │  - product_id (FK)        │
│  - entry_type             │                   │  - internal_vendor_sku    │
│  - escrow_bucket          │                   │  - public_sku (UNIQUE)    │
│  - amount_poisha (BIGINT) │                   │  - supplier_cost_poisha   │
│  - hold_until             │                   │  - supplier_profit_poisha │
│  [APPEND-ONLY TRIGGER]    │                   │  - supplier_payable_poisha│
└─────────────▲─────────────┘                   │  - platform_margin_poisha │
              │                                 │  - sale_price_poisha      │
              │ Accrues from                    └─────────────┬─────────────┘
              │                                               │
┌─────────────┴─────────────┐       N : 1                     │ 1 : N
│        order_items        │◀────────────────────────────────┘
│  - item_id (PK)           │
│  - order_id (FK)          │
│  - variant_id (FK)        │
│  - vendor_id (FK)         │
│  - pricing_snapshot (JSON)│
└─────────────▲─────────────┘
              │ N : 1
┌─────────────┴─────────────┐       1 : N       ┌───────────────────────────┐
│          orders           │──────────────────▶│ courier_remittance_ledger │
│  - order_id (PK)          │                   │  - remittance_id (PK)     │
│  - order_number (UNIQUE)  │                   │  - order_id (FK)          │
│  - payment_method         │                   │  - collected_amount_poisha│
│  - payment_status         │                   │  - remitted_amount_poisha │
│  - subtotal_poisha        │                   │  [APPEND-ONLY TRIGGER]    │
│  - discount_poisha        │                   └───────────────────────────┘
│  - total_payable_poisha   │
└───────────────────────────┘
```

---

## ২. Core Database Invariants & Constraints

1. **Integer Poisha Constraint:** Every monetary column (`*_poisha`) is stored as `BIGINT` (`1 BDT = 100 Poisha`).
2. **3-Tier Consignment Check Constraint:**
   - `supplier_payable_poisha = supplier_cost_poisha + supplier_profit_poisha`
   - `sale_price_poisha = supplier_payable_poisha + platform_margin_poisha`
   - `platform_margin_poisha >= 0`
3. **Non-Negative Stock Invariant:**
   - `stock_available >= 0` and `stock_reserved >= 0`
   - `Available Stock = On Hand Stock - Reserved Stock`
4. **Immutable Historical Order Snapshot:**
   - `order_items.pricing_snapshot` captures unit cost, profit, payable, margin, sale price, commission basis points, and escrow hold days at the exact moment of order placement. Subsequent catalog price edits never mutate historical order items.
5. **Append-Only Ledger Protection:**
   - PostgreSQL trigger `fn_prevent_ledger_mutation` blocks `UPDATE` and `DELETE` on `vendor_ledger`, `courier_remittance_ledger`, `inventory_ledger`, and `audit_logs`.
