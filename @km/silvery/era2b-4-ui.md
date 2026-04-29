---
id: "@km/silvery/era2b-4-ui"
aliases:
  - km-silvery.era2b-4-ui
  - km-silvery-era2b-4-ui
created_by: claude:f8196c1c
created_at: 2026-03-20T20:06:36Z
closed_at: 2026-03-25T07:36:39Z
close_reason: "React hooks for headless machines: useSelectList, useReadline in
  @silvery/headless/react. These bridge pure state machines to React via
  useReducer. Package.json updated with ./react subpath export. Full component
  migration (replacing internal state management in SelectList, TextInput, etc.)
  deferred — hooks are the absorb step."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2b Phase 4: @silvery/ag-react/ui — component refactor @km/silvery #task #P2 @claude:fed8de9e

Move rendered components from @silvery/ui to @silvery/ag-react/ui subpath. Components depend on headless + commands + theme (not signals, not model).