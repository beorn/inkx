---
id: "@km/silvery/era2b-1-headless"
aliases:
  - km-silvery.era2b-1-headless
  - km-silvery-era2b-1-headless
created_by: claude:f8196c1c
created_at: 2026-03-20T20:06:35Z
closed_at: 2026-03-25T07:18:27Z
close_reason: "@silvery/headless package created with 3 pure state machines:
  createMachine (observable container), SelectListState (cursor navigation),
  ReadlineState (text editing with kill ring, history, undo). 100 tests passing.
  Extracted from silvery-internal prototype. Component refactor (using these
  machines in existing components) deferred to era2b-4-ui."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2b Phase 1: @silvery/headless — extract pure state machines @km/silvery #task #P1 @claude:fed8de9e

New package. Extract SelectListState, TextInputState, VirtualListState, ToggleState, TabGroupState from @silvery/tea. Pure (action, state) → state. No React, no rendering. Depends only on @silvery/create.