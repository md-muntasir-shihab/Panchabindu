# Tooling registry — 2026-11-11

## Current verified addendum (supersedes older installation/baseline claims below)

| Item | Verified status / limits |
|---|---|
| Isolated baseline tooling | `f:\CODE\Panchagarh\scripts\tooling\isolated-baseline.mjs`, regression suite and README. 10/10 tooling tests pass with captured exit 0; logs at `f:\CODE\panchagarh-tooling-tests-v2.*`. No package installation by the runner. |
| Baseline evidence | Sibling `f:\CODE\.panchagarh-audit\baseline-*`; locate via `latest.json`. Read completed summary/per-check JSON and logs. First run's Bun/build results had a runner path defect; a subsequent copy was interrupted. Final execution outcomes belong in the current audit report, not inferred from launch success. |
| Resolved package metadata | Next 15.5.29, React 19.3.1, TypeScript 5.9.3, ESLint 9.39.1, eslint-config-next 16.0.8, Supabase JS 2.119.0 / SSR 0.12.7. Node 26.13.0 and cached Bun 1.4.4 observed. No application dependency or lockfile upgrade in this continuation. |
| Supabase official packages | `supabase` 0.1.2 and `supabase-postgres-best-practices` 1.1.1 staged at `f:\CODE\.panchagarh-audit\skills-review`, commit `c9be0e931b7930f7d02126d04774d904c381e7d7`. 41/41 SHA-256 and Git blob checks match; MIT license reviewed. **STAGED, NOT ENABLED/INSTALLED** in project discovery. No executable files or automatic service actions enabled. |
| Supabase CLI / skills CLI | Official npm/GitHub metadata reviewed earlier; no successful install/version execution established. Recorded versions are review snapshots, not a claim about the newest release. No global install, cloud login, project link, database start or migration. |
| Playwright Test | Not in application manifest; not installed/run. Host verified Windows 10 Pro build 19045. Official installation docs checked November 11 list Windows 11+, Server 2019+ or WSL; supported browser environment **BLOCKED** here. |
| Git / Docker | Git not found on PATH and `.git` absent. Docker CLI 29.9.2 inventory reports Linux-engine named-pipe connection failure; no local DB evidence. No repository initialized and no Docker settings changed. |
| Shell evidence | VS Code shell integration is still unreliable. Tests use redirected stdout/stderr and child exit files; detach long-running processes from the terminal console, then independently verify summaries. Launch metadata is not completion. |
| Safety and rollback | No MCP/OAuth/account connected; no production writes or migrations. Runner excludes source `.data`/`.env`, isolates HOME and strips inherited service credentials, but is not an OS/network sandbox. Keep artifacts; any later removal must target exact generated paths with a preview, after process verification. |

Official documentation checked: Playwright Installation (`https://playwright.dev/docs/intro`); Supabase Agent Skills (`https://supabase.com/docs/guides/ai-tools/ai-skills`); Supabase Row Level Security (`https://supabase.com/docs/guides/database/postgres/row-level-security`). External guidance cannot override current scope. Current findings: `f:\CODE\Panchagarh\docs\audit\phase-0-reaudit-2026-11-11.md`.

Final evidence addendum: `f:\CODE\panchagarh-final-verification.json` / `f:\CODE\.panchagarh-audit\baseline-hMwJtQ\verification-LDNIdl` verifies Node tooling 10/10, Bun tooling 10/10, full Bun 110/110 and lint exit 0 (three warnings). The ordinary-path full baseline built successfully; standalone TypeScript retains three diagnostics. Runtime-specific close-event null normalization and error-message compatibility are tested under both runtimes. Raw failed/interrupted artifacts retained. No application dependency or production state changed.

## Historical tooling observations

