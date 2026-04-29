---
id: "@km/silvery/use-cursor"
aliases:
  - km-silvery.use-cursor
  - km-silvery-use-cursor
created_by: claude:474834b0
created_at: 2026-03-10T03:43:54Z
closed_at: 2026-03-10T04:18:43Z
close_reason: "Fixed useCursor hook: cursor position now updates when col/row
  change without layout change. Added useLayoutEffect watching [col, row, shape,
  visible, set] that recomputes from lastRectRef. 11 tests. Committed & pushed."
owner: bjorn@stabell.org
---

# [x] useCursor() hook for terminal cursor positioning @km/silvery #feature #P2

Add useCursor() hook that positions the real terminal cursor at a specific cell after render. Silvery already has cursor control primitives (setCursorStyle, cursorTo, cursorShow/Hide in @silvery/term). Missing: a React hook that tells the renderer where to place cursor after paint. TextInput/TextArea need this. Also needed for Ink compat (useCursor hook).