---
mentions:
  - km
  - claude
id: "@km/all/fix-sweep-tsc-logview"
aliases:
  - km-all.fix-sweep-tsc-logview
  - km-all-fix-sweep-tsc-logview
created_by: claude:cc081a9a
created_at: 2026-04-26T19:58:59Z
closed_at: 2026-04-26T20:02:44Z
close_reason: Closed
started_at: 2026-04-26T19:59:42Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-tsc-logview
    depends_on_id: km-all.fix-sweep-0426
    type: parent-child
    created_at: 2026-04-26T12:59:13Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-0426
---

# [x] Fix km-logview test typecheck errors (79 errors) @km/all #task #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

79 TS18048/TS2722/TS2339 errors in apps/@km/logview/tests/* — term.screen and term.cell are now optional on Term interface. Tests need non-null assertions or type narrowing.

## Files affected (15 test files)

- ansi-colors.test.tsx
- body-hover-color.test.tsx
- body-multiline-muted.test.tsx
- body-rendering.test.tsx
- expand-marker-no-leak.test.tsx
- expand-viewport-stable.test.tsx
- expanded-bg-visible.test.tsx
- expanded-hover-contrast.test.tsx
- follow-mode.test.tsx
- keybindings.test.tsx
- kind-colors.test.tsx
- search-flow.test.tsx
- smoke.test.tsx

## Acceptance

- bun run --silent tsc --noEmit 2>&1 | grep -c 'apps/@km/logview/' returns 0
- bun vitest run apps/@km/logview/tests/ passes (or fails for unrelated reasons)

