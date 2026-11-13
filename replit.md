# Panchagarh

Bengali/English multi-vendor storefront and operations app, imported from Vercel and ported to Replit without redesigning the original product.

## Run & Operate

Use the artifact-owned workflows:

- `artifacts/panchagarh: web` — React + Vite storefront at `/`.
- `artifacts/api-server: API Server` — Express API at `/api`, plus robots, sitemap and web manifest.
- The canvas/mockup package is pre-existing scaffolding, not part of this storefront.

The workflows supply `PORT` and `BASE_PATH`; do not run a root-level `pnpm dev`.

## Verification

- `pnpm --filter @workspace/scripts run test:migration` — running-app route, public-data, not-found, auth guard and manifest checks.
- `pnpm --filter @workspace/scripts run test:domain` — original finance, checkout validators, runtime transaction and image precheck tests.
- `pnpm --filter @workspace/scripts run test:shopping` — Chromium cart-to-checkout, refresh persistence and mobile catalog checks. Does not place an order. Requires Chromium at `/repl/tools/bin/chromium` or `CHROMIUM_PATH`.
- `pnpm --filter @workspace/scripts run test:sandbox` — verifies development-only admin/vendor first login and customer phone-OTP login without printing credentials or OTPs.
- `pnpm --filter @workspace/panchagarh run typecheck` — frontend TypeScript verification.
- Browser test screenshots go into ignored `generated-artifacts/migration/`.

## Where things live

- `artifacts/panchagarh/src/` — original frontend components, stores, styles and client routing.
- `artifacts/api-server/imported/` — original server domain logic, types and API handlers, with Next HTTP dependencies replaced by a Web Request/Response boundary.
- `artifacts/api-server/src/routes/imported.ts` — Express routing for all 20 imported API routes.
- `artifacts/api-server/src/routes/page-data.ts` — server-side, customer-safe data loaders replacing the original server-rendered pages.
- `artifacts/api-server/supabase/` — original database migrations, preserved for the existing Supabase backend.
- `lib/api-spec/openapi.yaml` — workspace health and page-data contracts. The imported handlers retain their original contracts.
- `.migration-backup/` — original imported source retained for parity reference.

## Persistence and production configuration

The app keeps its original persistence model. **Do not replace Supabase with the scaffold database or silently enable local JSON in production.**

- Development uses the original `.data/` fixtures under the API server working directory. They are ignored by Git.
- Production deliberately refuses local JSON persistence. It requires `PANCHAGARH_PERSISTENCE=postgres`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, plus the original initialized runtime-state schema. The legacy server-side `NEXT_PUBLIC_SUPABASE_URL` name remains supported.
- Existing identities require `CREDENTIALS_ENCRYPTION_KEY`. Preserve the same key for existing encrypted credentials; do not rotate or generate a replacement as part of a port.
- The original production identity, SMS OTP, payment, media storage and courier adapters retain their configuration requirements and fail explicitly when unavailable.
- `APP_URL` is the configured public origin used by the original CSRF checks. Do not set it to a guessed published URL.
- Imported production credentials were not provided. Live database operations, authenticated admin/customer actions, order placement, and external payment/SMS/courier services were not verified.

Use the secure workspace configuration flow for credentials. Never put them in source, logs or browser environment variables.

## Private local account testing

For private Replit development testing, run `pnpm --filter @workspace/api-server run sandbox:setup` once. It creates random first-login passwords for `admin` at `/admin` and `rupganj_vendor` at `/vendor`; the private one-time credential file is `artifacts/api-server/.data/LOCAL-LOGIN.txt`. The API development workflow loads the matching private env file from that ignored `.data/` directory. Admin and vendor must change their temporary password at first login; TOTP 2FA is disabled across roles in this local sandbox for now. Production authentication is unchanged. The customer at `/account` signs in using the local sandbox OTP shown in the page; customers have no password.

The bootstrap refuses to overwrite an existing credential file or admin registry. It does not reset or rotate an account. Do not share the credential file or preview link; delete the one-time credential file after both accounts have been set up. These local accounts and JSON fixtures do not grant production access. Production stays fail-closed until the original Supabase runtime and production identity are separately configured.

## Architecture decisions

- This is a parity migration, not a product redesign. Retain the imported routes, Bengali/English text, design tokens, assets and behavior.
- Business logic and private repository data stay on the server. Browser code may import server types with `import type`, but must not bundle server runtime modules.
- All services are reached through the shared path proxy, not hardcoded localhost service ports.
- Page metadata, product structured data, the manifest, robots and sitemap are preserved.
- Original sample product images use external URLs; their availability depends on those original hosts.
