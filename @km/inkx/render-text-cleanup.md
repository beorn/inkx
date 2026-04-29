---
id: "@km/inkx/render-text-cleanup"
aliases:
  - km-inkx.render-text-cleanup
  - km-inkx-render-text-cleanup
created_at: 2026-02-05T12:28:15Z
closed_at: 2026-02-05T12:31:23Z
---

# [x] refactor(inkx): deduplicate grapheme rendering + remove unused inWord @km/inkx #task #P3 @claude:b53ef7e4

Code review P2+M5: renderTextLine and renderAnsiTextLine have identical grapheme loops. Extract shared function. Remove unused inWord in wrapText.