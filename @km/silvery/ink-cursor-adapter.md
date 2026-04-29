---
id: "@km/silvery/ink-cursor-adapter"
aliases:
  - km-silvery.ink-cursor-adapter
  - km-silvery-ink-cursor-adapter
created_by: claude:474834b0
created_at: 2026-03-10T19:36:57Z
closed_at: 2026-03-10T19:49:19Z
close_reason: Created withInkCursor() thin adapter in
  @silvery/compat/with-ink-cursor. ~50 lines — just CursorProvider +
  InkCursorStoreCtx context plumbing.
---

# [x] withInkCursor() — thin adapter from Ink useCursor to silvery CursorStore @km/silvery #task #P2 @claude:474834b0

Replace InkCursorStoreCtx with a thin adapter plugin. Ink's useCursor() delegates to silvery's native CursorStore. ~20 lines. Remove cursorStore option — silvery manages this natively.