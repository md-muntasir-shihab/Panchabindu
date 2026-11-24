# Admin Dashboard Merge — Today Command Center + Company Money Dashboard — 2026-11-24

> Request: merge "Today Operational Command Center" (`today_screen` tab) and "Company Money Dashboard" (`dashboard` tab) into ONE professional, animated tab; consolidate duplicates; add what's missing.
> Files touched: `admin-erp-client.tsx` (242KB — anchor edits), `admin-command-dashboard.tsx` (76KB — anchor edits), `operational-help-modal.tsx`, `dashboard-summary.ts` (already the shared math source — keep it that way).
> Both mirrors (api-server/imported copies) must stay byte-identical where they exist.

## Current state `[TRACED]`

- `AdminTabKey` = `'dashboard' | 'today_screen' | ...` — two separate tabs, nav group `overview: ['dashboard', 'today_screen']`
- `'dashboard'` renders lazy `AdminCommandDashboard` — **money view**: revenue, PnL breakdown, vendor escrow, expense ledger, channel ROAS; animated with framer-motion; deliberately does NOT repeat action queues (its own doc comment says queues "live on the Today screen")
- `'today_screen'` — **action view**: 1-tap queues (call-to-confirm, fix address, verify bKash, pack, book courier), low-stock alerts
- DUPLICATES between the two: hero KPI cards (order counts by status), refresh button + `loadedAt`, role greeting (`currentUser`/`activeRole`), `onNavigate`/`onOpenOrderStatus`/`onOpenOrderQueue` wiring, mobile bottom queue chips (admin-erp-client renders `ord-*-queue` items)
- Shared, NOT duplicated (good design already): `dashboard-summary.ts` = single math source (`summarizeDashboardOrders`, `summarizeExpenses`, `summarizeVendorEscrow`, `buildPnlBreakdown`) — the merge must keep all money math there

## Merge design (one tab: `dashboard`, label "কমান্ড সেন্টার / Command Center")

Two sub-sections inside the single `dashboard` tab, both fed by the SAME snapshot (no duplicate state, no extra fetch):

```
Command Center
 ├─ Section A (top): আজকের কাজ (Action queues)  ← today_screen content moves here
 └─ Section B (below): টাকার হিসাব (Money map)     ← AdminCommandDashboard content stays
```

## Edits

### 1. `admin-erp-client.tsx` — tab type & nav (3 edits)

1. **Remove `'today_screen'` from `AdminTabKey`** (anchor: `export type AdminTabKey = 'dashboard' | 'today_screen' | 'orders_grid'` …):
```ts
export type AdminTabKey =
  | 'dashboard'   // merged: Today command queues + Company money
  | 'orders_grid'
  | ...
```
Keep the union's remaining members unchanged. Then `grep -n "today_screen" artifacts` and update every reference:
- `ADMIN_NAV_GROUPS` (anchor: `{ id: 'overview', keys: ['dashboard', 'today_screen'] }`) → `keys: ['dashboard']`
- The nav tab def (anchor: `key: 'today_screen', labelBn: 'আজকের কাজ'`) → DELETE the whole entry
- The Money tab def (anchor: `fullLabelEn: 'Company Money Dashboard'`) → relabel: `labelBn: 'কমান্ড সেন্টার'`, `labelEn: 'Command Center'`, `fullLabelBn: 'আজকের কাজ ও টাকার হিসাব — কমান্ড সেন্টার'`, `fullLabelEn: 'Today Actions & Company Money — Command Center'`
- `activeTab === 'today_screen' && (` block (anchor) → move its ENTIRE `<section>` JSX into a prop/callback-free sub-component and render it ABOVE the `AdminCommandDashboard` inside the `activeTab === 'dashboard'` block. Practical steps:
  1. Cut the whole `today_screen` section JSX.
  2. Wrap it: `function TodayCommandQueues({ ...same props it used... }) { return (/* pasted section */); }` placed just above `AdminErpClient`'s main component (file-local, keeps props explicit).
  3. In the `dashboard` tab block render `<TodayCommandQueues ... />` then `<React.Suspense fallback={...}><AdminCommandDashboard ... /></React.Suspense>`.
- Notification deep-link ids (`ord-call-confirm-queue` etc.) keep their `onNavigate('today_screen')` → change to `onNavigate('dashboard')` (grep `today_screen` in the notifications list builder)

### 2. `admin-command-dashboard.tsx` — accept the merge + animations (anchor edits)

