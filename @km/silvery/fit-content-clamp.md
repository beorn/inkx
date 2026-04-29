---
id: "@km/silvery/fit-content-clamp"
aliases:
  - km-silvery.fit-content-clamp
  - km-silvery-fit-content-clamp
created_by: Bjørn Stabell
created_at: 2026-04-12T04:28:13Z
closed_at: 2026-04-12T07:01:14Z
close_reason: Root cause identified and fixed in
  km-silvery.fit-content-measure-func. The fix (setMaxWidth + correction pass)
  handles the clamp. Separate bead for plain-Box-without-keyword remains
  test.fails.
---

# [x] fit-content ignores parent available width — children overflow narrow containers @km/silvery #bug #P1 @Bjørn Stabell

blocks:: [[@km/silvery]]

width="fit-content" sets intrinsic max-content width on the Yoga node without clamping to the container's available width. Children render at full intrinsic width regardless of parent, causing overlap/overflow at narrow terminals.

Reproduced by /explore of vendor/silvery/examples/bin/cli.ts text layout at 60 cols — the two flexGrow=1 columns each render their fit-content bubbles at ~30 cols of content regardless of the ~30-col column width, causing border collision and character corruption.

Regression tests (all test.fails): vendor/silvery/tests/features/pretext-layout.test.tsx

- "fit-content child does not overflow a fixed-width parent" — measured 163 cols child in a 20-col parent
- "fit-content re-clamps after terminal resize"
- "two flexGrow=1 columns stay within the terminal width"

Fix location: vendor/silvery/packages/ag-term/src/pipeline/measure-phase.ts — measurePhase() calls node.layoutNode.setWidth(intrinsicSize.width) without reading parent available width. Should use a Yoga measure function so Yoga calls with available width during layout, OR compute min(max-content, available-width) post-layout.