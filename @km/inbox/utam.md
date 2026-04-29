---
id: "@km/_orphan/utam"
aliases:
  - km-utam
created_at: 2026-01-20T10:29:35Z
closed_at: 2026-01-20T10:54:45Z
---

# [x] InkX/Flexx: Add tests for untested public APIs @km/_orphan #task #P1

## Problem
Multiple exported APIs have zero test coverage.

### InkX untested hooks:
- `useLayout()` - dimension tracking
- `useFocus()` - focus management  
- `useFocusManager()` - focus API
- `useStdin()`, `useStdout()`
- `RenderScheduler` class

### Flexx untested setters (19 of 34):
- `setAlignContent()`
- `setDisplay(DISPLAY_NONE)`
- `setFlexWrap(WRAP_WRAP)`
- `setOverflow()`
- All reverse flex directions
- `unsetMeasureFunc()`

## Solution
Add unit tests for all exported public APIs. Estimated ~300-400 lines of new tests.