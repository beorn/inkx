---
id: "@km/silvery/text-surface"
aliases:
  - km-silvery.text-surface
  - km-silvery-text-surface
created_by: claude:def7f8a1
created_at: 2026-03-17T07:13:16Z
closed_at: 2026-03-17T07:21:53Z
close_reason: "3 modules built: history-buffer.ts (ring buffer, circular
  eviction), list-document.ts (frozen+live row model), text-surface.ts
  (read/query facade). 32 tests pass. Committed in worktree feat/text-surface."
---

# [x] ListDocument + TextSurface: semantic document model @km/silvery #task #P1 @claude:def7f8a1

Phase 2: Semantic document model spanning frozen + live content. ListDocument (canonical row model), TextSurface (search/getText/hitTest/reveal), HistoryBuffer (ring buffer replacing virtual-scrollback.ts with per-item ANSI snapshots, reflowable on width change).