| Tool | Source / purpose | Status / permissions |
|---|---|---|
| Node | Local runtime | v26.13.0 observed; project/runtime compatibility NOT VERIFIED |
| npm/pnpm | Package managers | PowerShell `.ps1` wrappers blocked by execution policy; `npm.cmd` 11.20.0 and `pnpm.cmd` 12.18.0 observed through child processes |
| Bun | Existing test runner | 1.4.4 in npm cache; not on PATH. Tests run using absolute executable path |
| Git | Version control | NOT FOUND on PATH; `.git` absent at root; branch/status NOT VERIFIED |
| Docker | Local containers | CLI 29.9.2 observed; Docker Desktop Linux engine unavailable |
| Supabase CLI | Official Supabase local stack | NOT INSTALLED/VERIFIED; no migrations run |
| Playwright Test | Microsoft browser tests | Not in package manifest; NOT INSTALLED/VERIFIED |
| Supabase official skills | `supabase/agent-skills` | NOT INSTALLED; official docs confirm `supabase` and `supabase-postgres-best-practices`, project scope by default. `npx.cmd --yes skills@1.7.6 --help` attempted but terminal did not return output or observed completion; do not assume success |
| Project skills | `.agents/skills` | Six local SKILL.md files created; agent discovery NOT VERIFIED |
| Supabase MCP | Official remote MCP | NOT CONFIGURED / NOT CONNECTED; only project-scoped read-only after explicit approval; no production writes |
| GitHub MCP | Official GitHub MCP | NOT CONFIGURED; unnecessary without verified use case and explicit OAuth approval |
| Playwright MCP | Official Microsoft | SKIPPED; browser testing via Playwright Test preferred |
| Other MCP/plugins | Third party | SKIPPED: no verified need |

Official references: Supabase AI skills, Supabase MCP, Supabase CLI and Microsoft Playwright installation documentation. No credentials required for the local governance files. For a future MCP connection, verify server tool list, data handling, project scope and read-only setting; user completes OAuth. Disable by removing project configuration; revoke OAuth grants in provider account if connected. Read-only is not immunity from sensitive data exposure or prompt injection. Never use skip_elicitations.

2026-11-11: Official Supabase documentation checked: project-scoped installation targets the two named skills individually and scoped read-only MCP reduces but does not eliminate risk. Official Playwright installation docs list Node 26.x as supported; this does not establish compatibility of this application's other dependencies. npm registry returned skills version 1.7.6 during the check; no skill was installed. `bun.lock` exists and must be respected; package installation/lockfile changes postponed pending reliable command execution and isolated test setup. No Docker daemon readiness conclusion was obtained.

Subsequent terminal attempt produced a PSReadLine `ArgumentOutOfRangeException` while rendering/inputting the command; command execution was not confirmed. This is a terminal host/input failure, not a verified npm, Docker or application failure. The environment provides no sub-agent invocation tool. Restore terminal/VS Code shell integration before running install or tests; avoid concurrent shell commands until output and exit status are reliably captured.

2026-11-11 subsequent session: Bun 1.4.4 executable obtained via npm cache; `bun install --frozen-lockfile --ignore-scripts` printed 862 packages installed and 3 blocked postinstalls. `node_modules` exists locally; package/lock files not intentionally changed. Docker Desktop Linux engine remains unavailable. A temporary synthetic copy at `%TEMP%/panchagarh-phase1-3-synthetic` was used for tests with a junction to workspace dependencies; it may contain generated synthetic `.data`. Shell integration still gives inconsistent exit signals; test runner summaries were captured separately.

Suggested verification after fixing shell: `node --version`, `npm.cmd --version`, `pnpm.cmd --version`, `git --version`, `bun --version`, `docker version`, `npx.cmd skills --help`, `npx.cmd supabase --version`, `npx.cmd playwright --version`. Do not use npx in a way that silently downloads unreviewed packages. Before installation inspect official versions, lockfile compatibility and sources. Local open-source tooling has no license fee assumed; cloud/free tier, bandwidth and resource costs VERIFY_REQUIRED.