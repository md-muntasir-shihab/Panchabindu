# Panchabindu

Bengali/English multi-vendor storefront and operations app, imported from Vercel and ported to Replit without redesigning the original product.

## Run & Operate

Use the artifact-owned workflows:

- `artifacts/panchabindu: web` — React + Vite storefront at `/`.
- `artifacts/api-server: API Server` — Express API at `/api`, plus robots, sitemap and web manifest.
- The canvas/mockup package is pre-existing scaffolding, not part of this storefront.

The workflows supply `PORT` and `BASE_PATH`; do not run a root-level `pnpm dev`.

## Vercel install

This repository is a pnpm workspace and must be deployed with the repository root as the Vercel project root. `vercel.json` selects pnpm for installation, and `pnpm-lock.yaml` pins the dependency graph. If an Install Command override is set in the Vercel dashboard, remove it or set it to `npx --yes pnpm@10.34.9 install --frozen-lockfile`; a dashboard override takes precedence over the repository configuration.

The Vercel configuration builds the storefront and bundles the Express application for the serverless handler at `api/[...route].mjs`. Static client routes fall back to `index.html`; `/api/*` requests go to the handler. To verify the workspace build locally, run `PORT=3000 BASE_PATH=/ pnpm run build`, then `node --test scripts/src/vercel-handler.test.mjs`. The handler has not been verified on Vercel itself.

This configuration alone does not make the app production-ready. The API needs the initialized production persistence and secrets described below; without them, page data fails closed. The current customer login is phone OTP, and its live SMS adapter is not implemented; customer password registration is not implemented. Do not enable sandbox authentication or publish default passwords for production.

### One-time production administrator

After applying the migrations and initializing a reviewed runtime database (including its system roles), run `pnpm --filter @workspace/api-server run production:setup-admin` once in a private terminal with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the same `CREDENTIALS_ENCRYPTION_KEY` used by the production deployment in the environment. The script refuses to replace an existing admin or credential file. It creates username `admin` with a unique temporary password in the ignored private file `artifacts/api-server/.data/PRODUCTION-ADMIN-LOGIN.txt`; open `/admin`, change the password and enroll an authenticator on first login. Store the credential securely and delete the file after setup. If the database update reports an error, do not retry blindly: the file is retained because the update may have succeeded despite a lost response. Inspect the database state first. Never put the file, service key, or encryption key in Git or share them in chat.

## Verification

- `pnpm --filter @workspace/scripts run test:migration` — running-app route, public-data, not-found, auth guard and manifest checks.
- `pnpm --filter @workspace/scripts run test:domain` — original finance, checkout validators, runtime transaction and image precheck tests.
- `pnpm --filter @workspace/scripts run test:security` — isolated security/session/customer and endpoint guards, staff RBAC, print privacy and committed workspace permission snapshot.
- `pnpm --filter @workspace/scripts run test:payments` — isolated manual-MFS validation, inventory integrity, ledger posting, courier signature/replay and notification tests.
- `pnpm --filter @workspace/scripts run test:quarantine` — isolated flash-sale default-off, data retention, public DTO leak and storefront configuration tests.
- These two suites create fresh temporary JSON fixtures per file, discard inherited secrets/provider/sandbox configuration, block network calls and remove fixtures afterward. They never use the development `.data/` accounts. See `docs/planning/panchabindu/08-local-test-evidence.md` for scope and snapshot regeneration.
- `pnpm --filter @workspace/scripts run test:shopping` — Chromium cart-to-checkout, refresh persistence and mobile catalog checks. Does not place an order. Requires Chromium at `/repl/tools/bin/chromium` or `CHROMIUM_PATH`.
- `pnpm --filter @workspace/scripts run test:sandbox` — starts an isolated temporary app, checks admin/vendor first login, password change and login screens without TOTP. Requires Chromium at `/repl/tools/bin/chromium` or `CHROMIUM_PATH`. Never reads private login files or uses development accounts; ignores `TEST_APP_URL`, blocks outbound app/browser requests, and removes its process and fixtures afterward.
- `pnpm --filter @workspace/panchabindu run typecheck` — frontend TypeScript verification.
- Browser test screenshots go into ignored `generated-artifacts/migration/`.

## Where things live

- `artifacts/panchabindu/src/` — original frontend components, stores, styles and client routing.
- `artifacts/api-server/imported/` — original server domain logic, types and API handlers, with Next HTTP dependencies replaced by a Web Request/Response boundary.
- `artifacts/api-server/src/routes/imported.ts` — Express routing for all 20 imported API routes.
- `artifacts/api-server/src/routes/page-data.ts` — server-side, customer-safe data loaders replacing the original server-rendered pages.
- `artifacts/api-server/supabase/` — original database migrations, preserved for the existing Supabase backend.
- `lib/api-spec/openapi.yaml` — workspace health and page-data contracts. The imported handlers retain their original contracts.
- `.migration-backup/` — original imported source retained for parity reference.

## Persistence and production configuration

The app keeps its original persistence model. **Do not replace Supabase with the scaffold database or silently enable local JSON in production.**

- Development uses the original `.data/` fixtures under the API server working directory. They are ignored by Git.
- Production deliberately refuses local JSON persistence. It requires `PANCHABINDU_PERSISTENCE=postgres`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, plus the original initialized runtime-state schema. The legacy server-side `NEXT_PUBLIC_SUPABASE_URL` name remains supported.
- Existing identities require `CREDENTIALS_ENCRYPTION_KEY`. Preserve the same key for existing encrypted credentials; do not rotate or generate a replacement as part of a port.
- The original production identity, SMS OTP, payment, media storage and courier adapters retain their configuration requirements and fail explicitly when unavailable.
- `APP_URL` is the configured public origin used by the original CSRF checks. Do not set it to a guessed published URL.
- Imported production credentials were not provided. Live database operations, authenticated admin/customer actions, order placement, and external payment/SMS/courier services were not verified.

Use the secure workspace configuration flow for credentials. Never put them in source, logs or browser environment variables.

## Private local account testing

For private Replit development testing, run `pnpm --filter @workspace/api-server run sandbox:setup` once. It creates random first-login passwords for `panchabindu_owner` at `/admin` and `rupganj_vendor` at `/vendor`; the private one-time credential file is `artifacts/api-server/.data/LOCAL-LOGIN.txt`. The API development workflow loads the matching private env file from that ignored `.data/` directory. Admin and vendor must change their temporary password at first login; TOTP 2FA is disabled across roles in this local sandbox for now. Production authentication is unchanged. The customer at `/account` signs in using the local sandbox OTP shown in the page; customers have no password.

The bootstrap refuses to overwrite an existing credential file or admin registry. It does not reset or rotate an account. Do not share the credential file or preview link; delete the one-time credential file after both accounts have been set up. These local accounts and JSON fixtures do not grant production access. Production stays fail-closed until the original Supabase runtime and production identity are separately configured.

## Architecture decisions

- This is a parity migration, not a product redesign. Retain the imported routes, Bengali/English text, design tokens, assets and behavior.
- Business logic and private repository data stay on the server. Browser code may import server types with `import type`, but must not bundle server runtime modules.
- All services are reached through the shared path proxy, not hardcoded localhost service ports.
- Page metadata, product structured data, the manifest, robots and sitemap are preserved.
- Original sample product images use external URLs; their availability depends on those original hosts.
