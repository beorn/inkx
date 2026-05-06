---
mentions:
  - km
id: "@km/silvery/framebuffer-renderable"
aliases:
  - km-silvery.framebuffer-renderable
  - km-silvery-framebuffer-renderable
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:22Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.framebuffer-renderable
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:22Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Renderable: FrameBuffer (raw pixel buffer) @km/silvery #feature #P4

blocks:: [[@km/silvery/opentui-parity]]

Low-level pixel-buffer renderable for custom drawing paths — graphs, visualizations, charts that don't map to cells. OpenTUI ships this. Foundation for silvery v2.0 canvas horizon.

