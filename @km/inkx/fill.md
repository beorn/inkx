---
id: "@km/inkx/fill"
aliases:
  - km-inkx.fill
  - km-inkx-fill
created_by: claude:28b14b32
created_at: 2026-02-23T02:09:31Z
closed_at: 2026-02-23T02:37:58Z
---

# [x] Repeat component: repeat children to fill available space @km/inkx #feature #P2 @claude:28b14b32

New <Repeat> component for inkx. Wraps children and repeats them to fill parent's allocated width. Optional max prop to limit repetition count. Handles wide chars (never splits glyph), partial pattern at end (CSS leader spec), zero width → nothing. Lives in content phase of the 5-phase pipeline. Use cases: dot leaders in help screens, section header fills, star ratings, decorative patterns.