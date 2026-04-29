---
id: "@km/inkx/input-coalesce"
aliases:
  - km-inkx.input-coalesce
  - km-inkx-input-coalesce
created_by: claude:d697f216
created_at: 2026-02-25T11:46:29Z
closed_at: 2026-02-25T19:56:45Z
---

# [x] Coalesce input: batch key events before rendering to avoid lag @km/inkx #feature #P1 @claude:d697f216

When rendering is slow (e.g., 250ms content phase), pressing 'l' many times renders each frame completely before processing the next key. Instead, any pending key input should interrupt/cancel the current render, all keys should be processed in batch, and only then render once. This would make navigation feel instant even when individual frames are slow.