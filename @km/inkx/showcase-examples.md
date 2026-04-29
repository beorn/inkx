---
id: "@km/inkx/showcase-examples"
aliases:
  - km-inkx.showcase-examples
  - km-inkx-showcase-examples
created_by: claude:ee8efc0f
created_at: 2026-02-23T23:57:32Z
closed_at: 2026-02-25T20:05:17Z
---

# [x] Unify showcases and interactive examples @km/inkx #task #P2 @claude:d1f60fb4

Showcases (showcases.tsx) and interactive examples (examples/interactive/) are separate codebases today. Showcases use a custom emitInput() bus and import from xterm/index.js. Interactive examples use the full inkx runtime (useInput from run()). Goal: make them the same components by completing the viewer-contexts.tsx context bridge — xterm.js onData() feeds into inkx InputContext.eventEmitter, so useInput() works in both terminal and browser. This allows writing each example once and using it in both contexts.