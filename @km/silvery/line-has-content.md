---
id: "@km/silvery/line-has-content"
aliases:
  - km-silvery.line-has-content
  - km-silvery-line-has-content
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:42Z
closed_at: 2026-03-13T05:16:50Z
close_reason: "Fixed: lineHasContent now checks VISIBLE_SPACE_ATTR_MASK
  (inverse, underline, strikethrough) in addition to char and bg."
---

# [x] lineHasContent/findLastContentLine ignore styled blank lines @km/silvery #bug #P2 @claude:65d845d9

Only checks char \!== ' ', ignoring lines visually meaningful due to background/inverse/underline. Can truncate background-only footer/header rows in inline mode and cause incorrect orphan-line clearing. Found by GPT pipeline review.