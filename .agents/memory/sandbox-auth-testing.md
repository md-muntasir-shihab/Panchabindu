---
name: Sandbox authentication testing
description: Why local authentication smoke tests need development-mode fixtures rather than legacy unit-test identities
---

Use a separate development-mode app with temporary identities for local first-login smoke tests. Keep the environment allowlisted and the working directory isolated, as for domain tests, but do not switch these smoke tests to the legacy unit-test identity mode.

**Why:** The legacy unit-test identity mode bypasses the initial password-change gate. Using it would make a first-login regression test pass without exercising the behavior it claims to cover. The user also explicitly requires preserving existing local usernames, passwords and 2FA defaults.

**How to apply:** Extend authentication smoke coverage using disposable identities and real bootstrap behavior; never load private development credentials or point login mutations at the running development app.
