---
id: "@km/silvery/ansi-extract"
aliases:
  - km-silvery.ansi-extract
  - km-silvery-ansi-extract
created_by: claude:f8196c1c
created_at: 2026-03-27T04:38:07Z
closed_at: 2026-03-27T04:48:41Z
close_reason: "@silvery/ansi@0.1.0 published. Extracted detection.ts,
  sgr-codes.ts, constants.ts, utils.ts, types.ts from ag-term. ag-term now
  re-exports from @silvery/ansi. @silvery/commander uses it for shouldColorize()
  (NO_COLOR/FORCE_COLOR/isTTY). One dep: string-width."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Extract @silvery/ansi as standalone zero-dep package from ag-term @km/silvery #task #P2 @claude:f8196c1c

ANSI utilities (detection, SGR codes, constants) are trapped inside @silvery/ag-term which depends on React/flexily/etc. Extract to standalone @silvery/ansi package.

Files to move from packages/ag-term/src/ansi/:
- constants.ts (ANSI code constants)
- detection.ts (NO_COLOR, FORCE_COLOR, isTTY, color level, terminal caps)
- sgr-codes.ts (fg/bg color code generation)
- utils.ts (string helpers)

These have zero actual deps on ag/ag-react/React/flexily — purely string functions + process.env checks.

After extraction:
- ag-term imports from @silvery/ansi instead of ./ansi/
- @silvery/commander uses @silvery/ansi as optional dep for theme-aware, NO_COLOR-respecting colorization
- Any future CLI tool can use @silvery/ansi without pulling in React