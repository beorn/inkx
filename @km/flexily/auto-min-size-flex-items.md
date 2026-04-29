---
id: "@km/flexily/auto-min-size-flex-items"
aliases:
  - km-flexily.auto-min-size-flex-items
  - km-flexily-auto-min-size-flex-items
created_by: claude:53042a7f
created_at: 2026-04-25T07:27:48Z
closed_at: 2026-04-25T16:02:30Z
close_reason: "Shipped in flexily commit 2603966. CSS §4.5 flex-item auto
  min-size implemented via UNIT_AUTO sentinel, gated on CSS preset. baseSize
  used as content-min approximation (works for the silvery scroll regression).
  Known v1 gaps documented and tested: flex-basis:0 collapses, wrapping row text
  uses max-content. Max-clamp + fit-content special case included. 13 new tests,
  1602 flexily tests pass under both presets. 1215 fuzz tests pass. Benchmarks
  neutral (~2x Yoga). /pro review (GPT-5.4 Pro + Kimi K2.6) signed off."
---

# [x] Implement CSS auto min-size for flex items (the missing CSS §4.5 item-side rule) @km/flexily #feature #P3 @claude:53042a7f

blocks:: [[@km/silvery]]

**Reframed 2026-04-25** (was: \"scroll container semantics\"). Per /big analysis + GPT-5.4 Pro + Kimi K2.6 dual-pro review (\$2.19, 326s).

## The real problem

flexily implements ONE half of CSS §4.5 — the container side: overflow containers have automatic min-size = 0 (line 587 in layout-zero.ts). This is correct and should stay.

flexily does NOT implement the COMPLEMENTARY rule — the flex-item side: flex items have automatic min-block-size = content-based minimum (NOT 0).

\`vendor/flexily/src/layout-zero.ts:571\`:
\`\`\`typescript
cflex.minMain = minVal.unit !== C.UNIT_UNDEFINED ? resolveValue(minVal, mainAxisSize) : 0
\`\`\`

When min-width/min-height is unspecified (default), flexily falls back to 0. CSS spec says it should fall back to content-based minimum (~min-content).

## Why scroll containers seem broken

Under Yoga preset (flexShrink:0), items can't shrink → bug masked.
Under CSS preset (flexShrink:1), items shrink to 0.6 of a row, rounding makes them disappear. Looks like \"scroll container regression\" but it's actually the missing per-item floor.

In a real browser, the same scroll layout works because each div has implicit min-block-size:auto = 1 line content. The flex algorithm can't shrink below 1 line per item, so 10 items × 1 line = 10 lines > 6-line container = scrollbar.

## Implementation

Change layout-zero.ts:571 to use content-based minimum when minVal is unspecified:

\`\`\`typescript
if (minVal.unit !== C.UNIT_UNDEFINED) {
  cflex.minMain = resolveValue(minVal, mainAxisSize)
} else if (cssPreset) {
  // CSS §4.5: flex item with unspecified main-axis min-size → content-based minimum
  cflex.minMain = baseSize  // baseSize is already the intrinsic content size
} else {
  cflex.minMain = 0  // Yoga: default min = 0 (current behavior)
}
\`\`\`

Gating: CSS preset only. Yoga preset stays at min=0 to preserve drop-in Yoga compat.

## Important corrections from pro review

1. Rule is **content-based** (~min-content), NOT max-content. For text rows in column layout, content-based-min ≈ 1 line, which is what we want.
2. The overflow exception is on the flex item's OWN overflow, not parent. AND in standard CSS, overflow:hidden on the item does NOT zero the auto min — that's a myth. The canonical CSS escape hatch is explicit \`min-width: 0\`.
3. Must distinguish \"unspecified min\" (auto behavior) from \"explicit min: 0\" (opt-out). Currently flexily treats UNIT_UNDEFINED the same as 0; need a sentinel.

## Spec references

- CSS Flexbox §4.5: \"Implied Minimum Size of Flex Items\" — https://www.w3.org/TR/css-flexbox-1/#min-size-auto
- Pro review file: /tmp/llm-53042a7f-is-my-analysis-correct-85i6.txt

## Acceptance

- New behavior under CSS preset: unspecified flex-item min-size resolves to content-based minimum
- Yoga preset preserves min=0 default (no breaking change for Yoga consumers)
- Explicit min:0 opts out (matches CSS escape hatch)
- All 12+ scroll-related test failures from @km/silvery/flexshrink-flip-silvery-only flip experiment pass under CSS preset
- Performance: zero-allocation hot path preserved (use already-computed baseSize, no extra measureFunc calls)

## Blocks

@km/silvery/flexshrink-flip-silvery-only — once this lands, the silvery flip is mechanical (8 call sites + a few test snapshot updates).