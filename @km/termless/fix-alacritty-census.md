---
id: "@km/termless/fix-alacritty-census"
aliases:
  - km-termless.fix-alacritty-census
  - km-termless-fix-alacritty-census
created_by: claude:4929065a
created_at: 2026-03-23T21:48:05Z
closed_at: 2026-03-23T21:50:42Z
close_reason: "Fixed .node require path: ../native/ → ../. All 3 native backends
  load correctly."
owner: bjorn@stabell.org
---

# [x] Fix alacritty .node import path for census probes @km/termless #bug #P1

The require path is ../native/ but the .node file is at the package root. Quick fix.