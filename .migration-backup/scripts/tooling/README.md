# Isolated local baseline

Scope: local tooling and Phase 0 evidence only. This runner does not authorize application fixes, database access, deployment, or later phases.

From PowerShell, run the tooling regression tests:

```powershell
node.exe --test 'f:\CODE\Panchagarh\scripts\tooling\isolated-baseline.test.mjs'
```

Then run the baseline (Bun must already exist; nothing is downloaded):

```powershell
$env:PANCHAGARH_BUN = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx\9ec17c29a94a501f\node_modules\bun\bin\bun.exe'
node.exe 'f:\CODE\Panchagarh\scripts\tooling\isolated-baseline.mjs'
```

The Bun override is optional on this machine: the runner also checks the previously inventoried npm-cache executable. It does not install Bun, modify PATH, or run package lifecycle scripts. Use a real executable path if overriding it; do not copy a credential into the environment.

## What is checked

- An actual dependency copy and allowlisted application/configuration/script copy are created under `f:\CODE\.panchagarh-audit\baseline-*`, outside the project. Existing dependencies must be installed first.
- Existing `.data`, `.env`/`.env.*`, Git state, Supabase local cache, nested dependencies and build output are excluded from the source copy. Source symlinks and workspace aliases into the original tree are rejected.
- The application uses its built-in synthetic fixtures in the disposable copy. This is not an import of business data. Tests may create or delete synthetic `.data` there.
- Inherited service credentials and Node injection settings are not forwarded. HOME/USERPROFILE are isolated; the encryption key is randomly generated for the run and is never printed.
- Bun tests, TypeScript and ESLint run against that copy; the Next.js production build runs afterward. The separate tooling tests must be run first as shown above.
- Per-check stdout, stderr, timestamps, exit code, spawn errors and timeout state are written to `logs`. Read `f:\CODE\.panchagarh-audit\latest.json` to locate the evidence directory and `summary.json`.
- Before/after SHA-256 fingerprints cover the allowlisted source/configuration/scripts, not documentation, dependencies, excluded private files, or the complete repository. `checksPassed` is separate from `status: FINISHED`; a finished run with failed/blocked checks exits nonzero.

## Limitations and safety

This is **not an OS sandbox or network-denial boundary**. Project code and installed dependencies still execute with the local user's OS permissions. `next/font/google` can fetch fonts during the build. No browser, database, RLS, storage, external integration, production readiness, or security certification is implied by a pass.

Timeouts terminate only the direct child. Inspect descendants before reusing or cleaning a run directory. Abrupt terminal/process termination can leave `latest.json` at `COPYING`/`CHECKING`; a launch file or that status alone is not completion evidence. Prefer a detached process with redirected output when terminal integration is unreliable, and independently read the result files.

Keep baseline artifacts for audit. Any later cleanup must identify the exact generated directory, confirm that its processes have exited, and preview deletion; never point cleanup at `f:\CODE` or the project root. No cleanup, dependency upgrade, migration, or service connection is part of this runner.