---
id: "@km/inkx/bg-bleed"
aliases:
  - km-inkx.bg-bleed
  - km-inkx-bg-bleed
created_at: 2026-02-04T11:23:54Z
closed_at: 2026-02-04T12:58:41Z
---

# [x] inkx: Background color bleeds across wrapped text lines @km/inkx #bug #P2 @claude:27f1a547

## Problem
When Text with backgroundColor wraps to multiple lines, the background color bleeds
across all wrapped lines instead of being constrained to each line's content bounds.

## Root Cause
The issue is in inkx's `collectTextContent` function (render-text.ts). When processing
nested Text elements, it embeds backgroundColor as ANSI codes in the collected text string
via `applyTextStyleAnsi`. 

When this text is then wrapped by `wrapAnsi`, the ANSI codes are preserved within the
text content. Since we reset+restore parent styles after each child element, the background
persists across line breaks.

## Reproduction
See km storybook View 1 (Cards) - the selected card "Implement auth flow" has yellow
background that extends to the second line "flow" and beyond.

## Potential Fix
The proper fix would be to NOT embed backgroundColor as ANSI codes in `collectTextContent`.
Instead, background should be handled at the buffer level similar to how Box backgroundColor
works - fill the layout bounds first, then render text on top.

This requires architectural changes to how nested Text styling works in inkx.

## Files
- vendor/beorn-inkx/src/pipeline/render-text.ts - collectTextContent, applyTextStyleAnsi
- vendor/beorn-inkx/src/pipeline/render-box.ts - shows how Box bg works (buffer fill)