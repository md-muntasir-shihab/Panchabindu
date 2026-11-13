# Panchagarh — স্পেসিফিকেশন গ্যাপ অডিট (Phase A / Inspection-first)

**তারিখ:** 2026-11-13 · **ধরন:** read-only assessment · **কোড/ডেটাবেস পরিবর্তন:** নেই

এই ফোল্ডারটি চারটি আপলোড করা স্পেসিফিকেশন—Frontend Master Prompt (+V2 addendum), Backend Master Prompt (+V2 addendum), System Integration Map v2.0 এবং Payment Schema Addendum—এর সঙ্গে বর্তমান Panchagarh অ্যাপের প্রমাণভিত্তিক তুলনা। এটি Backend Master Prompt-এর **PHASE 00 — INSPECTION FIRST** এবং V2 blueprint-এর **Phase A** deliverable। এটি পরবর্তী কোনো phase শুরু করার অনুমতি নয়।

## ডকুমেন্ট তালিকা

| ফাইল | বিষয় |
|---|---|
| [01-architecture-assessment.md](01-architecture-assessment.md) | বর্তমান runtime architecture, route tree, persistence boundary, test inventory, configuration names |
| [02-requirements-matrix.md](02-requirements-matrix.md) | চার ডকুমেন্টের requirement → অবস্থা (present / partial / missing / unverified / conflicting) + evidence |
| [03-identity-data-boundary.md](03-identity-data-boundary.md) | Customer principal, চার staff role, vendor isolation, session/CSRF/rate-limit, public DTO allowlist, RLS |
| [04-schema-api-contract.md](04-schema-api-contract.md) | বিদ্যমান SQL/runtime বনাম payment addendum; additive schema proposal; state machines; event/idempotency map; API migration |
| [05-commerce-finance-trace.md](05-commerce-finance-trace.md) | Catalog → checkout → stock → payment → ledger → settlement → return → print end-to-end trace; financial invariant; prohibited-feature conflict |
| [06-frontend-connection-plan.md](06-frontend-connection-plan.md) | বিদ্যমান screen/primitives reuse, page-to-backend mapping, file/folder allowlist, responsive/state coverage |
| [07-roadmap-and-decisions.md](07-roadmap-and-decisions.md) | Phase B–J approval-gated roadmap, owner decision list, verification matrix, conflict register |

## Verification level legend

প্রতিটি দাবির পাশে নিচের একটি level থাকবে। **কোড বা migration file উপস্থিত থাকা মানেই "tested" নয়।**

| Level | অর্থ |
|---|---|
| `INSPECTED` | Source/SQL পড়ে দেখা হয়েছে; আচরণ চালিয়ে দেখা হয়নি |
| `STATIC_VERIFIED` | Typecheck/grep/static reasoning দিয়ে যাচাই (যেমন: route table-এ endpoint আছে) |
| `TESTED_LOCAL` | এই workspace-এর local JSON sandbox-এ automated test বা smoke run আছে (`scripts/` বা imported `*.test.ts`) |
| `UNVERIFIED` | Production, Supabase runtime, provider বা external service—কোনো প্রমাণ নেই |
| `VERIFY_REQUIRED` | Owner/provider/legal তথ্য ছাড়া সিদ্ধান্ত নেওয়া যাবে না |

## শীর্ষ ফলাফল (সংক্ষেপে)

