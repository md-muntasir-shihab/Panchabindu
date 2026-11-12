# PHASE 05 — COURIER ADAPTER ARCHITECTURE, WEBHOOK DLQ & NOTIFICATION SPECIFICATION
## পঞ্চগড় (PANCHAGARH) — Pathao, Steadfast, Bangladesh Post Manual & Non-Blocking Notifications

**Document Status:** `IMPLEMENTED` & `TESTED` (Phase 5 Verified)  
**Core Engine Files:**
- `src/lib/courier/phase5-courier-notification-engine.ts`
- `src/lib/courier/tracking-urls.ts`
- `app/api/webhooks/courier/route.ts`
- `src/lib/admin/phase4b-service.ts`
- `src/lib/admin/phase6-service.ts`

---

## ১. Isolated Courier Adapter Architecture (`8.1`)

Each courier provider has its own dedicated adapter class implementing `CourierProviderAdapter` (`src/lib/courier/phase5-courier-notification-engine.ts`). No provider's data model depends directly on another provider's schema:

1. **`PathaoCourierAdapter` (`pathao`):**
   - Uses Pathao Aladdin's isolated envelope (`merchant_order_id`, `recipient_city`, `recipient_zone`, `delivery_type`, `item_weight`, `amount_to_collect`, `consignment_id`).
   - Maps Pathao-specific statuses (`pickup_requested`, `at_the_sorting_hub`, `assigned_for_delivery`, `delivered`, `partial_delivery`, `return`, `on_hold`) to canonical shipment states.
2. **`SteadfastCourierAdapter` (`steadfast`):**
   - Uses Steadfast Packzy's isolated envelope (`invoice`, `recipient_name`, `recipient_phone`, `recipient_address`, `cod_amount`, `consignment.tracking_code`).
   - Maps Steadfast-specific statuses (`in_review`, `in_transit`, `delivered_approval_pending`, `partial_delivered_approval_pending`, `returned`, `hold`) to canonical shipment states.
3. **`BangladeshPostManualAdapter` (`bd_post` — Section `8.4`):**
   - **Zero Fake API Integration:** Uses a strict Admin Manual Counter Booking, VPP/Registered Receipt Number (`manualPostOfficeReceiptNo`), Post Office Branch (`postOfficeBranchBn`), Weight-based Per-KG Charge (`bdPostPerKgPoisha`), and Manual Tracking Status Update (`updateBangladeshPostManualStatus`) workflow.

> **Live Booking Safety Gate (`Section 8`):**  
> Calling `createShipment` with `allowLiveExternalBooking: true` is blocked by default (`LIVE_COURIER_BOOKING_LOCKED`) so no live external courier booking occurs without explicit owner authorization.

---

## ২. 12-Point Courier Capabilities Matrix (`8.2`)

| Capability | Pathao (`pathao`) | Steadfast (`steadfast`) | Bangladesh Post (`bd_post`) |
|---|---|---|---|
| **1. Create Shipment** | `SANDBOX_ADAPTER_READY` | `SANDBOX_ADAPTER_READY` | `MANUAL_ONLY` |
| **2. Cancel Shipment** | `VERIFY_REQUIRED` (Blocked after dispatch) | `VERIFY_REQUIRED` (Blocked after dispatch) | `MANUAL_ONLY` |
| **3. Tracking** | `VERIFIED_LOCAL_WORKFLOW` | `VERIFIED_LOCAL_WORKFLOW` | `MANUAL_ONLY` |
| **4. Status Webhook** | `SANDBOX_ADAPTER_READY` | `SANDBOX_ADAPTER_READY` | `MANUAL_ONLY` |
| **5. COD Amount** | `VERIFIED_LOCAL_WORKFLOW` | `VERIFIED_LOCAL_WORKFLOW` | `MANUAL_ONLY` |
| **6. Delivery Charge** | `VERIFIED_LOCAL_WORKFLOW` | `VERIFIED_LOCAL_WORKFLOW` | `VERIFIED_LOCAL_WORKFLOW` |
| **7. Return / Exchange** | `VERIFY_REQUIRED` | `VERIFY_REQUIRED` | `MANUAL_ONLY` |
| **8. Coverage (64 Districts / 495 Upazilas)** | `VERIFIED_LOCAL_WORKFLOW` | `VERIFIED_LOCAL_WORKFLOW` | `VERIFIED_LOCAL_WORKFLOW` |
| **9. COD Remittance** | `VERIFIED_LOCAL_WORKFLOW` | `VERIFIED_LOCAL_WORKFLOW` | `MANUAL_ONLY` |
| **10. Error Codes** | `SANDBOX_ADAPTER_READY` | `SANDBOX_ADAPTER_READY` | `MANUAL_ONLY` |
| **11. Rate Limits** | `VERIFY_REQUIRED` (Merchant tier dependent) | `VERIFY_REQUIRED` (Merchant tier dependent) | `MANUAL_ONLY` |
| **12. Sandbox** | `SANDBOX_ADAPTER_READY` | `SANDBOX_ADAPTER_READY` | `MANUAL_ONLY` |

---

## ৩. Webhook Security, Durable Event Log & Dead-Letter Queue (`8.3`)

1. **Fail-Closed HMAC-SHA256 Signature Verification:** Rejects unsigned, tampered, or expired timestamps (`401` / `503`) and logs rejected attempts.
2. **Idempotency & Replay Deduplication:** Duplicate deliveries of an already processed `eventId` return `idempotentReplay: true` (`200 OK`) without mutating order state twice.
3. **Retry & Dead-Letter Queue (`RETRY_SCHEDULED` → `DEAD_LETTER`):** Transient processing failures increment `retryCount` up to `maxRetries` before routing to `DEAD_LETTER` for staff inspection.
4. **Manual Reconciliation (`reconcileWebhookEventManually`):** Authorized staff (`super_admin` / `packaging_manager`) can reconcile dead-letter or mismatched webhook events with a mandatory audit note.

---

## ৪. Non-Blocking Notifications & OTP Isolation (`8.5`)

- **Strict OTP vs. Transactional Separation:** `dispatchSecurityOtpNotification` (`SECURITY_OTP`) is isolated from `dispatchTransactionalOrderNotificationSafe` (`TRANSACTIONAL_ORDER`), and plaintext OTP codes/secrets are automatically redacted (`[REDACTED_OTP]`, `[REDACTED_SECRET]`) in all delivery logs.
- **Zero-Cost Default Channels & Placeholders:** Supports In-App Notifications, free `wa.me` & `sms:` deep links, and safe configuration placeholders for HTTP SMS & Resend Email.
- **Fault Isolation:** `dispatchTransactionalOrderNotificationSafe` catches any external gateway failure and logs `FAILED_NON_BLOCKING` so notification outages never roll back or break Order or Payment transactions.
