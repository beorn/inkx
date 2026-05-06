---
mentions:
  - km
id: "@km/silvery/animated-images"
aliases:
  - km-silvery.animated-images
  - km-silvery-animated-images
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:24Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.animated-images
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:24Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Images: Animated image support (GIF frames + sixel loops) @km/silvery #feature #P4

blocks:: [[@km/silvery/opentui-parity]]

Play multi-frame images — animated GIFs via Kitty animation frames or sixel loops. Integrate with useAnimation for frame scheduling.

