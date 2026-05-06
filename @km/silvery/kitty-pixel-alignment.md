---
mentions:
  - km
id: "@km/silvery/kitty-pixel-alignment"
aliases:
  - km-silvery.kitty-pixel-alignment
  - km-silvery-kitty-pixel-alignment
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:23Z
---

# [/] Images: Kitty sub-cell pixel-aligned placement + virtual placements @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Support Kitty's virtual image placements (z-index, sub-cell pixel offsets) for precise positioning, overlays, inline diagrams. Current silvery Image assumes cell-aligned.

Follow-up bugs from live silvercode testing: (1) when a Kitty image scrolls to the top of the viewport it disappears abruptly instead of clipping/scrolling out naturally; (2) after scrolling, the hardware cursor briefly blinks near the image's top-left. Audit/fix placement clipping and cursor restoration around image escape output.