1. Doc comment (anchor: `The action queues … deliberately live on the Today screen instead of being repeated here`) → replace with: `The Today action queues are rendered directly above this component in the merged Command Center tab; this file remains the money view and never re-invents queue logic.`
2. Props: no signature change needed — the parent passes the same snapshot.
3. **Animation upgrades (framer-motion is already imported; keep `useReducedMotion` gating everywhere — accessibility rule):**
   - Section reveal: wrap Section A and Section B each in `motion.section` with `initial={{ opacity: 0, y: 12 }}` `whileInView={{ opacity: 1, y: 0 }}` `viewport={{ once: true, margin: '-80px' }}` `transition={{ duration: 0.35, ease: 'easeOut' }}`
   - KPI cards: staggered entrance — `initial={{ opacity: 0, scale: 0.97 }}` `animate={{ opacity: 1, scale: 1 }}` `transition={{ delay: index * 0.04, duration: 0.3 }}` (map over the card array with index)
   - Number emphasis: net-profit / net-loss KPI value gets `motion.p` with a subtle `whileHover={{ scale: 1.02 }}`; loss state keeps the existing danger tone (no green-red flip-flop animation)
   - Expense/PnL bars: keep existing bars but add `initial={{ scaleX: 0 }}` `whileInView={{ scaleX: 1 }}` with `style={{ transformOrigin: 'left' }}` per bar, staggered `delay: index * 0.05`
   - Refresh button: add `whileTap={{ scale: 0.96 }}` (micro-feedback only)
   - DO NOT add: parallax, spring physics on lists, autoplaying counters, or any animation that runs continuously (battery/performance rule of this repo)
4. **Add the missing "connect" feature** — a compact "আজকের অবস্থা / Today at a glance" strip at the very top of the money section, reusing data that already exists in the snapshot (NO new API):
   ```tsx
   const q = snapshot.todayQueues ?? { callToConfirmCount: 0, fixAddressCount: 0, verifyBkashCount: 0, /* keep remaining zeros */ };
   ```
   Render 4 animated chips (call-to-confirm, fix-address, verify-bKash, ready-to-pack — whichever fields exist in `todayQueues` `[TRACED phase4a-service: callToConfirmCount, fixAddressCount, verifyBkashCount, ...]`), each chip an `onOpenOrderQueue` button. This is the *bridge* that makes the merged tab feel like one screen: queues up top, chips in the money view jump back up.

### 3. `operational-help-modal.tsx` (anchor: `today_screen: { titleBn: 'আজকের অপারেশনাল কমান্ড সেন্টার (Today Command)'`)

Merge the `today_screen` help entry INTO `dashboard`'s entry (purpose + steps concatenated), delete the `today_screen` key. The `Record<AdminTabKey, ...>` type will force this once the tab key is removed — typecheck will catch any miss.

### 4. Duplicates consolidation checklist (do NOT lose behavior)

| Duplicate | Keep | Action |
|---|---|---|
| Status-count KPI cards (both screens count orders by status) | one row, fed by `summarizeDashboardOrders` | delete the today_screen copy |
| Refresh + loadedAt | one, top of merged tab | delete other |
| Role greeting/hero | one hero | merge text: "কমান্ড সেন্টার" + role |
| `onOpenOrderStatus`/`onOpenOrderQueue` wiring | single wiring set | both sections share |
| Mobile bottom nav queue chips | unchanged (outside tabs) | just re-point `today_screen` → `dashboard` |

### 5. Mirror parity

`grep -rn "today_screen" artifacts/api-server/imported` — update any mirror of admin-erp-client/ui-messages identically. `ui-messages.ts` (both copies): delete the standalone Today-screen title strings only if unreferenced after the merge (`grep` first — the merged tab reuses them in its section header, so likely KEEP and re-point).

## Verification

```powershell
nvm use 22.20.0 && npm install
npm run typecheck          # AdminTabKey removal must surface every missed reference — fix all
npm run dev
# Browser (admin login, bn + en):
#  - One "কমান্ড সেন্টার" tab; queues on top, money below
#  - Today-chips in money section scroll/jump to queues
#  - Animations: entrance once, reduced-motion ON disables them (OS setting)
#  - 360px: sections stack, no overflow; 1440px: two-column money grid unchanged
npm run test:dashboard     # admin-command-dashboard.test.ts + dashboard-summary.test.ts must stay green
npm run audit:eslint:orders
```

Commit message: `feat(admin): merge Today Command Center into Company Money Dashboard as one animated Command Center tab (dedupe KPIs, wire queue chips)`
