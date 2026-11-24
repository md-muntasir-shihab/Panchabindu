# Checkout Page — Design Upgrade + Connection Fixes — 2026-11-24

> Page: Checkout, route `/checkout`, component `artifacts/panchabindu/src/components/storefront/checkout-client.tsx` (73KB).
> File too large for agent whole-file rewrite — exact edits below (anchor-based). Verify each anchor with grep before editing.
> All structural claims `[TRACED]`; exact JSX line anchors `[ASSUMED]` (grep the anchor text to locate).

## Findings

### CH-01 — P1 · UX / Copy bug (internal jargon leaked to customer form)
- **Where:** checkout-client.tsx — street address field area and landmark field area.
- **What:** The customer-facing form shows internal print-part titles as field help text:
  - Street address field hint: `কুরিয়ার বক্স স্টিকার / Courier Box Label` (print part 2 title from phase4b-service)
  - Landmark field hint: `অভ্যন্তরীণ গুদাম ও প্যাকিং কপি / Internal QC Copy` (print part 3 title)
- **Root cause:** operational print labels reused as customer-facing placeholders/hints — wrong register for a customer form (these strings belong to the admin print studio A4 copy).
- **Impact:** customer confusion ("আমাকে কুরিয়ার লেবেল লিখতে হবে?"); unprofessional storefront.
- **Fix (exact edits):**

**A) Street address hint** — find the street address `Input` (anchor: `autoComplete="street-address"`). Replace its hint/placeholder text:
```tsx
// BEFORE (anchor: the text right below the street address label)
কুরিয়ার বক্স স্টিকার / Courier Box Label
// AFTER
{locale === 'bn'
  ? 'যেমন: বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি — এই ঠিকানাটি কুরিয়ার পার্সেলে ছাপা হবে'
  : 'e.g. House 24, Road 7/A, Dhanmondi — this prints on your parcel label'}
```

**B) Landmark hint** — find the landmark `Input` (anchor: `পরিচিত ল্যান্ডমার্ক (ঐচ্ছিক কিন্তু দ্রুত ডেলিভারির জন্য সহায়ক)`). Replace its hint:
```tsx
// BEFORE
অভ্যন্তরীণ গুদাম ও প্যাকিং কপি / Internal QC Copy
// AFTER
{locale === 'bn'
  ? 'যেমন: ধানমন্ডি ঈদগাহ মাঠের পাশে — ডেলিভারি ম্যান সহজে খুঁজে পাবেন'
  : 'e.g. Next to Dhanmondi Eidgah field — helps the delivery agent find you'}
```

### CH-02 — P3 · Design upgrades (keep the design system; no new deps)

All edits in checkout-client.tsx. Reuse existing primitives (`Badge`, `Card`, `Button`) and semantic tokens.

1. **Live step-completion chips in the header** (anchor: `নিরাপদ চেকআউট` card header). Add three status chips showing filled state:
```tsx
const stepDone = {
  info: customerName.trim().length >= 2 && normalizeBdPhone(customerPhone) !== null && streetAddress.trim().length >= 6,
  delivery: deliveryMethod !== '' as unknown, // always chosen — show check
  payment: paymentMethod !== '',
};
```
Render next to each accordion step number: a `CheckCircle2` icon (already imported) when done, muted otherwise. No new icons.

2. **Trust strip under the submit button** (anchor: the order submit `Button` inside the summary card / sticky mobile bar). One line, existing icons (`ShieldCheck`, `Truck`, `CreditCard` — all already imported):
```tsx
<p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
  <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{locale === 'bn' ? 'নিরাপদ চেকআউট' : 'Secure checkout'}</span>
  <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" aria-hidden="true" />{locale === 'bn' ? 'সারা বাংলাদেশ ডেলিভারি' : 'Delivery across Bangladesh'}</span>
  <span className="inline-flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" aria-hidden="true" />{locale === 'bn' ? 'পণ্য হাতে পেয়ে পেমেন্ট' : 'Pay on delivery'}</span>
</p>
```

3. **Payment section: number the bKash steps** (anchor: `সেন্ড মানি করে TrxID দিয়ে সাবমিট করুন`). Convert to a 3-step ordered list: (১) `01317138570` নম্বরে সেন্ড মানি (কপি বাটন ইতিমধ্যে আছে — `copiedMfsNumber` state `[TRACED]`), (২) রেফারেন্সে নিজের মোবাইল নম্বর লিখুন, (৩) TrxID নিচের ঘরে দিন। Keeps existing copy-to-clipboard logic unchanged.

4. **Empty-promo feedback clarity** (anchor: `promo-code-input`): on success show the applied code as a removable `Badge` with the `Tag` icon (already imported) + "প্রয়োগ হয়েছে" instead of only inline text; add a small remove (X) button that clears `appliedPromoCode` and refunds the local discount display. Server remains the source of truth for the amount.

5. **Address quality meter wording** (anchor: `{addressQuality.score`): keep the 100% bar but change the copy from plain `১০০%` to `ঠিকানা সম্পূর্ণ (১০০%)` / `Address complete (100%)` so the number has meaning.

### CH-03 — P3 · Connection gaps to close

1. **Post-submit navigation to tracking** `[TRACED route exists]`: after successful submit the code clears the cart and navigates — ensure it lands on `/order-tracking/:orderNo` (order tracking page is PENDING in LEDGER but the route + `/api/orders/track/:secureToken` backend exists). If current post-submit UI only shows a success toast, add a `Button` linking to the tracking URL returned by `POST /api/orders` (`order.trackingToken` → `/order-tracking/<orderNo>`). Verify the exact response field with DevTools during retest.
2. **Saved address prefill for guests**: currently saved addresses load only for authenticated sessions `[TRACED /api/account/orders probe with 15s timeout]`. For anonymous users persist the last-used address in `sessionStorage` (key `guest_last_address`), offer "আগের ঠিকানা ব্যবহার করুন" chip. No PII beyond what the customer typed themselves; never persist to server.
3. **Free-delivery threshold nudge** `[TRACED siteSettings has freeDeliveryThresholdPoisha]`: if cart subtotal is below the threshold and delivery is paid, show a one-line nudge under the delivery methods: "আর ৳X কিনলে ফ্রি ডেলিভারি" using `siteSettings.freeDeliveryThresholdPoisha - subtotal` (already server-provided; no client math on money beyond this display).

## Verification after edits

```powershell
nvm use 22.20.0
npm install
npm run typecheck
npm run dev
# browser: /checkout at 360px and 1440px, bn + en locales:
#  - no internal print labels anywhere on the form (CH-01)
#  - step chips update as fields fill (CH-02.1)
#  - trust strip under submit on mobile sticky bar too (CH-02.2)
#  - promo badge add/remove does not double-apply (server revalidates each time)
#  - submit → lands on order tracking with token (CH-03.1)
npm run test:home:api ; npm run test:home:browser   # shared storefront consumers
```

Commit message suggestion: `fix(checkout): remove internal print labels from customer form, step chips, trust strip, tracking handoff (CH-01..CH-03)`
