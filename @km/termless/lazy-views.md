---
id: "@km/termless/lazy-views"
aliases:
  - km-termless.lazy-views
  - km-termless-lazy-views
created_by: claude:4a5961be
created_at: 2026-03-16T22:05:54Z
closed_at: 2026-03-23T14:45:07Z
close_reason: Converted 17 waitFor calls to auto-retry matchers across 4 test
  files. Added Lazy Views & Auto-Retry section to writing-tests.md.
---

# [x] termless lazy views + auto-retry matchers @km/termless #feature #P3 @claude:4929065a

Done: lazy views (screen/scrollback/viewport/range recompute offsets on every access), timeout option on all auto-retry matchers, DRY createLazyRegionView helper, deprecate waitFor. TODO: waitFor* cleanup across codebase, docs about lazy locator pattern.