---
mentions:
  - km
id: "@km/silvery/shader-post-process"
aliases:
  - km-silvery.shader-post-process
  - km-silvery-shader-post-process
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:24Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.shader-post-process
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

# [ ] Rendering: post-process hooks on output buffer @km/silvery #feature #P4

blocks:: [[@km/silvery/opentui-parity]]

Allow plugins to post-process the final cell buffer before ANSI emit — color grading, vignette, dim-overlay, CRT effect. Useful for theming + demo effects. OpenTUI ships post-process pipeline.

