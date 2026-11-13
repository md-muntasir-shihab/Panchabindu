# PHASE 01 — API CONTRACT & DTO ALLOWLIST SPECIFICATION
## পঞ্চগড় (PANCHAGARH) — Frontend & Backend API Contract

**Document Status:** `IMPLEMENTED` & `TESTED`  
**Phase:** `PHASE 01 — ARCHITECTURE & CONTRACT`  

---

## ১. Standard Response Format & Money Contract

- **Currency:** `BDT`
- **Money Representation:** Integer Poisha (`1 BDT = 100 Poisha`). Never floating-point numbers.
- **Idempotency:** Mutations (`create_order`, `verify_bkash`, `request_payout`, `book_courier`) require an `idempotencyKey` to prevent duplicate orders, payments, or shipments.

### Success Envelope
```json
{
  "success": true,
  "data": {},
  "request_id": "req_..."
}
```

### Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request could not be processed",
    "field_errors": {}
  },
  "request_id": "req_..."
}
```

---

## ২. Public Storefront API Routes (Zero-Leak DTOs)

| Method & Route | Purpose | Security & DTO Guarantee |
|---|---|---|
| `GET /api/storefront` | Fetches public site settings, categories, delivery quotes (`?districtId=...`), or single product (`?slug=...`) and sanitized active catalog products. | Strips `vendorId`, `vendorCode`, `internalVendorSku`, `supplierCostPoisha`, `supplierProfitPoisha`, `platformMarginPoisha`. Includes `price_paisa` string & `currency: "BDT"`. |
| `POST /api/promo/validate` | Validates a promo code against cart items and calculates discount in integer Poisha. | Enforces that promo discounts deduct strictly from `platformMarginPoisha`, never reducing `supplierPayablePoisha`. |
| `POST /api/orders` | Creates a customer order (COD or Manual bKash), reserves stock atomically, and generates tracking token. | Server re-validates prices, stock, duplicate `TrxID`, and district/upazila delivery charges. Rejects any payment method outside `cod` and `bkash_manual`. |
| `POST /api/payments/manual-bkash/submissions` | Submits a Manual bKash `TrxID` for an order. | Normalizes BD phone, prevents duplicate `TrxID` reuse across orders, enforces idempotency, and never auto-verifies payment. |
| `GET /api/orders/track/[secureToken]` | Retrieves sanitized live order tracking status by order reference. | Never exposes vendor identities or internal cost breakdowns. |
| `POST /api/orders/cancellation-request` | Submits a customer-initiated cancellation request on unshipped orders. | Verifies customer phone, releases reserved stock atomically, and blocks direct cancellation if already dispatched to courier. |
| `POST /api/reviews` | Submits a customer review verified against delivered order history, or saves abandoned cart snapshot. | Reviews enter `pending` moderation queue before appearing publicly. |

---

## ৩. Protected Admin & Webhook API Routes

| Method & Route | Purpose | Authorization & Role Isolation |
|---|---|---|
| `GET /api/admin/workspace` | Loads role-scoped ERP snapshot (Today screen, Orders, Products, Vendors, Ledger, Courier 360, Security). | Enforces `ActorSecurityContext` + `sanitizeRecordForRole`. Vendors only receive their own records; Marketing/Packaging never receive cost or net profit fields. |
| `POST /api/admin/workspace` | Executes Zod-validated admin mutations (`create_order`, `upsert_product`, `verify_payment`, `request_payout`, `approve_payout`, `record_return`, `create_backup`, etc.). | Enforces server-side RBAC, Maker-Checker separation on settlements/verifications, and writes an immutable entry to `audit_logs`. |
| `POST /api/webhooks/courier` | Receives live status/remittance webhooks from Pathao and Steadfast. | Validates HMAC-SHA256 signature, enforces replay/idempotency check by event ID, and logs raw payload. |

---

## ৪. Public Storefront DTO Allowlist (`StorefrontProductDTO`)

Public product responses are strictly limited to the following allowlisted fields:
- `productId`, `categoryId`, `slug`, `nameBn`, `nameEn`, `descriptionBn`, `descriptionEn`
- `specs` (`Array<{ labelBn, labelEn, valueBn, valueEn }>`)
- `variantAxes`, `images`, `isFeatured`, `isFreeDelivery`, `lowStockThreshold`, `leadTimeDays`
- `totalSoldCount`, `ratingAvgBp`, `reviewCount`
- `variants`: `Array<{ variantId, productId, publicSku, titleBn, titleEn, attributes, imageUrl, salePricePoisha, compareAtPricePoisha, weightGrams, stockAvailable, inStock, isLowStock }>`

**Forbidden Fields (Hard-Stripped by `CUSTOMER_FORBIDDEN_FIELDS`):**
`vendor_id`, `vendorId`, `vendor_code`, `vendorCode`, `internal_vendor_sku`, `internalVendorSku`, `supplier_cost_poisha`, `supplierCostPoisha`, `supplier_profit_poisha`, `supplierProfitPoisha`, `supplier_payable_poisha`, `supplierPayablePoisha`, `platform_margin_poisha`, `platformMarginPoisha`, `commission_override_bp`, `commissionOverrideBp`.
