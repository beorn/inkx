---
id: "@km/inbox/y0ax"
aliases:
  - km-y0ax
  - "@km/_orphan/y0ax"
created_at: 2026-01-20T14:30:17Z
closed_at: 2026-01-20T14:51:47Z
---

# [x] mdtest: Remove or implement unimplemented API stubs @km/_orphan #bug #P1

Critical: api.ts exports runMdTestFile() and runMdTests() which throw 'Not implemented yet'. Also MdTestOptions interface is defined but never used.

**Problem:**
- Consumers importing from @beorn/mdtest get runtime errors
- api.ts:62-81 contains stub functions that throw errors
- MdTestOptions (api.ts:18-27) defines unused options: format, useHeadings, showCommandPrefix, serial, verbose, quiet

**Options:**
1. Remove the stubs entirely (preferred - they're unused)
2. Mark as @internal to hide from public API
3. Actually implement the programmatic API

**Files:**
- vendor/beorn-mdtest/src/api.ts