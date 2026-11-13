# Current decisions — November 13, 2026

- User granted edit permission after the backend audit and included Bangla/English defects. Proceed directly with code and tests; do not request that permission again. Add no code comments.
- Preserve existing service contracts through a versioned PostgreSQL JSONB adapter. All HTTP changes commit together with compare-and-swap conflict detection; this is a compatibility boundary with global contention, not completed relational normalization or a production-readiness claim.
- Full order editing cannot change verified payment, tracking or lifecycle state. Existing workflow commands enforce transitions. Supplier payable is preserved and discounts must fit platform margin.
- Time passing alone does not move a supplier liability into the withdrawable bucket. Approved maturity transfers append a locked offset and available credit, preserving history. Actual settlement policy remains owner/accounting review.
- Media is decoded/re-encoded before private staging; promotion requires explicit authorized approval. CSV imports require a fresh preview, create drafts with zero stock, and reject existing products/SKUs. Stock is received through QC.
- Use existing four internal roles and separate customer principal. Live SMS/courier adapters, deployment and financial/legal policy remain unresolved; no paid provider or invented official API is activated.

# Decisions and conflicts

> 2026-11-12 superseding scope decision: User explicitly requests starting phases 2–12 locally without additional permission prompts. This overrides historical “Phase 2+ NOT AUTHORIZED” statements for local code work only. Production migrations/deployment, destructive work, live provider/financial actions still need their own backup/restore, review and approval. No shared default passwords: the synthetic launcher generates random private first-login credentials; customer retains sandbox OTP and no password. See `docs/ai/PHASE_2_TO_12_LOCAL_HANDOFF.md`.

## Current reconciliation — November 11, 2026

**Superseding decision:** The newest explicit user instruction “Phase 1” authorizes local Security & Identity remediation and negative tests. The Phase 0-only statements below describe the prior scope, retained as history. Do not treat Phase 0 or Phase 1 as production acceptance. No Phase 2+, SQL migration, dependency upgrade, account connection or production action is authorized. See `f:\CODE\Panchagarh\docs\audit\v3-phase-1-security-identity.md`.

- Server-issued random customer ID is separate from staff roles; sandbox phone proof is explicitly `SANDBOX_TEST_ONLY`, never production verification. No automatic phone-based legacy order linking. Existing phone-only sessions without a principal fail closed.
- Existing JSON persistence is local evidence only, not durable production storage. Admin sandbox auth requires an explicit non-production opt-in; production login returns NOT_INTEGRATED. Real Auth/RLS migration remains gated.
- Until copy-separated printing and cost-safe staff editors exist, deny non-Super-Admin shared Part 3 bundles and cost-bearing catalog writes. Do not invent a fifth Accounts role.
- HTTP quarantine blocks new flash campaigns, Nagad/Rocket/RedX selection and simulation-only Sheets/backup/courier/maturity operations. Historical records and underlying legacy code retained. This is containment, not completion of those modules.
- Exact Origin must match server-configured `APP_URL` (required in production; request URL fallback only locally); no forwarded-host/preview-domain bypass. Proxy IP headers are ignored unless explicitly trusted by deployment configuration. Local in-process rate limits are not distributed production protection.

- Latest user authorization resets active work to **local tooling/bootstrap plus Phase 0 only**. Historical Phase 1–4 requests are context, not permission to continue implementation. Stop at the gate; request explicit approval for a reconciled next scope.
- The user supplied the complete v3 specification A–P in conversation; the missing-text blocker is resolved. The older November 6 artifact has its own unrelated A–P module labels and must not be confused with v3 Sections A–P. A same-named local file was not found; do not claim it exists. Current explicit user instructions and supplied v3 override conflicting older documentation; retain history and document conflicts.
- Scope reset: documentation-only Phase 0. The submitted v3's Phase 4 means Customer Account & Storefront, not the older finance phase. Phase 1 requires separate explicit approval; do not assume approval from historical requests.
- Preserve application/UI/schema/lockfiles during this continuation. Only isolated tooling and governance/audit documentation changed. Runtime failures may be documented but not repaired as application/dependency work in this scope.
- Retain original baseline artifacts; classify Windows namespaced-path module-loading failures as runner contamination, interrupted copying as INTERRUPTED, and individual successful checks separately from phase acceptance. JavaScript RLS simulations are not database evidence.
- Official Supabase packages are reviewed external data, staged outside agent-discovery paths. Hash matches and MIT licensing do not authorize remote SQL, migration, OAuth, MCP setup or issue submission. Keep them NOT ENABLED in this pass; no CLI/global install or service connection is implied.
- Tooling isolation is a disposable copy with a credential allowlist, **not** an OS/network sandbox. Build font downloads can occur. Fingerprints cover selected source/configuration/scripts, not the whole repository or confidential state.

## Earlier decisions — apply only where consistent with current scope

- Latest user-provided v3 supersedes conflicting older project instructions, without deleting historical documents.
- Customer principal is separate from four internal roles; mandatory authentication before final order supersedes `docs/00_CUSTOM_INSTRUCTION.md` guest checkout.
- COD/manual bKash only; `docs/schema.md` permits Nagad/Rocket and RedX, conflicting with latest instructions. Existing code and historical records require a safe, non-destructive remediation plan; do not silently remove data.
- Flash sale campaigns forbidden even though older reports claim absence and current workspace code contains campaign operations.
- Part 3 is authorized Admin/Accounts copy; old architecture assessment describes warehouse/supplier copy. Copy retention/signature rules VERIFY_REQUIRED.
- Existing design and token system are frozen despite older optional branding/color override language. Internal holding ledger is not a legal escrow claim.
- Explicit user permission covers necessary compatible project-local tooling and designated skills, not remote OAuth or production access. Actual installation remains blocked, not assumed.