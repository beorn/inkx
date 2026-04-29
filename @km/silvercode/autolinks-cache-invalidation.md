---
id: "@km/silvercode/autolinks-cache-invalidation"
aliases:
  - km-silvercode.autolinks-cache-invalidation
  - km-silvercode-autolinks-cache-invalidation
created_by: claude:2405c72e
created_at: 2026-04-25T10:10:42Z
closed_at: 2026-04-25T15:22:38Z
close_reason: Implemented in 7d6cc03f2. fs.watch on file-backed previews
  (readme, first-paragraph) with 200ms debounce; TTL fallback for shell-out
  (bd-active). useScopeEffect cleanup in AutolinksContext. 11 autolinks tests
  pass including 5 new watcher tests.
---

# [x] Autolinks cache invalidation via file watcher @km/silvercode #task #P3 @claude:2405c72e

blocks:: [[@km/silvercode/autolinks-config]]

Replace the current 30-second TTL on the preview cache with a file-watcher driven invalidation: when the file backing a preview is modified, the next hover gets a fresh read. Falls back to TTL when the resolves_to target isn't a file (e.g. `bd-active` shell-out).

Parent: @km/silvercode/autolinks-config