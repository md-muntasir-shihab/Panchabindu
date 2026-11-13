---
name: Imported dependency majors
description: Avoid changing validation-library semantics when porting existing source into the workspace.
---

Preserve imported dependency major versions instead of automatically accepting workspace catalog defaults.

**Why:** The source uses Zod 4's refinement-preserving string methods. The scaffold catalog supplied Zod 3, which built successfully but crashed at startup when a refined schema was chained with a string constraint.

**How to apply:** Compare source dependency majors with catalog versions during future ports or dependency moves. Verify server startup as well as bundling; a successful bundle alone does not prove runtime API compatibility.
