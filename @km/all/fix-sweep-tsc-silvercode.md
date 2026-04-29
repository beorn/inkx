---
id: "@km/all/fix-sweep-tsc-silvercode"
aliases:
  - km-all.fix-sweep-tsc-silvercode
  - km-all-fix-sweep-tsc-silvercode
created_by: claude:cc081a9a
created_at: 2026-04-26T19:59:07Z
closed_at: 2026-04-26T20:07:38Z
close_reason: Closed
---

# [x] Fix silvercode + km-agent-view typecheck errors (~37 errors) @km/all #task #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

Errors split across:
- apps/@km/agent-view/tests/* (4 errors, term.screen optional)
- apps/silvercode/packages/agent-harness/tests/ (18 errors)
- apps/silvercode/packages/agent-harness/src/ (1 error)
- apps/silvercode/tests/* (10 errors incl. visual)
- apps/silvercode/src/components/ (2)
- apps/silvercode/src/ (2)

## Acceptance
- bun run --silent tsc --noEmit 2>&1 | grep -E 'apps/(silvercode|@km/agent-view)' | wc -l returns 0
- Underlying tests still pass