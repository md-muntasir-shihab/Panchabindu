# Messaging — Customer Inbox, Vendor Inbox & Templates — Audit (2026-11-24)

> Page: `/admin` → `messaging_hub` → `MessagingHubPanel` (3 sub-tabs: Customer Inbox, Vendor Inbox [super_admin only], Templates & Automation), role: super_admin + marketing staff
> Branch: `audit/messaging-inbox-2026-11-24` (from `main` @ d84e65b)
> All claims `[TRACED]`. Panel (59.3 KB) read end-to-end; backend routes + services read.
> Scope: customer inquiry triage (status/priority/assignee/notes, optimistic-concurrency revision), vendor support ticket thread + reply/close, order message generator (wa.me/SMS free links), template trigger matrix, automation rules (Dry-Run default + global kill-switch), dispatch logs.

## 1. Findings

### MSG-01 — P1 · Functional / Data-integrity (wrong-recipient message render)
- **Where:** `artifacts/api-server/imported/src/lib/admin/phase4c-service.ts` → `renderOrderMessagePreview` (and frontend mirror `artifacts/panchabindu/src/lib/admin/phase4c-service.ts`)
- **What:** `erpState.orders.find(o => o.orderNo === input.orderNo) ?? erpState.orders[0]` — an unknown/typo orderNo silently renders the message for a **completely different customer's order** (always the first order in the store). The preview then also writes a `logRecord` and generates a wa.me link pointing at that wrong customer.
- **Impact:** staff believing they sent the right message; wrong customer contacted with another customer's order details (name, phone, items, total — a PII disclosure vector); dispatch log polluted with wrong entries.
- **Evidence:** `[TRACED]` — function body read in full.
- **Fix:** remove the `?? erpState.orders[0]` fallback; return `{ success: false, errorBn: 'অর্ডার পাওয়া যায়নি।' }` when the order is not found (the error branch already exists, the fallback just bypasses it).

### MSG-02 — P2 · Functional (template fallback)
- **Where:** same function, next line: `messageTemplates.find(t => t.eventKey === input.eventKey) ?? messageTemplates[0]!`
- **What:** an invalid eventKey silently renders the first template instead of erroring. Wrong message type generated with zero operator signal.
- **Fix:** drop the `[0]!` fallback; return the existing "টেমপ্লেট ইভেন্ট পাওয়া যায়নি।" style error. Note: the route zod schema should also constrain eventKey to the template enum — verify schema, add `z.enum` if missing.

### MSG-03 — P4 · Duplicate/dead code
- **Where:** `artifacts/panchabindu/src/components/admin/contact-management-panel.tsx`
- **What:** older customer-inbox panel performing the identical `update_inquiry_status` operation with its own copy of the status/priority UI. **Not imported anywhere** — `admin-erp-client.tsx` imports only `CrmContactsPanel` (inquiry triage lives in CRM) and `MessagingHubPanel` (this page). Dead duplicate of both.
- **Fix:** `git rm` in a cleanup PR (grep first for late/lazy imports: `ContactManagementPanel`).

### MSG-04 — observation (no action): solid patterns confirmed `[TRACED]`
- Vendor support route: session + role re-verification (`session.roleSlug === actor.roleSlug` catches stale-session privilege drift), CSRF on POST, rate limit 40/min, strict zod (uuid, text 1..2000), 409 on invalid transition.
- `vendor-support.ts` service: BOLA-safe (`visible()` scopes vendors to own tickets), close is super_admin-only, 100-message cap, 20-open-ticket cap per vendor, every mutation audit-logged with actor.
- Inquiry triage: zod enum statuses, notes ≤ 4000 chars, `expectedRevision` optimistic concurrency, super_admin gate (marketing DENY per RBAC snapshot — confirmed by `contact-management.test.ts`).
- Templates: super_admin-only mutations, audit-logged; automation Dry-Run default + kill-switch; wa.me/SMS links are free open-external links (no auto-send).
- UI: 44px touch targets, `role="tablist"`/`aria-selected`, EmptyState for all three tabs, confirm-step on ticket close, activity log, line-clamp.

## 2. Threat Matrix (page-specific)

| Threat | Verdict |
|---|---|
| Wrong-recipient message via preview fallback | **VULNERABLE — MSG-01 (P1)** |
| Wrong template via eventKey fallback | **VULNERABLE — MSG-02 (P2)** |
| Vendor reading another vendor's ticket (BOLA) | SECURE [TRACED] — visible() scoping + uuid lookup |
| Staff closing tickets / vendor privilege escalation | SECURE [TRACED] — super_admin gate on close, role re-verified vs session |
| XSS in ticket text / inquiry message / notes | SECURE [TRACED] — React text nodes, whitespace-pre-wrap, no dangerouslySetInnerHTML |
| Flooding vendor inbox | SECURE [TRACED] — 20-open-ticket cap per vendor + 40/min rate limit |
| Concurrent double-reply races | Low — expectedRevision on inquiries; ticket messages append with random UUID (no revision, but doc-store single-threaded; acceptable) |
| Auto-send abuse via wa.me links | SECURE [TRACED] — links open externally; no automatic dispatch; automation is Dry-Run default with kill-switch |

## 3. Verification

```powershell
nvm use 22.20.0
npm run dev                                            # Terminal 1
node --test scripts/src/messaging-preview-fallback.test.mjs   # 3 tests: fail pre-fix, 3/3 pass post-fix
npm run test:catalog:api ; npm run test:orders:api     # phase4c/repository consumers
npm run typecheck
```

## 4. Status

**FAIL — MSG-01 (P1) must be fixed** (one-line fix × 2 mirrors + MSG-02 one-line fix × 2 mirrors). MSG-03 dead file removal deferred to cleanup PR. No auth/RBAC flaw found on this page's own paths.

Commit for the fix: `fix(messaging): reject unknown orderNo and invalid eventKey in message preview (MSG-01, MSG-02)`
