---
mentions:
  - km
  - claude
id: "@km/inkx/images"
aliases:
  - km-inkx.images
  - km-inkx-images
created_by: claude:ee8efc0f
created_at: 2026-02-23T00:03:39Z
closed_at: 2026-02-23T00:28:59Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Image rendering: Kitty graphics protocol + Sixel @km/inkx #feature #P3 @claude:ee8efc0f

Add an <Image> component that renders bitmap images in supported terminals. Kitty graphics protocol (simpler, modern) as primary, Sixel as fallback. Notcurses already does this. Progressive enhancement: skip or show text placeholder when unsupported. Needs image encoding (base64 for Kitty, sixel encoder for Sixel).

