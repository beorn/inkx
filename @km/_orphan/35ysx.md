---
id: "@km/_orphan/35ysx"
aliases:
  - km-35ysx
created_by: claude:891e3ce1
created_at: 2026-02-28T20:07:29Z
closed_at: 2026-03-01T15:59:57Z
---

# [x] Fix slow typing in ScrollbackList demos - inkx @km/_orphan #bug #P2 @claude:891e3ce1

Every keystroke in controlled TextInput re-renders the entire parent component tree (CodingAgent → ScrollbackList → all exchange items). This causes noticeable typing lag in the static-scrollback.tsx demo.

Root cause: React re-render cascade. setInputText state change in parent triggers full re-render of ScrollbackList and all its children.

Attempted fixes that didn't work:
- Uncontrolled TextInput (ref-based setValue/getValue) — broke pre-fill, didn't eliminate re-renders from timers
- Separate InputBox component with local state — rejected (user: 'don't want yet another input box')

The fix needs to happen at the inkx framework level:
- ScrollbackList should memoize frozen item renders (React.memo or similar)
- Or TextInput needs fundamental decoupling from parent re-renders
- Related to @km/_orphan/g5d0g (Streamline Text Input)

Repro: bun examples/interactive/static-scrollback.tsx → type rapidly in input field → visible lag