1. **Runtime persistence document-store, normalized schema নয়।** Production mode-এ অ্যাপ Supabase-এর `erp_runtime_state` টেবিলে ১০টি JSON document JSONB হিসেবে রাখে (RPC `erp_read_runtime_state` / `erp_commit_runtime_state`, optimistic revision)। Migration 0002–0008-এর ৫৩টি normalized টেবিল, enum, RLS policy এবং journal trigger কোডবেসে আছে, কিন্তু runtime read/write path সেগুলো ব্যবহার করে না। ফলে স্পেসিফিকেশনের "Supabase RLS is the enforcement layer" বর্তমানে runtime-এর জন্য সত্য নয়; authorization সম্পূর্ণ application layer-এ। (`INSPECTED`)
2. **Identity Supabase Auth নয়।** Staff login হলো নিজস্ব username/password + TOTP (otpauth), encrypted credential registry, HttpOnly cookie session, Origin/CSRF, rate limit, ৫-attempt lockout। Customer login phone-OTP; SMS provider `NOT_INTEGRATED`, local sandbox-এ OTP preview। চার staff role স্পেসিফিকেশনের সঙ্গে হুবহু মেলে। (`INSPECTED`, local login `TESTED_LOCAL`)
3. **Payment: COD + manual bKash runtime-এ কার্যকর; provider-neutral registry নেই।** `submitManualBkashPayment` provider parameter নেয় কিন্তু bKash ছাড়া প্রত্যাখ্যান করে; DB enum-এ `nagad_manual`/`rocket_manual` থাকলেও check constraint `cod`/`bkash_manual`-এ সীমিত। Maker-checker, duplicate TrxID guard, approval-এ journal posting আছে। Status মডেল স্পেসিফিকেশনের ১২-state মডেল থেকে ভিন্ন। (`INSPECTED`, unit test আছে)
4. **Ledger invariant দুই স্তরে আছে।** Application GL engine + DB trigger (`UNBALANCED_JOURNAL`, `POSTED_JOURNAL_IMMUTABLE`)। কিন্তু trigger normalized টেবিলে; runtime document-store-এ শুধু application-level guard কার্যকর। (`INSPECTED`)
5. **Stock lock in-process।** `runWithAtomicStockLock` single-process mutex; multi-instance deployment-এ DB row lock/conditional update ছাড়া oversell ঝুঁকি। (`INSPECTED`)
6. **Prohibited-feature conflict: Flash-sale campaign engine** (phase7) স্পেসিফিকেশনের STRICT EXCLUSIONS-এর "Flash Sale Countdown"-এর সঙ্গে সংঘাতপূর্ণ; quarantine/disable সিদ্ধান্ত Owner-এর। Bundle/Combo, payment gateway, marketing pixel—কোনো evidence পাওয়া যায়নি। Google Sheets one-way mirror (free Apps Script) prohibited list-এ নেই, তবে "unnecessary third-party" নীতির আওতায় Owner সিদ্ধান্ত। (`STATIC_VERIFIED`)
7. **Customer account ownership আংশিক।** Order/return server-session-scoped (ভালো), কিন্তু wishlist ও saved address শুধু browser localStorage/Zustand-এ—স্পেসিফিকেশন server-owned চায়। (`INSPECTED`)
8. **Courier adapters fail-closed।** `allowLiveBooking: false`, `SANDBOX_SIMULATION` mode, Bangladesh Post manual workflow, webhook HMAC + replay window + idempotency। কোনো live credential নেই। (`INSPECTED`, unit test আছে)

## ব্যবহারকারীর স্থায়ী সিদ্ধান্ত (এই অডিটে সর্বাগ্রে)

- Supabase setup **পরে** হবে; এখন Replit local sandbox-এ কাজ।
- Local sandbox-এ **সব 2FA আপাতত বন্ধ** (`PANCHAGARH_SANDBOX_DISABLE_2FA`)। Production MFA আলাদা সিদ্ধান্ত।
- বর্তমান design, বাংলা/ইংরেজি UX, Replit React/Vite + Express কাঠামো অপরিবর্তিত। আপলোডের Next.js/Vercel উল্লেখ framework বদলের অনুমতি নয়।
- Local credentials/username/password/session/security policy এই অডিটে স্পর্শ করা হয়নি; কোনো credential value পড়া বা test login করা হয়নি।

## Stop gate

এই ডকুমেন্টগুলো প্রকাশের পর কাজ থামবে। পরবর্তী Phase B (বা অন্য কোনো phase) শুরু হবে শুধু Owner-এর লিখিত অনুমোদন এবং [07-roadmap-and-decisions.md](07-roadmap-and-decisions.md)-এর decision list-এর প্রাসঙ্গিক উত্তর পাওয়ার পর।
