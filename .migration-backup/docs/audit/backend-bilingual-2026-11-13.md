# Backend integrity and Bangla/English changes — November 13, 2026

The user approved the read-only audit's edit scope and added bilingual defects. Implementation uses the existing project, design and services. New code contains no comments. No production migration, deployment, real payment/refund/settlement, courier booking or external account connection was executed.

## Implemented changes

| Area | Result |
| --- | --- |
| Persistence | `runtime-persistence.ts` provides a request transaction across all ten business, identity and session documents. PostgreSQL mode loads a coherent snapshot and atomically commits changed documents through a revision check. Stale writers receive a conflict instead of overwriting another request. Local HTTP requests stage changes under an exclusive file lock and recover from an interrupted multi-file commit journal. Failed responses discard staged writes. Authentication failures retain lockout evidence. |
| Production guard | Vercel and the legacy demo flag cannot enable production JSON persistence. PostgreSQL mode requires explicit configuration, a reviewed initialized database and a request context; it never initializes demo records in production. Server pages, metadata reads and API entry points use the adapter. |
| Orders and stock | Full edits freeze after packing/payment/shipment, reject lifecycle/payment/tracking bypasses, reject fractional or duplicate lines, preserve contracted supplier and description snapshots, allocate discounts within line margins, update reserved stock, reservation records, fulfillment groups and audit together. Grid transitions use the existing state machine. Courier booking no longer fabricates a tracking code. Missing historical order lines are no longer replaced with an invented product. |
| Catalog | Exact integer values and pricing equations are validated. Product editing preserves reservation/in-transit/damage counters and rejects stock changes outside inventory adjustment. Used variants cannot be removed through replacement. New form defaults use drafts, zero stock and empty media/specifications instead of fabricated stock or product evidence. |
| Payments and ledger | Customer transaction references remain pending until authorized evidence review. Approval posts a balanced idempotent journal alongside payment updates. Previously approved payments cannot be silently rejected or reversed through the submission editor. Checker identity is resolved from an active trusted account rather than a fabricated Super Admin context. Time alone does not release holding funds; maturity transfers append offsets rather than deleting history or adding duplicate credit. |
| Database access | `0009` adds the server-only runtime table and RPCs, exact numeric/shape/pricing checks, immutable posted journal/audit/movement checks, customer ownership through `auth.uid()` mapping, tenant-filtered vendor views, MFA assurance for privileged relational helpers, media approval state, and sealed relational journal-line posting. Base tables remain unavailable to anonymous/authenticated direct clients; public views are explicitly granted. |
| Media | Bounded authenticated upload accepts JPEG/PNG/WebP, validates signatures, limits decoded pixels, rejects malformed/animated inputs, re-encodes to WebP and removes metadata. Private staging, server-derived tenant paths, duplicate hashing, short-lived previews and explicit Super Admin promotion are implemented. Failed request commits attempt removal of uploaded objects. `0010` adds private staging and restrictive managed-bucket policies. The product editor exposes upload, preview and approval controls. |
| CSV | Header mapping, bounded quoted CSV parsing, preview, row errors, duplicate detection, fresh-preview hash, explicit transactional import and audit are implemented. Imports create drafts with zero stock; they do not silently overwrite existing products. |
| Print | Separate customer, packaging and finance DTO endpoints enforce identity, tenant and field permissions. Vendor packaging copies contain only their own lines. Finance remains Super Admin restricted. Reprints require a reason and are audited. Existing legacy financial print bundles remain restricted. |
| HTTP/security | Request streams are bounded before parsing. Cookie/CSRF and trusted actor checks remain enforced. Database conflicts and service errors expose stable safe codes. Webhook relay signatures bind the timestamp and payload; unsupported providers are rejected. Configured rate-limit state persists in the PostgreSQL session document. |
| Bangla/English | 1,331 translation entries cover static operational labels, forms, statuses, placeholders, accessibility labels and common feedback. Admin/storefront locale selections remain separate. The vendor portal now has a language control and translated login/workspace states. English name/variant snapshots are retained for new orders; original bilingual product data is not rewritten by API feedback localization. Document language follows the selected locale. Historical free-text notes and content without an English version retain their source text. |

## Persistence and migration boundary

`PANCHAGARH_PERSISTENCE=local` is development/test only. PostgreSQL mode is a transactional compatibility adapter over a server-only JSONB state row. Existing synchronous domain services operate against a request snapshot; the database commits all changed documents with one revision check. This removes filesystem dependence from configured production requests without rewriting every existing service.

This does **not** complete normalization into all existing relational domain tables. The JSONB adapter has global contention, full-snapshot reads, JavaScript safe-integer monetary limits, and no general foreign-key enforcement inside arbitrary document records. High-volume operation, normalized reporting, a complete reviewed relational migration and real multi-worker load acceptance remain open. Relational RLS tests do not establish that the API uses end-user Supabase Auth; staff identity continues through the existing server-issued scrypt/TOTP mechanism backed by the selected store. Production customer OTP still requires an approved real delivery adapter.

