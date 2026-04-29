---
id: "@km/silvery/ink-compat-minimize"
aliases:
  - km-silvery.ink-compat-minimize
  - km-silvery-ink-compat-minimize
created_by: claude:474834b0
created_at: 2026-03-10T07:12:17Z
closed_at: 2026-03-10T08:31:16Z
close_reason: "162/162 ink compat tests passing. Implemented: SGR native chalk
  compat (eliminated 200-line conversion layer), wrapRoot/stdin renderer
  options, position=static, and fixed 3 flexily min/max layout bugs."
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Minimize ink compat surface area and close remaining gaps @km/silvery #task #P2 @claude:474834b0

Track and drive all changes needed to shrink the ink compat layer toward zero.

## Goal
Make silvery natively compatible with Ink patterns so the compat layer becomes thin wrappers (re-exports + trivial adapters), not a parallel rendering stack.

## Active Sub-beads
- **@km/silvery/sgr-compat** — Differential SGR output (eliminates toChalkCompat ~200 lines)
- **@km/silvery/ink-compat-audit** — Test suite gap tracking (127/134 pass, 7 flexily gaps)

## Potential Further Reductions
- [ ] Pass process: { stdin, stdout } directly → eliminate stdin bridging code
- [ ] wrapRoot plugin or withInk() → eliminate manual wrapElement()
- [ ] chalkCompat output mode on renderer → eliminate post-processing
- [ ] Align InkInstance shape with silvery App → reduce adapter surface
- [ ] Fix flexily layout gaps (minWidth, maxWidth, gap+flexWrap) → close remaining 7 test failures
- [ ] VS16 emoji stripping — handle at renderer level, not compat layer

## Current Compat Surface (~80 lines render path + ~200 lines ANSI conversion)
The render() test path in ink.ts and toChalkCompat/stripSilveryVS16 functions.