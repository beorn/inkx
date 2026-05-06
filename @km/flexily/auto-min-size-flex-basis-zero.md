---
mentions:
  - km
id: "@km/flexily/auto-min-size-flex-basis-zero"
aliases:
  - km-flexily.auto-min-size-flex-basis-zero
  - km-flexily-auto-min-size-flex-basis-zero
created_by: claude:53042a7f
created_at: 2026-04-25T16:03:08Z
closed_at: 2026-04-25T16:25:14Z
close_reason: "Shipped in flexily commit 8a24f17. Tracked contentMinSize
  separately from baseSize. When flex-basis is auto, contentMinSize ===
  baseSize. When flex-basis is definite (e.g. flex: 1 1 0), re-derives content
  via cachedMeasure with the same constraints as the flex-basis-auto path.
  Gating on minVal.unit === UNIT_AUTO keeps the extra measurement off the hot
  path when auto-min doesn't apply. Three new tests (1604 flexily total).
  Remaining gaps deferred (wrapping row text uses max-content not min-content;
  nodes-with-children with definite flex-basis falls back to baseSize)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-flexily.auto-min-size-flex-basis-zero
    depends_on_id: km-flexily
    type: parent-child
    created_at: 2026-04-25T09:03:08Z
    created_by: claude:53042a7f
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-flexily
---

# [x] Auto min-size: handle flex-basis:0 / flex:1 (use min-content separately from baseSize) @km/flexily #feature #P3

blocks:: [[@km/flexily]]

Known v1 gap from @km/flexily/auto-min-size-flex-items. When a flex item has explicit flex-basis: 0 (the flex: 1 1 0 pattern), baseSize is 0, so the auto-min-size rule resolves to 0 — collapsing the item below its content. CSS-correct behavior: auto min-size uses min-content regardless of flex-basis.

## Fix

Compute content-size separately from flex-basis. For measureFunc nodes, the content size is already cached via cachedMeasure. For nodes-with-children, the recursive layout result. The auto-min-size branch in layout-zero.ts should use that content-size instead of baseSize when baseSize comes from a definite flex-basis.

## Test

vendor/flexily/tests/auto-min-size.test.ts has a 'flex-basis:0 collapses' test that documents the current behavior. Update assertion when the fix lands.

## Test fix

Test 'flex: 1 1 0 row with text content keeps content as auto-min' that verifies the new behavior.