The newly authored migrations are `0009_runtime_transactions_and_access.sql` and `0010_managed_media_storage.sql`. Historical migrations were preserved. They were tested in isolated PGlite PostgreSQL, with test Auth/Storage schemas and UUID/crypto extension installation statements omitted because that embedded engine does not provide the Supabase extension setup. No remote migration was attempted. A deployed Supabase project still needs real Auth, grants, Storage and runtime verification.

Do not initialize a database from the demonstration seed or a running source dataset. Prepare an immutable reviewed snapshot of all ten files, reconcile historical prices/identities/stock/journals, retain backups and the original encryption key separately, and test against a separate database. An existing runtime row is never overwritten by the initialization tool.

```text
node scripts/database/runtime-data.mjs prepare --source=/path/to/reviewed-snapshot --output=/private/runtime-backup.json --reviewed-offline-snapshot
node scripts/database/runtime-data.mjs verify --input=/private/runtime-backup.json
node scripts/database/runtime-data.mjs initialize --input=/private/runtime-backup.json --apply-reviewed-snapshot
node scripts/database/runtime-data.mjs backup --output=/private/new-runtime-backup.json
```

The last two commands contact the explicitly configured database. They were not run against an external service in this delivery. Backup envelopes cover runtime database documents, not Storage object bytes, account-provider state or secret-key recovery. SHA-256 checks detect a changed payload; they are not a digital signature. Backup permissions are private and files are never overwritten silently.

Rollback preserves the database row and all append-only records. Revert application code into maintenance/read-only mode or restore a reviewed backup to a separate database; do not drop the runtime table, rewrite posted history or re-enable production JSON. A stale local file lock after a crashed process requires operator review before removal.

## Validation

Final command results: Test data and generated logs live in disposable copies outside the source repository. No source `.data`, local environment secrets or Git metadata are copied into the test workspace.

- `npm run test:node`: isolated TypeScript, lint and per-file application/tooling/database tests.
- `npm run test:database`: PostgreSQL migration, access, transactional posting, immutability and separate-database restore tests.
- `next build`: production compilation with the production JSON guard enabled and no production credentials.
- Browser checks: native Chromium startup was blocked by sandbox socket permissions; the shared browser could not reach the test server's loopback address. No responsive/browser/physical print acceptance is claimed.

| Final check | Result |
| --- | --- |
| Isolated application/tooling/PostgreSQL tests | 164/164 PASS across 36 test files; all 38 verification commands exited 0 |
| TypeScript | PASS, exit 0 |
| ESLint | PASS, exit 0; 0 errors, 4 image-related warnings (3 inherited and 1 staged-image preview) |
| Production build | PASS, exit 0; production JSON guard stayed enabled |
| HTTP smoke | 14/14 PASS: storefront and metadata, authenticated workspace, anonymous denial, tenant role denial and body-size rejection |
| Browser / responsive / physical print | BLOCKED / NOT VERIFIED |
| Live Supabase/SMS/courier/production migration | NOT RUN |

Verification artifacts: `/tmp/panchagarh-backend-checks-P3E8OU/summary.json`, `/tmp/panchagarh-reviewed-build-summary.json`, and `/tmp/panchagarh-http-smoke-kKMZON/summary.json`. These are disposable local evidence, not a deployed-service claim. The HTTP smoke caught and verified a fix for Next.js request-object branding after bounded body reads; requests are reconstructed from URL/method/headers/body rather than a consumed framework Request instance.

## Remaining external and policy work

- Configure and validate an actual Supabase database, reviewed initial data and Storage; apply migrations only with separate production authorization and rollback evidence.
- Implement/verify the selected production customer authentication delivery adapter. There is no live SMS integration or claim of OTP delivery based on key presence.
- Verify current official Pathao/Steadfast account capabilities and adapters before any live booking or webhook activation. Bangladesh Post remains manual. The generic timestamp/HMAC relay contract is an internal interface, not a claimed official courier signature format.
- The vendor portal remains a scoped overview; full vendor self-service catalog/consignment mutation screens are not delivered here.
- Durable provider outbox delivery, scheduled retries, orphan Storage reconciliation after process termination, Storage-inclusive offsite restore, real load/concurrency, deployed RLS and physical print acceptance remain unverified/incomplete.
- Supplier eligibility exceptions, independent financial approvals, historic guest ownership recovery, tax/VAT, retention and legal/accounting policies require explicit business decisions. Existing synthetic accounting calculations are not legal or tax advice or an approved production posting policy.
- GitHub connection currently reports `push: false`. The reviewed change is delivered as a local commit and patch; no remote push success is claimed.
