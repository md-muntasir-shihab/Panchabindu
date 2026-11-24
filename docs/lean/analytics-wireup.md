# Analytics admin panel — integration status (2026-11-24)

> This slice added the API route and the React panel. The final wire-up inside
> `admin-erp-client.tsx` is a 3-line manual edit (the file is 241 KB; rewriting it
> through the GitHub API without a shell was rejected as unsafe by the
> read-before-write rule). Exact instructions below.

## What is already on this branch `[TRACED — commits]`

| Piece | File | Commit |
| --- | --- | --- |
| Aggregation endpoint (RBAC, Dhaka-time keys) | `artifacts/api-server/imported/app/api/admin/analytics/route.ts` | `e1d779b` |
| Route registration | `artifacts/api-server/src/routes/imported.ts` | `b7cb080` |
| Analytics panel (5 views, CSV, skeletons) | `artifacts/panchabindu/src/components/admin/analytics-panel.tsx` | `e30de8b` |
| Repository budget test | `scripts/src/analytics-repository.test.mjs` | `9dd75d3` |

## Manual wire-up (5 minutes, exact anchors)

All three edits are in `artifacts/panchabindu/src/components/admin/admin-erp-client.tsx`:

1. **Tab type** — find `export type AdminTabKey =` and add one line to the union:
   ```ts
     | 'phase5_readiness'
     | 'analytics';        // ← ADD
   ```

2. **Nav item** — in the `operations` group (`{ id: 'operations', bn: 'সিআরএম, মেসেজিং ও সিঙ্ক', ... keys: ['crm_contacts', 'messaging_hub', 'sync_health'] }`), change the keys array to:
   ```ts
   keys: ['analytics', 'crm_contacts', 'messaging_hub', 'sync_health']
   ```
   and add the nav entry inside that group's `items:` — copy the `sync_health` item shape:
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

3. **Panel mount** — add above the `TAB: CRM & CONTACTS` block (before `{activeTab === 'crm_contacts' && !isVendor && (`):
   ```tsx
   {/* =========================================================
       TAB: ANALYTICS (Visitor & Product Analytics)
      ========================================================= */}
   {activeTab === 'analytics' && isSuperAdmin && (
     <AnalyticsPanel locale={locale} isSuperAdmin={isSuperAdmin} />
   )}
   ```
   and the import next to the other panel imports:
   ```tsx
   import { AnalyticsPanel } from './analytics-panel';
   ```

`TrendingUp` is already imported from `lucide-react` in this file `[TRACED]` — no new dependency.

## Verify after wiring

```powershell
pnpm run typecheck
pnpm run build
```

Then open `/admin` as super admin → "অ্যানালিটিক্স" tab → empty state should render
(no events yet until consent is given in the storefront and traffic flows).
