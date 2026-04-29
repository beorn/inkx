---
id: "@km/inkx/style-transitions"
aliases:
  - km-inkx.style-transitions
  - km-inkx-style-transitions
created_by: claude:ee8efc0f
created_at: 2026-02-22T23:29:12Z
closed_at: 2026-02-22T23:55:04Z
---

# [x] Style transition cache: minimal SGR diff between style pairs @km/inkx #task #P2 @claude:ee8efc0f

CC's StylePool has a transition(oldStyleId, newStyleId) method that computes the minimal SGR escape sequence to go from one style to another. Instead of resetting and re-applying all attributes, it diffs the two styles and emits only what changed. inkx currently caches per-style SGR strings but doesn't cache transitions between style pairs. Implementing this would reduce escape sequence output, especially in dense UIs where adjacent cells share many style attributes.