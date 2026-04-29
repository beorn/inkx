---
id: "@km/silvery/kitty-pixel-alignment"
aliases:
  - km-silvery.kitty-pixel-alignment
  - km-silvery-kitty-pixel-alignment
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:23Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.kitty-pixel-alignment
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Images: Kitty sub-cell pixel-aligned placement + virtual placements @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Support Kitty's virtual image placements (z-index, sub-cell pixel offsets) for precise positioning, overlays, inline diagrams. Current silvery Image assumes cell-aligned.