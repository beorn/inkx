---
id: "@km/silvery/adapter-text-divergence"
aliases:
  - km-silvery.adapter-text-divergence
  - km-silvery-adapter-text-divergence
created_by: claude:c9beade3
created_at: 2026-03-13T07:13:22Z
closed_at: 2026-03-13T07:41:38Z
close_reason: "Fixed: adapter now respects outlineTop/Bottom/Left/Right props
  and uses formatTextLines for text wrapping/truncation/newlines. 8 new TDD
  tests."
---

# [x] Content-phase-adapter text rendering ignores wrapping + outline side flags @km/silvery #bug #P1

Adapter renderText does single-line truncation, ignoring wrap/newlines, violating layout contract. Adapter renderOutlineAdapter always draws all 4 sides, ignoring outlineTop/Bottom/Left/Right. GPT 5.4 review finding, upgraded from P1 to high P1.