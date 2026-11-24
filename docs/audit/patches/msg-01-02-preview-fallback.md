# MSG-01 / MSG-02 Patch — Reject unknown orderNo and invalid eventKey in message preview

> Branch: `audit/messaging-inbox-2026-11-24`
> Severity: MSG-01 P1 (wrong-recipient message render), MSG-02 P2 (wrong template render)
> Regression tests: `scripts/src/messaging-preview-fallback.test.mjs` — run with
> `node --test scripts/src/messaging-preview-fallback.test.mjs` (fail before, 3/3 pass after).
> Both mirrors MUST change together (DUP-01 parity): api-server copy is authoritative at runtime;
> frontend copy keeps parity for tests/build.

## Files (2 edits × 2 mirrors = 4 total)

### 1. `artifacts/api-server/imported/src/lib/admin/phase4c-service.ts` → `renderOrderMessagePreview`

```diff
   const ord =
-    erpState.orders.find((o) => o.orderNo === input.orderNo) ??
-    erpState.orders[0];
+    erpState.orders.find((o) => o.orderNo === input.orderNo);
   if (!ord) {
     return { success: false, errorBn: 'অর্ডার পাওয়া যায়নি।' };
   }

   const tpl =
-    p4cStore.messageTemplates.find((t) => t.eventKey === input.eventKey) ??
-    p4cStore.messageTemplates[0]!;
+    p4cStore.messageTemplates.find((t) => t.eventKey === input.eventKey);
+  if (!tpl) {
+    return { success: false, errorBn: 'টেমপ্লেট ইভেন্ট পাওয়া যায়নি।' };
+  }
```

### 2. `artifacts/panchabindu/src/lib/admin/phase4c-service.ts` — identical diff (mirror)

## Behavior contract

- Unknown orderNo → `{ success: false, errorBn: 'অর্ডার পাওয়া যায়নি।' }` with HTTP 400; **no message rendered, no wa.me/SMS link, no dispatch-log entry** — instead of silently rendering the FIRST order in the store (a different customer's name/phone/items/total).
- Invalid eventKey → rejected with the template-not-found error, instead of rendering `messageTemplates[0]` (wrong message type, wrong log eventKey).
- Valid inputs: byte-identical behavior to before (rendering, links, log write unchanged).
- Note: the workspace route zod schema for `preview_order_message` accepts `eventKey` as a plain string today; tightening it to the 8-value enum is a nice-to-have follow-up, not required for the fix.

## Optional hardening (follow-up, not required)

Constrain the route schema: `eventKey: z.enum(['ORDER_CONFIRMED','ORDER_PACKED','ORDER_SHIPPED','OUT_FOR_DELIVERY','ORDER_DELIVERED','DELIVERY_DELAYED','RETURN_INITIATED','PAYOUT_APPROVED_PAID'])`.

## Verification (after apply)

```powershell
npm run typecheck
npm run dev                                                   # Terminal 1
node --test scripts/src/messaging-preview-fallback.test.mjs  # 3/3 PASS
npm run test:catalog:api ; npm run test:orders:api            # shared phase4c consumers
```

Commit message: `fix(messaging): reject unknown orderNo and invalid eventKey in message preview (MSG-01, MSG-02)`
