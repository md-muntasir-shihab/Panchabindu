# PANCHAGARH — TOOLING, SKILLS & GITHUB INTEGRATION REGISTER
**Version 2.0 | 2026-11-11**

## ১. Existing ZIP stack — do not replace

ZIP-এর `package.json` থেকে পাওয়া declared dependencies:
- Next.js 15.4.x, React 19.2.x, TypeScript 5.9.x
- Supabase JS + SSR
- Tailwind CSS 4
- Zod 4 + React Hook Form + resolvers
- Zustand
- TanStack Table + Virtual
- Lucide React
- QRCode + JsBarcode
- Bun test script

Before install:
1. inspect package.json + lockfile + `node_modules` + imports;
2. run version checks;
3. check peer dependency and React/Next compatibility;
4. install only missing tools;
5. do not change package versions during audit unless approved.

## ২. Recommended tools

| Tool | Purpose | Status |
|---|---|---|
| Node.js | Next runtime/tooling | required; version verify |
| pnpm/npm/bun | package manager | detect lockfile and existing runtime; do not switch casually |
| Git | branches/diff/rollback | verify; ZIP may not contain `.git` |
| Supabase CLI | local DB/migrations/types | install locally/project tool only if compatible |
| Docker Desktop/WSL2 | local Supabase stack | optional; verify host support |
| Playwright Test | browser E2E/responsive | add as devDependency only if missing |
| pgTAP | SQL/RLS tests | local Supabase only if available |
| ESLint/TypeScript | static checks | already in project |
| Lighthouse | performance/accessibility checks | CLI/browser optional; no production data |

## ৩. Official GitHub repositories

### Core
- Next.js: https://github.com/vercel/next.js
- Supabase JS: https://github.com/supabase/supabase-js
- Supabase CLI: https://github.com/supabase/cli
- Supabase Agent Skills: https://github.com/supabase/agent-skills
- Playwright: https://github.com/microsoft/playwright
- shadcn/ui: https://github.com/shadcn-ui/ui
- TanStack Table: https://github.com/TanStack/table
- React Hook Form: https://github.com/react-hook-form/react-hook-form
- Zod: https://github.com/colinhacks/zod
- Skills CLI: https://github.com/vercel-labs/skills

### Conditional / only if feature requires
- `react-to-print`: https://github.com/MatthewHerbst/react-to-print
- `jsPDF`: https://github.com/parallax/jsPDF
- `QRCode`: use already-installed `qrcode.react`
- `JsBarcode`: use already-installed `jsbarcode`
- Image processing: first inspect existing runtime/deployment constraints; prefer a maintained server-side image pipeline such as `sharp` only after compatibility/build review.
- `@tanstack/virtual`: already declared; use for large grids only if required.

No need to clone the full repositories. Install packages through the project package manager, use official docs, pin lockfile, and review licenses/security.

## ৪. Agent Skills

Official Supabase skill install (only if absent):
```bash
npx skills add supabase/agent-skills --skill supabase
npx skills add supabase/agent-skills --skill supabase-postgres-best-practices
```

Project-local skills under `.agents/skills/`:
```text
panchagarh-governance/SKILL.md
panchagarh-nextjs-frontend/SKILL.md
panchagarh-supabase-security/SKILL.md
panchagarh-bd-commerce-domain/SKILL.md
panchagarh-payment-reconciliation/SKILL.md
panchagarh-vendor-isolation/SKILL.md
panchagarh-media-storage/SKILL.md
panchagarh-admin-print-qa/SKILL.md
```

Each `SKILL.md` should have:
- frontmatter `name`, `description`;
- exact trigger/use cases;
- do/don't rules;
- repository file references;
- required tests;
- security/permission boundary.
No secrets, no hard-coded credential, no broad auto-execution.

## ৫. MCP register

| MCP | Decision | Permission |
|---|---|---|
| Supabase MCP | optional, useful only with linked project | OAuth user-approved, project scoped, read-only first |
| GitHub MCP | conditional on hosted repo workflow | repo read-only initially |
| Playwright MCP | normally skip; use Playwright Test locally | no production mutations |
| Filesystem MCP | skip if workspace access exists | duplicate |
| Shell MCP | skip if terminal exists | duplicate |
| generic SQL MCP | prohibited | broad DB mutation risk |
| unknown third-party MCP | prohibited until reviewed | supply-chain/prompt injection risk |

## ৬. GitHub workflow
- Existing repository remains the single source of code.
- Branch naming: `audit/phase-0`, `phase-1/security-identity`, `phase-2/schema-storage`, etc.
- Each phase: small commits, review diff, run tests, update phase state.
- Never commit `.env.local`, service role keys, API keys, credentials, customer exports, private payment statements, or production backups.
- `.gitignore` must cover env files, local data, generated backups, test artifacts, browser auth state, payment evidence.
- GitHub Actions: lint → typecheck → unit tests → migration checks → E2E → build; secrets only in repository/environment secrets after owner approval.
- No auto-deploy to production from arbitrary branch.

## ৭. Payment tools policy
- bKash business pages: https://www.bkash.com/en/business
- bKash Merchant application: https://www.bkash.com/index.php/en/business/merchant
- bKash Online Business: https://www.bkash.com/en/business/online-business
- Official developer docs: https://developer.bka.sh/ (confirm current access/product eligibility with bKash)

Merchant App/statement supports human manual review. Automatic API verification requires the exact approved product, credentials, provider documentation, sandbox and contract. The existence of an online checkout/gateway product does not mean it is free or included in manual verification. Do not add gateway redirects because this project excludes gateways unless Owner changes that decision.

Rocket/Nagad/National provider API availability, merchant eligibility, fees, statement export and callback/webhook contract: `VERIFY_REQUIRED` directly with each provider/bank. No free API claim.

## ৮. Free/Open-source cost guard
- Existing project dependencies first.
- Avoid duplicate SDKs and overlapping MCP servers.
- No paid CRM, marketing analytics, payment aggregator, WhatsApp API, SMS gateway or hosted monitoring by default.
- Local tests and manual statement reconciliation are acceptable launch fallback.
- Free tiers can change; verify current limits and terms before relying on them.

## ৯. Official source notes
- Supabase Next.js quickstart and skills: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
- Supabase Agent Skills repository: https://github.com/supabase/agent-skills
- Playwright repository/docs: https://github.com/microsoft/playwright
- shadcn/ui repository/docs: https://github.com/shadcn-ui/ui
- TanStack Table repository/docs: https://github.com/TanStack/table
- Next.js repository/docs: https://github.com/vercel/next.js
