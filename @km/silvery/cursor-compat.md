---
id: "@km/silvery/cursor-compat"
aliases:
  - km-silvery.cursor-compat
  - km-silvery-cursor-compat
created_by: claude:474834b0
created_at: 2026-03-10T05:32:45Z
closed_at: 2026-03-10T06:00:01Z
close_reason: Wired compat useCursor to silvery CursorStore. setCursorPosition
  writes directly to store, emits cursor escape sequences. 7 tests.
owner: bjorn@stabell.org
---

# [x] Compat useCursor is no-op stub instead of delegating to silvery useCursor @km/silvery #bug #P2
