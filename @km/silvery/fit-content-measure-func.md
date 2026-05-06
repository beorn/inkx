---
mentions:
  - km
  - Bjørn
id: "@km/silvery/fit-content-measure-func"
aliases:
  - km-silvery.fit-content-measure-func
  - km-silvery-fit-content-measure-func
created_by: Bjørn Stabell
created_at: 2026-04-12T05:48:23Z
closed_at: 2026-04-12T07:03:37Z
close_reason: "Implemented two-part CSS fit-content fix. 9/10 regression tests
  passing. Benchmarks clean. Commits: silvery 492bea71, km ce4e915c2"
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.fit-content-measure-func
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-11T22:48:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-silvery.fit-content-measure-func
    depends_on_id: km-silvery.fit-content-clamp
    type: blocks
    created_at: 2026-04-11T22:48:24Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery
      - type: link
        target: km-silvery.fit-content-clamp
---

# [x] fit-content/snug-content should use Yoga measure function for proper parent-aware sizing @km/silvery #feature #P2 @Bjørn Stabell

blocks:: [[@km/silvery]], [[@km/silvery/fit-content-clamp]]

The measure phase currently pre-computes intrinsic size and calls node.layoutNode.setWidth(intrinsicSize.width) BEFORE layout runs. This locks the box to its intrinsic width regardless of what the parent offers during flex resolution. Net effect: fit-content and snug-content boxes overflow narrow parents (pixel collision, off-screen content).

The 0.17.x partial fix (@km/silvery/fit-content-clamp) makes measure-phase respect an explicit maxWidth on the box by clamping availableWidth before measuring children. But that only covers the maxWidth case — when the parent column is narrower than maxWidth (or maxWidth is unset), the bug still bites. Example: text-layout demo at 60-col terminal — each flexGrow=1 column is ~28 cols but each bubble has maxWidth=48, so bubbles render at ~40 cols and collide across columns.

Proper fix: register a Yoga measure function via layoutNode.setMeasureFunc((width, widthMode, height, heightMode) => ...) on fit-content/snug-content nodes instead of setWidth. Yoga calls the measure function DURING layout with the actual available width from the parent flex resolution. The callback computes min(intrinsicSize.width, availableWidth) and returns the box size — including re-running text wrapping at the allocated width.

Reference implementation: vendor/silvery/packages/ag-react/src/reconciler/nodes.ts line 81 — the reconciler already uses setMeasureFunc for text nodes with a cache keyed on (text, width, widthMode). The fit-content path should use the same pattern.

Depends on @km/silvery/fit-content-clamp (which filed the baseline regression tests and the maxWidth partial fix). Closes this bug when the regression tests in vendor/silvery/tests/features/pretext-layout.test.tsx flip from test.fails to passing — especially:

- "fit-content child does not overflow a fixed-width parent" (measured 163 cols in 20-col parent)
- "two flexGrow=1 columns stay within the terminal width"
- "plain Box child (no fit-content) is clamped by fixed-width parent"

Note: the last regression test documents that plain Box ALSO overflows parent width. That might be a separate Flexily cross-axis default bug rather than a measure-phase issue. Investigate whether setMeasureFunc on fit-content nodes also fixes plain Box case, or if there is a second deeper bug in Flexily default alignItems.

Observed symptom: Screenshot 2026-04-11 at 22.41.26.png — bubbles collide and text clips at narrow terminal width.

