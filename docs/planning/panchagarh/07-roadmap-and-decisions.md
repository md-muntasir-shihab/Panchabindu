# 07 — Approval-gated Roadmap (Phase B–J), Owner Decisions, Verification Matrix

**নিয়ম:** প্রতিটি phase শেষে থামা ও রিপোর্ট; কোনো phase auto-continue নয়। Production action শুধু explicit approval-এ। Supabase সংযোগ ও provider clarification ছাড়া কোন কাজ সম্ভব তা প্রতিটি phase-এ চিহ্নিত।

## 1. Roadmap

| Phase | Deliverable | Depends on | Acceptance gate (observable) | Isolated tests | External dependency | Rollback / approval |
|---|---|---|---|---|---|---|
| **B — Identity/RLS remediation plan ও test wiring** | `test:security` script wiring phase1/4a/customer-guard/backend-endpoint tests; RBAC allow/deny snapshot (6 actors × operations); rate-limiter persistence design; `/vendor` server role gate | A (this audit); D-03, D-11 | সব wired tests pass locally; snapshot table committed; কোনো credential/2FA default অপরিবর্তিত | unit + route tests (local JSON) | **নেই** — Supabase ছাড়া সম্ভব | code-only; revert commit |
| **C — Schema/migration plan (local only)** | `0011_payment_registry_additive.sql` draft; runtime document additive keys; migrator entity matrix; RPC allowlist update; ERD doc | B; D-01, D-07 | SQL parses (static); `test:migration`/`test:domain` green; dry-run doc; **apply নয়** | migration smoke, runtime tx test | Supabase apply = separate approval | DROP-only rollback script included |
| **D — Payment registry ও manual verification hardening** | registry seed (cod, bkash enabled; others disabled); generic `POST /api/payments/submissions` + alias; `GET /api/payments/methods`; `payment_transactions`/`verifications` write on approval; `needs_clarification`/`disputed`; evidence private upload; maker-checker threshold config; frontend provider-neutral form | C; D-01, D-02 | duplicate TrxID / amount mismatch / wrong provider / replay / rejection / reversal tests pass; old endpoint response unchanged (contract test) | payments test matrix (BE-V2 §8) | media bucket for evidence (Supabase storage) → local stub allowed, prod `VERIFY_REQUIRED` | feature flag `paymentRegistryEnabled`; alias keeps old clients |
| **E — Official API feasibility (conditional)** | Provider capability report per approved provider; sandbox adapter skeleton behind `capability_status`; `payment_provider_events` writer; webhook route with signature | D; **D-02 approval + provider credentials** | status transitions `not_configured→api_requested→sandbox` only with evidence; no real money | adapter unit tests with recorded fixtures | provider merchant account, docs | adapter disabled by default |
| **F — Orders/inventory/consignment integration** | server delivery quote; `order_status_history`; multi-instance stock guard (conditional update on revision/doc, or row lock on normalized); reservation expiry job; server addresses/wishlist; vendor portal write ops | C | concurrent checkout test (no oversell); cancel releases stock; multi-vendor split; cart survives login + redirect | phase3 tests wired + new concurrency test | নেই | flags per feature |
| **G — Finance/reconciliation/settlement** | `payment_transactions` ↔ journal link; courier collection status derivation; reconciliation runs/discrepancies; outbox (if normalized); accountant-reviewed CoA | D, F; D-09 | debit=credit on every posting; immutable posted; no double posting; COD receivable vs remittance reconciliation test | ledger tests + reconciliation fixtures | accountant sign-off | reversal-only; no data rewrite |
| **H — Courier/returns/print/notifications/jobs** | simulation label audit; webhook tests wired; print leakage test (3 copies); job runner (maturity, reservation expiry, orphan media); SMS/email adapter status honest | F; D-05, D-06 | print copies contain no forbidden fields; webhook replay rejected; jobs idempotent | print/webhook/job tests | courier/SMS credentials (optional) | adapters stay locked |
| **I — E2E ও security QA** | role E2E (anon, customer, vendor A/B, marketing, packaging, super_admin); responsive 360/390/768/1024/1440; state coverage audit; hex-color grep gate; local sandbox only, **user accounts untouched** (dedicated test fixtures) | B–H | all suites green; screenshot matrix archived | browser suite extension of `test:shopping` | Chromium | — |
| **J — Deployment readiness** | env name checklist; Supabase apply plan (backup, dry-run, rollback); production MFA config; provider status board; Owner sign-off | I; D-04, all decisions | readiness report; **production only after explicit approval** | `test:migration` against staging | Supabase project, secrets | staged rollout |

**Supabase/provider ছাড়া এখনই সম্ভব:** B, C (draft), D (local JSON + evidence stub), F, G (local), H (simulation), I। **`VERIFY_REQUIRED` থাকবে:** E পুরোটা, D evidence bucket prod, H live adapters, J।

