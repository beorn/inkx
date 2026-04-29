---
id: "@km/_orphan/fzdv"
aliases:
  - km-fzdv
created_at: 2026-01-16T16:58:24Z
closed_at: 2026-01-16T17:09:58Z
---

# [x] TUI2: Add breadcrumb/header bar showing navigation path @km/_orphan #feature #P0

TUI1 shows a full-width white background header bar with the current navigation path:
- Board path segments (black text, gray separators)  
- Item path segments (blue text, blue separators at boundary)
- Example: 'Visual Test Board # Todo / Short task'

TUI2 shows an empty/minimal white bar with no path information.

Files to modify: apps/@km/tui/packages/@km/_orphan/opentui/src/components/Header.tsx

Reference: TUI1 implementation in apps/@km/tui/packages/@km/_orphan/ink/src/views/Board.tsx (getPathSegments, selectedPathSegments)