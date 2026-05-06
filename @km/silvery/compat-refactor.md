---
mentions:
  - silvery
  - silvery
  - km
  - claude
id: "@km/silvery/compat-refactor"
aliases:
  - km-silvery.compat-refactor
  - km-silvery-compat-refactor
created_by: claude:55df8ef1
created_at: 2026-03-09T20:58:34Z
closed_at: 2026-03-10T01:22:52Z
close_reason: Moved ink-compat hooks (useFocus, useInkFocusManager) from
  @silvery/react/hooks/ink-compat to @silvery/compat/src/ink-focus.ts. Removed
  exports from @silvery/react barrel. Deleted original file.
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Move ink/chalk compat from @silvery/react to @silvery/compat @km/silvery #task #P2 @claude:474834b0

Move all ink/chalk compatibility code out of @silvery/react into @silvery/compat:

- useFocus, useFocusManager (ink-compat hooks)
- measureElement/MeasureElementOutput (ink measurement API)
- Flatten @silvery/react exports (remove /components, /hooks subpaths)
- @silvery/react should contain only silvery's native API
- @silvery/compat should contain everything for Ink/Chalk migration

