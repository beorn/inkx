---
id: "@km/silvery/shader-post-process"
aliases:
  - km-silvery.shader-post-process
  - km-silvery-shader-post-process
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:24Z
---

# [ ] Rendering: post-process hooks on output buffer @km/silvery #feature #P4

blocks:: [[@km/silvery/opentui-parity]]

Allow plugins to post-process the final cell buffer before ANSI emit — color grading, vignette, dim-overlay, CRT effect. Useful for theming + demo effects. OpenTUI ships post-process pipeline.