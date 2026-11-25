# Privacy — Lean Analytics + Customer 360

> Not legal advice. Facts checked 2026-11-24; confirm every item marked **[LAWYER]** with a qualified Bangladesh lawyer.

## 1. Applicable law (verified 2026-11-24)

Bangladesh's data protection law is now the **Personal Data Protection Act 2026 (Act No. 63 of 2026)** — passed 9–10 April 2026, **deemed in force from 6 November 2025**, replacing the Personal Data Protection Ordinance 2025 (and its 2026 amendment Ordinance). Deferred: §23 (Chief Data Officer) and §§31–35 (complaints, fines, compensation) start on a date the government notifies (18-month window after promulgation). Regulator: National Data Management Authority (NDMA) under the National Data Management Act 2026. Sources: cybersecuritydatabase.org record checked 2026-11-19 against bdlaws.minlaw.gov.bd/act-1692.html; bdadvocacy.com compliance guide updated 2026-11-22. `[TRACED]`

In-force obligations relevant to this project: lawful basis (usually specific, withdrawable consent), notice of what/why, security, storage limitation, data-subject rights (access, portability, correction, erasure, consent withdrawal, objection), breach notification to NDMA when significant harm is likely, processor accountability, and a four-tier classification for cross-border transfers. `[TRACED]`

**[LAWYER]** items: (a) whether the shop counts as a "significant data fiduciary"; (b) exact consent text adequacy; (c) cross-border transfer tier of our data (all personal data stays in infrastructure we control — Supabase project — plus Vercel/Sentry/Resend processing; see §5); (d) breach-notification timing once regulations publish; (e) whether analytics-without-consent for essential security/error logging is permitted without consent.

## 2. What is collected and why (data map)

| Data | Where | Purpose | Retention | PII? |
| --- | --- | --- | --- | --- |
| Order records (name, phone, address, items, payment method) | orders runtime document | Contractual necessity — running the shop | Life of business + tax/legal minimum `[LAWYER]` | Yes (normal business data) |
| Account credentials (hashed), 2FA, sessions | identity runtime document | Auth security | Per existing policy | Secret/hash only |
| Analytics behavior events (page views, dwell, ATC, funnel steps) | `analytics_events` document | Statistics, only after consent | Raw 35 days default, then aggregated & purged | No (no PII fields; `customerId` only on consented link) |
| Visitor/session IDs (random UUID) | browser localStorage | Anonymous counting | 30-min sessions / persistent random id, no cross-site tracking | No (random, first-party) |
| Consent record | localStorage + server append on linked accounts | Proof of consent choice | Per account life | Timestamp only |
| Admin audit log entries (who revealed/exported/edited customer data) | audit_logs (append-only) | Accountability | Existing append-only policy | Actor username only |

No passwords, no card data, no gateway secrets, no raw IPs in any analytics store. Payment evidence stays in the existing manual-submission workflow. `[TRACED]` from code + this branch's endpoint design.

## 3. Consent logic implemented on this branch

- No consent record → **zero** behavior events sent (no visitor id created, no session, no heartbeat).
- `decline` → same as above + local tracking state hard-reset; only server-side order/revenue statistics continue (normal business records, not behavior tracking).
- `accept` → anonymous statistics.
- `choose(detailed)` → anonymous statistics + personalization linking (anonymous browsing merged to the named account at login, never retroactively for declined visitors).
- Withdraw/change: footer link `/legal/privacy` (banner re-opens from there); declining later purges the link and stops behavior tracking. **[Follow-up commit: link-anonymous-visitor merge is only in the tracker API surface; the login-time merge hook + Customer 360 Activity tab still to be wired — see gap-check.]**

## 4. Data-subject request flow (to complete in the Customer 360 commit)

- Export my data (JSON/CSV) → admin action, audit-logged, permission-gated.
- Correct → existing customer record edit path.
- Delete/anonymize → keeps order/tax records, replaces identity fields with `ANONYMIZED_<id>` markers, audit-logged with actor+time. **[FOLLOW-UP]**

## 5. Third parties that receive any data (complete list)

1. Supabase (database host) — all personal data. **[LAWYER]** transfer-tier classification.
2. Vercel (app hosting + existing `@vercel/analytics` page-view counts — no PII, no cookies `[TRACED]` from App.tsx comment; maintainer may remove it for 100% first-party).
3. Sentry (optional, error reporting; disabled when DSN empty) — may include request context; already existing on main.
4. Resend / TextBee / WhatsApp Cloud / courier adapters (SMS/email/courier) — recipient contact data for order delivery only, fail-closed when unconfigured `[TRACED]`.
5. No analytics data leaves this infrastructure; the tracker posts only to `/api/analytics/ingest` same-origin.

## 6. Privacy-policy draft (Bangla + English) — for `/legal/privacy`

**বাংলা:**
আমরা আপনার অনলাইন অর্ডার প্রক্রিয়া করার জন্য প্রয়োজনীয় তথ্য (নাম, ফোন, ঠিকানা) সংগ্রহ করি। এছাড়া আপনার সম্মতিতে কেবল ব্যক্তিগত পরিচয়বিহীন পরিদর্শন-পরিসংখ্যান (কোন পণ্য দেখা হয়, কতক্ষণ) সংগ্রহ করি। সম্মতি না দিলে কোনো আচরণ-ট্র্যাকিং হয় না। আপনি যেকোনো সময় সম্মতি প্রত্যাহার করতে পারেন, আপনার তথ্য এক্সপোর্ট, সংশোধন বা মুছে ফেলার অনুরোধ করতে পারেন। আমাদের পক্ষে আইনগত ও কর-সংক্রান্ত রেকর্ড ব্যতীত আপনার তথ্য যতটা সম্ভব অল্প সময় রাখা হয়। ডেটা লঙ্ঘনের ঘটনা ঘটলে প্রযোজ্য ক্ষেত্রে কর্তৃপক্ষকে জানানো হয়।

**English:**
We collect the information needed to process your online order (name, phone, address). With your consent only, we also collect anonymous visit statistics (which products are viewed, for how long). If you decline, no behaviour tracking occurs. You may withdraw consent at any time and request export, correction, or deletion of your data. We keep your data only as long as needed, apart from records we must keep for legal and tax reasons. If a personal data breach is likely to harm you, we notify the authority as required by law.

**[LAWYER]** Final wording, contact channel, and breach-notification procedure must be reviewed before publishing.

## 7. Lawyer checklist (confirm before production)

1. Are we a "significant data fiduciary" (→ CDO, data audit duties)? Likely no for a small shop, but confirm.
2. Consent banner text adequacy for the Act's "specific, withdrawable consent" standard.
3. Cross-border transfer tier for Supabase/Vercel/Sentry regions; any localization duty for order data.
4. Retention minimums for order/tax records (how long must invoices be kept).
5. Breach-notification form/timing once NDMA regulations publish.
6. Whether manual bKash payment-evidence (transaction screenshots) needs extra safeguards or is sensitive data.
7. Vendor (consignment) data duties — vendors are also data subjects of some records.
