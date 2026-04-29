---
id: "@km/silvery/pretext-cumwidths"
aliases:
  - km-silvery.pretext-cumwidths
  - km-silvery-pretext-cumwidths
created_by: Bjørn Stabell
created_at: 2026-04-10T18:53:28Z
---

# [ ] Full Pretext model: cumWidths + shrinkwrap + Knuth-Plass + novel text layout @km/silvery #feature #P3

Full Pretext model for Silvery text layout — SHIPPED.

## Shipped (2026-04-10)
- buildTextAnalysis: cumWidths, breakpoints, maxGraphemeWidth
- countLinesAtWidth: delegates to wrapText for correctness
- shrinkwrapWidth: binary search for tightest width at same line count
- balancedWidth: disabled (heuristic didn't improve over even wrapping)
- knuthPlassBreaks + optimalWrap: minimum-raggedness DP, per-paragraph, greedy fallback
- Pro review: 5 correctness fixes applied (shrinkwrap bounds, newline handling, cache invalidation)

## Props
- width="snug-content" on Box — tightest container width (Pretext: shrinkwrap)
- wrap="even" on Text — minimum-raggedness line breaking (Pretext: Knuth-Plass)
- ModalDialog, Toast, Tooltip default to snug-content
- All components accept spread BoxProps for overriding

## Docs
- layouts.md#text-layout section with Pretext API mapping table
- about.md links to layouts guide
- Pretext demos linked for each feature

## Performance
- buildTextAnalysis: 3.5us (short), 12us (medium), 108us (long)
- shrinkwrapWidth: 1.2us (short), 5.3us (medium), 77us (long)
- wrap=even rendering: same ~25us as greedy (cached analysis)

## Still open (children beads)
- @km/silvery/pretext-demos: interactive demos (bubbles, masonry)
- @km/silvery/pretext-upstream: propose pluggable measurement to @chenglou/pretext
- @km/silvery/pretext-pluggable-measure: API proposal for terminal/canvas/server backends