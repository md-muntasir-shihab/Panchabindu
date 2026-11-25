# Analytics + Customer 360 — admin wire-up status (updated 2026-11-25)

> New files are on the branch. The two remaining wire-ups touch two large files
> (`admin-erp-client.tsx` 241 KB, `customer-az-profile-view.tsx` 85 KB) — done as
> exact manual edits per the read-before-write rule, not blind API rewrites.

## On the branch already `[TRACED — commits]`

| Piece | File | Commit |
| --- | --- | --- |
| Recon / plan / gap / privacy / runbook docs | `docs/lean/*` | `a7485b0`, `f3aa421`, `183ba30`, `ba5e508` |
| Tracker + consent banner | `artifacts/panchabindu/src/lib/analytics/*` | `655d3f4`→`6f07090`, `a5a9420`, `405ae54` |
| Ingestion endpoint | `.../app/api/analytics/ingest/route.ts` | `8aa56bb` ⚠️ see pending fix below |
| Events repository (phase6 doc) | `.../src/lib/analytics/analytics-repository.ts` | `31ac675` |
| Admin aggregation endpoint | `.../app/api/admin/analytics/route.ts` | `e1d779b` |
| Analytics panel (5 views) | `.../components/admin/analytics-panel.tsx` | `e30de8b` |
| Route registrations (ingest/analytics/privacy) | `artifacts/api-server/src/routes/imported.ts` | `ce0bc44`, `b7cb080`, `b6d3b23` |
| Privacy route (reveal/export/consent) | `.../app/api/admin/customer-privacy/route.ts` | `4984882` |
| C360 Activity/Privacy components | `.../components/admin/customer-privacy-sections.tsx` | `08b58ce` |
| Repository budget test | `scripts/src/analytics-repository.test.mjs` | `9dd75d3` |

## ⚠️ Pending fix (must-do #1)

`.../app/api/analytics/ingest/route.ts` on the branch still has the OLD body:
`next/server` import + `globalThis.__pbRuntime` shim → events silently dropped.
Full replacement file was provided in chat (2026-11-24 message). Paste it, then:

```powershell
Select-String -Path "artifacts/api-server/imported/app/api/analytics/ingest/route.ts" -Pattern "appendAnalyticsEvents"
Select-String -Path "artifacts/api-server/imported/app/api/analytics/ingest/route.ts" -Pattern "__pbRuntime"   # কিছু না আসলে ঠিক
```

## Manual wire-up A: admin Analytics tab (`admin-erp-client.tsx`)

1. `export type AdminTabKey =` union — add `| 'analytics';`
2. `operations` NAV group keys — `['analytics', 'crm_contacts', 'messaging_hub', 'sync_health']`, and add the nav item (copy `sync_health` shape, `TrendingUp` icon — already imported):
   ```tsx
   {
     key: 'analytics',
     labelBn: 'অ্যানালিটিক্স',
     labelEn: 'Analytics',
     fullLabelBn: 'পরিদর্শন ও পণ্য অ্যানালিটিক্স',
     fullLabelEn: 'Visitor & Product Analytics',
     icon: <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />,
     hidden: !isSuperAdmin,
   },
   ```
3. Above the `TAB: CRM & CONTACTS` block:
   ```tsx
   {activeTab === 'analytics' && isSuperAdmin && (
     <AnalyticsPanel locale={locale} isSuperAdmin={isSuperAdmin} />
   )}
   ```
   plus `import { AnalyticsPanel } from './analytics-panel';` near the other panel imports.

## Manual wire-up B: Customer 360 Privacy + Activity (`customer-az-profile-view.tsx`)

1. Add to imports:
   ```tsx
   import { CustomerActivitySection, CustomerPrivacySection } from './customer-privacy-sections';
   ```
2. `type ProfileTab = 'overview' | 'orders' | 'timeline' | 'messages' | 'privacy';`
3. Nav array (the `[...] as const` list with `['overview', ...]` entries) — add:
   ```tsx
   ['privacy', t('গোপনীয়তা', 'Privacy'), null],
   ```
4. Mount at the end of the tab panels (after the `messages` block):
   ```tsx
   {activeTab === 'privacy' && (
     <CustomerPrivacySection
       phoneKey={customer.phoneKey}
       displayPhone={customer.displayPhone}
       locale={locale}
       consent={null /* follow-up: join from snapshot when consent records are added to the DTO */}
       busyKey={busyKey}
       onReveal={async () => {
         const res = await fetch('/api/admin/customer-privacy', {
           method: 'POST',
           credentials: 'include',
           headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
           body: JSON.stringify({ action: 'reveal', phoneKey: customer.phoneKey }),
         });
         if (!res.ok) return null;
         const body = (await res.json()) as { fullPhone?: string };
         return body.fullPhone ?? null;
       }}
       onExport={async () => {
         await fetch('/api/admin/customer-privacy', {
           method: 'POST',
           credentials: 'include',
           headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
           body: JSON.stringify({ action: 'export', phoneKey: customer.phoneKey }),
         });
         // Download assembly happens client-side from the profile props (DSR follow-up note in privacy.md §4)
       }}
     />
   )}
   ```
   Note: the admin fetch wrapper (`adminApiRequest`) applies CSRF headers globally — if the
   file's other fetches use the local `fetch` alias, keep the same pattern for consistency.
5. The **Activity** section: the profile view's existing timeline already covers order
   events. The consent-gated browsing timeline (`CustomerActivitySection`) is ready, but its
   data needs the visitor→customer link which depends on the login-time merge hook
   (privacy.md §3 follow-up). Do NOT mount it with fake data; leave it for the follow-up
   slice so the empty-by-design state is honest.

## Verify (PowerShell)

```powershell
pnpm run typecheck
pnpm run build
node --test scripts/src/analytics-repository.test.mjs
git add . ; git commit -m "feat(analytics,c360): wire admin analytics tab + customer privacy tab" ; git push
```

Then in a browser: `/admin` → অ্যানালিটিক্স (super admin), and CRM → customer → গোপনীয়তা →
Reveal must show the full phone AND an audit entry must appear in Audit Trail.
