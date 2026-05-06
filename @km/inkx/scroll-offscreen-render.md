---
mentions:
  - km
  - claude
id: "@km/inkx/scroll-offscreen-render"
aliases:
  - km-inkx.scroll-offscreen-render
  - km-inkx-scroll-offscreen-render
created_by: claude:5f0aee02
created_at: 2026-02-18T08:25:26Z
closed_at: 2026-02-19T08:58:53Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Scroll container: off-screen content renders blank when scrolled into view @km/inkx #bug #P3 @claude:36393b5d

Content initially off-screen in an overflow=scroll container renders blank (headers/borders visible, card content missing) when scrolled into view via scrollOffset prop change.

## Reproduction

1. Run storybook: `bun run apps/km-tui/tests/storybook.tsx --fullscreen`
2. Navigate to "Layer 3: All Views" (j x 6)
3. Press ArrowDown to scroll
4. Observe: View 2/3/4 BoardCore content is blank (column headers visible, cards missing)

## Confirmed

- INKX_STRICT=1 detects incremental vs fresh render mismatch on first scroll
- Fresh render shows correct content; incremental render has blank card areas
- Scroll mechanism itself works (scrollOffset propagation fixed in 7357bb5)
- Simple nested Box tests pass — needs full BoardCore component complexity to manifest

## Likely root cause

Content-phase cascade for nodes initially clipped at line 222-225 (clearDirtyFlags on off-screen nodes). When scrolled into view with hasPrevBuffer=false, the deeply nested component tree (BoardCore > HorizontalVirtualList > Column > CardColumn > cards) doesn't fully propagate the "needs fresh render" signal.

## Investigation approach

1. Run with INKX_INSTRUMENT=1 to trace skip/render counts at each nesting level
2. Add node trace instrumentation for ViewBox and its children
3. Check if any intermediate node unexpectedly gets hasPrevBuffer=true
4. Write a vitest test using actual BoardCore component tree (from @km/tui testing helpers) inside a scroll container

