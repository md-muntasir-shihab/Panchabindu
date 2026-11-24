# Courier 360 Fixes — exact patch (apply in Cursor/local editor)

File: `artifacts/panchabindu/src/components/admin/courier-receivables-panel.tsx` (CR-01, CR-02)
File: `artifacts/panchabindu/src/components/admin/courier-and-escrow-panel.tsx` (CR-03) + call site in `admin-erp-client.tsx`

## CR-02 — English pluralization (2 sites in courier-receivables-panel.tsx)

Site 1 — headline card 1 subtext (current line):
```tsx
{t(`মোট পাঠানো ${formatLocaleNumber(totals.totalParcelsSent, locale)} টি পার্সেল`, `${formatLocaleNumber(totals.totalParcelsSent, locale)} total parcels sent`)}
```
Replace with:
```tsx
{t(`মোট পাঠানো ${formatLocaleNumber(totals.totalParcelsSent, locale)} টি পার্সেল`, `${formatLocaleNumber(totals.totalParcelsSent, locale)} total ${totals.totalParcelsSent === 1 ? 'parcel' : 'parcels'} sent`)}
```

Site 2 — provider-card count (current line):
```tsx
{formatLocaleNumber(prov.totalParcelsSent, locale)} {t('পার্সেল', 'parcels')}
```
Replace with:
```tsx
{formatLocaleNumber(prov.totalParcelsSent, locale)} {t('পার্সেল', prov.totalParcelsSent === 1 ? 'parcel' : 'parcels')}
```

## CR-01 — Net Receivable card formula label (courier-receivables-panel.tsx)

Current line (card 4 sub-label):
```tsx
<p className="text-[11px] text-muted">{t('ডেলিভারড COD − ফি − প্রাপ্ত টাকা', 'Delivered COD − fees − receipts')}</p>
```
Replace with (matches the actual per-courier clamped computation):
```tsx
<p className="text-[11px] text-muted">{t('প্রতি কুরিয়ারের (ডেলিভারড COD − ফি − সমন্বয় − প্রাপ্ত) যোগফল; ঋণাত্মক হলে ০ ধরা হয়', 'Sum of per-courier (Delivered COD − fees − adj − receipts); negatives clamped to 0')}</p>
```
Optional hardening (verify server first): confirm `ManualCourierAccountsSummary.totals.netReceivablePoisha` in `phase4b-service.ts` is the clamped per-provider sum before shipping; if it is an un-clamped global subtraction instead, the bug is server-side and the label must stay original with the value fixed there.

## CR-03 — remove dead props (courier-and-escrow-panel.tsx)

1. In `Courier360AndRatesPanelProps` delete the unused fields: `courier360`, `brandNameBn`, `availableOrderNos` (keep `locale`, `isSuperAdmin`, `isVendor` if consumed — grep first).
2. Remove the matching props at the `<Courier360AndRatesPanel ...>` call site in `admin-erp-client.tsx`.
3. Grep before deleting: `git grep -n "courier360={" -- artifacts/panchabindu/src` — if the snapshot still passes courier360 data for other consumers, only drop the prop, keep the data.

## Verify after patch
```powershell
pnpm run typecheck
pnpm --filter @workspace/scripts test:payments
# visual: open /admin → Courier 360 → Courier accounts tab; check Pathao card reads "1 parcel" and card 4 label matches the clamped-sum formula; re-check at 360px and 1280px
```
