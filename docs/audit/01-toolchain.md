# 01 — Audit Toolchain & Security Scanners

> Updated: 2026-11-21. All packages installed strictly from official npm registry as `devDependencies`.

## 1. Installed & Available Tools (`[EXECUTED]`)

| Category | Tool | Version / Source | How to Run |
| --- | --- | --- | --- |
| Static Analysis & Security/A11y Lint | `eslint` + `typescript-eslint` + `eslint-plugin-security` + `eslint-plugin-jsx-a11y` + `@eslint/js` | `eslint ^10.15.0`, `eslint-plugin-security ^4.2.1`, `eslint-plugin-jsx-a11y ^6.10.2` (root `eslint.config.mjs`) | `npm run audit:eslint` |
| Type Safety | TypeScript (`tsc --build`, workspace `typecheck`) | `typescript ~5.9.3` | `npm run typecheck` |
| Dependency Audit | Bun Audit (`bun.lock`) | Workspace lockfile (`bun audit`) | `bun audit` |
| Real Browser & Responsive QA | Playwright Chromium (`chrome-headless-shell`) | `playwright ^1.65.0` (`scripts/node_modules/playwright`) | `npm run test:home:browser` |
| Accessibility Scanner | `@axe-core/playwright` (WCAG 2.0/2.1 A + AA) | `@axe-core/playwright ^4.14.0` | `npm run test:home:browser` |
| API & Contract Regression | Node built-in `node:test` + live HTTP probes | Node `22.x` | `npm run test:home:api` |
| Domain & RBAC Security Suites | `tsx --test` isolated fixtures | `@workspace/scripts` | `npm run test:domain --workspace=@workspace/scripts`, `npm run test:security --workspace=@workspace/scripts` |

## 2. Blocked External Tools (Not Installed in Container)

The following external tools are not present in this sandbox container (`[BLOCKED]`). Run them locally from the repo root on a developer workstation with Docker / Go / Python / WebKit installed:

| Tool | Purpose | Exact Local Command |
| --- | --- | --- |
| OWASP ZAP Baseline | Dynamic Web App Security Scan (DAST) | `docker run --rm -t --network host ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://127.0.0.1:3000 -r zap-home-report.html` |
| Semgrep | Deep SAST (OWASP Top 10 + TypeScript/Express/React rules) | `docker run --rm -v "$PWD:/src" semgrep/semgrep semgrep --config p/owasp-top-ten --config p/typescript --config p/react --config p/express /src` |
| Gitleaks | Git history & working tree secret scanning | `docker run --rm -v "$PWD:/path" zricethezav/gitleaks:latest detect --source="/path" --verbose` |
| OSV-Scanner | Cross-ecosystem CVE matching against `bun.lock` / `package.json` | `docker run --rm -v "$PWD:/src" ghcr.io/google/osv-scanner:latest --lockfile=/src/bun.lock` |
| Knip | Whole-repo dead files / unused exports / unused deps | `npx --yes knip` |
| Madge | Full dependency graph & circular import detection | `npx --yes madge --circular --extensions ts,tsx artifacts/panchabindu/src artifacts/api-server/src` |
| Lighthouse CI (`lhci`) | Core Web Vitals (LCP, INP, CLS) & Performance budget | `npx --yes @lhci/cli autorun --collect.url=http://127.0.0.1:3000/` |
| Playwright WebKit & Firefox | Cross-engine Safari/Gecko responsive & font-zoom checks | `npx playwright install webkit firefox && PLAYWRIGHT_BROWSER=webkit npm run test:home:browser` |
