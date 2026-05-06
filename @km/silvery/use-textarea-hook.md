---
mentions:
  - km
id: "@km/silvery/use-textarea-hook"
aliases:
  - km-silvery.use-textarea-hook
  - km-silvery-use-textarea-hook
created_by: claude:fbad9cb1
created_at: 2026-03-06T09:42:36Z
closed_at: 2026-03-09T23:48:52Z
close_reason: Already implemented at packages/ui/src/components/useTextArea.ts
  (648 lines). Exported from components.ts. TextArea uses it internally. 14
  tests pass.
owner: bjorn@stabell.org
---

# [x] Extract useTextArea hook from TextArea component @km/silvery #task #P2

Refactor TextArea.tsx (708 lines) to extract core logic into a useTextArea() hook, enabling custom TextArea variants that reuse cursor navigation, selection, scrolling, and editing logic.

The hook should expose:

- lines/visualLines computed from value
- cursor/selection state
- scrollTop state
- handleInput handler
- Imperative API: moveCursor, selectAll

See textarea-design.md 'Hook Architecture' section for the interface spec.

Why deferred: TextArea was just extensively modified by 3 concurrent agents (selection, disabled/maxLength/meta+enter, scrollMargin). All 67 tests pass. Extracting the hook is pure refactoring with high regression risk — better as a dedicated focused task after the current changes are committed and stable.

