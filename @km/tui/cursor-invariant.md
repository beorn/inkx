---
mentions:
  - km
id: "@km/tui/cursor-invariant"
aliases:
  - km-tui.cursor-invariant
  - km-tui-cursor-invariant
created_by: claude:f8196c1c
created_at: 2026-03-28T01:52:14Z
owner: bjorn@stabell.org
---

# [ ] Assert on null cursor with non-empty board — catch future cursor-loss bugs @km/tui #task #P4

Add an invariant check: if cursorNodeId is null AND the board has visible cards, throw/assert instead of silently losing navigation. This forces every code path that accidentally nulls the cursor to be found and fixed, rather than masked by fallback recovery. Context: @km/tui/cursor-lost fixed the workspace-restore path, but other paths could still lose cursor. The assertion would fire during development/testing to surface them.

