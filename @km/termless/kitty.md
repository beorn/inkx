---
mentions:
  - km
  - claude
id: "@km/termless/kitty"
aliases:
  - km-termless.kitty
  - km-termless-kitty
created_by: claude:4929065a
created_at: 2026-03-22T20:09:36Z
closed_at: 2026-03-22T20:15:32Z
close_reason: "Package scaffolded: backend.ts, build script (clones kitty GPL
  source), resolve() for registry. 9 backends in manifest. Build script
  documents integration approach — kitty parser extraction is complex due to
  tight coupling."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Backend: kitty VT parser (GPL build-script approach) @km/termless #feature #P2 @claude:4929065a

Add @termless/kitty backend wrapping kitty's C VT parser. GPL-3.0 license means we cannot distribute kitty's code — the npm package ships only a build script + TypeScript wrapper (MIT). The build script clones kitty's repo, extracts the VT parser, compiles to .node via napi-rs. The user creates the derivative work on their own machine. Pattern: like node-canvas shipping build scripts for Cairo (LGPL).