## 2. Owner decision list

| ID | প্রশ্ন | Option / default proposal | কোন phase ব্লক করে |
|---|---|---|---|
| D-01 | **"National"** ঠিক কোন প্রতিষ্ঠান/চ্যানেল? (National Bank Ltd bank transfer? অন্য?) account title/display policy, statement acquisition | Default: registry-তে entry নয় যতক্ষণ না স্পষ্ট | D (seed), G (bank statement import) |
| D-02 | অনুমোদিত provider set: COD + bKash manual নিশ্চিত; Rocket/Nagad manual চালু হবে? official API চেষ্টা হবে কোনটির? | Default: cod + bkash_manual enabled; nagad/rocket rows disabled `not_configured`; কোনো API | D, E |
| D-03 | "Accounts" actor = super_admin permission subset (custom override) নাকি fifth role (spec নিষিদ্ধ)? | Default: permission subset, role নয় | B |
| D-04 | Production identity: নিজস্ব auth বজায় + TOTP বাধ্যতামূলক সব staff-এ? Supabase Auth adoption? | Default: নিজস্ব auth বজায়, TOTP prod mandatory (local off অপরিবর্তিত) | J |
| D-05 | Customer OTP SMS provider (কোন provider, paid?) | Default: none → prod customer login fail-closed until configured | H, J |
| D-06 | Courier credentials (Pathao/Steadfast merchant) দেওয়া হবে? | Default: locked simulation | H |
| D-07 | Money naming: বিদ্যমান `*_poisha` canonical (addendum `*_paisa` নয়); API amount number বজায় | Default: `poisha`, number | C |
| D-08 | Flash-sale engine: quarantine (flag off + hidden) নাকি delete? | Default: quarantine, data retained | D/F |
| D-09 | Accountant sign-off: CoA, VAT 500bp on margin, holding ledger legal wording | Default: current values labeled `VERIFY_REQUIRED` in UI | G |
| D-10 | Google Sheets mirror: keep disabled-by-config, keep enabled, or remove | Default: disabled unless configured | H |
| D-11 | Persistence architecture: (a) doc-store বজায় + app-layer leak tests; (b) normalized tables-এ runtime migration roadmap (বড় কাজ, RLS কার্যকর) | Default: (a) এখন, (b) J-পরবর্তী আলাদা proposal | B, C, G |
| D-12 | Evidence upload (screenshot) গ্রহণ করা হবে? retention? | Default: optional, private bucket, 180 দিন | D |

## 3. Verification matrix (এই অডিটের দাবি অনুযায়ী)

| ক্ষেত্র | INSPECTED | STATIC_VERIFIED | TESTED_LOCAL | UNVERIFIED / VERIFY_REQUIRED |
|---|---|---|---|---|
| Route tree (web + api) | ✓ | ✓ (`imported.ts`, `App.tsx`) | `test:migration` routes/404/manifest | — |
| Persistence doc-store vs normalized | ✓ | ✓ (RPC names, migrations) | runtime tx test (`test:domain`) | Supabase-এ কোন migration applied |
| Staff auth/lockout/2FA | ✓ | — | `test:sandbox` (2FA off path) | production MFA path |
| Customer OTP | ✓ | — | `test:sandbox` | SMS provider |
| Order creation guards | ✓ | — | — (shopping test stops before order) | order placement e2e |
| Manual bKash submit/review | ✓ | — | — (unit exists, not wired) | — |
| Ledger balance/immutability | ✓ | — | `test:domain` | DB trigger (normalized) |
| Stock lock | ✓ | — | — | multi-instance |
| Courier adapters/webhook | ✓ | — | — (unit exists, not wired) | live |
| Print isolation | ✓ | — | — | leakage test |
| Prohibited-feature grep | — | ✓ | — | — |
| Frontend tokens/primitives | ✓ | `typecheck` | `test:shopping` (cart, mobile catalog) | 5-width matrix, state coverage |
| Media pipeline | ✓ (staging upload) | — | image precheck (`test:domain`) | approve→public, orphan cleanup |
| Flash campaign presence | ✓ | ✓ | — | — |

## 4. Conflict register (সংক্ষিপ্ত সূচি; বিস্তারিত [02 §H](02-requirements-matrix.md))

X1 Flash-sale (quarantine) · X5 Google Sheets (decision) · X10 Next/Vercel/Supabase Auth (user decision wins) · X12 paisa/poisha · X13 Accounts actor · X14 stale ZIP file references · E6/B7 state-model shape (mapping, no rename) · D7 RLS not runtime-effective।

## 5. Stop gate

এই রিপোর্ট পর্যালোচনার জন্য থামা হলো। D-01…D-12-এর উত্তর ও Phase B শুরুর লিখিত অনুমোদন ছাড়া কোনো implementation, migration, Supabase সংযোগ, provider activation বা live action শুরু হবে না।
