---
mentions:
  - km
  - claude
id: "@km/silvery/softwrap-selection-fragments"
aliases:
  - km-silvery.softwrap-selection-fragments
  - km-silvery-softwrap-selection-fragments
created_by: claude:2405c72e
created_at: 2026-04-25T21:23:50Z
closed_at: 2026-04-25T22:08:16Z
close_reason: "Implemented in silvery bae47310 + km 239f0819.
  setWrapMeasurer/getWrapMeasurer in @silvery/ag; @silvery/ag-term registers at
  runtime init; computeSelectionFragments emits one Rect per visual line.
  Fallback to \\n-split when no measurer registered. STRICT test: 60-char
  paragraph at width 20 with selection (5,35) emits 2 fragments (y=0 width 15 +
  y=1 width 15). Closes Phase 4b deferred wrap-spanning."
started_at: 2026-04-25T21:52:25Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.softwrap-selection-fragments
    depends_on_id: km-silvery.overlay-anchor-system
    type: parent-child
    created_at: 2026-04-25T14:23:55Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.overlay-anchor-system
---

# [x] Soft-wrap aware selectionFragments — Option B wrap measurer registration @km/silvery #task #P2 @claude:2405c72e

blocks:: [[@km/silvery/overlay-anchor-system]]

Close the Phase 4b leftover: computeSelectionFragments today only splits on embedded \\n. Soft-wrapped paragraphs produce one wide rectangle that visually appears correct but does not produce per-visual-line entries — blocks scrolling/clipping logic that wants to know if the selection is in the viewport.

## Approach: Option B (per design doc § 8)

Register a wrap measurer with @silvery/ag at runtime:

1. @silvery/ag exports setWrapMeasurer({ wrapText }) + getWrapMeasurer().
2. @silvery/ag-term calls setWrapMeasurer at runtime init (per-Term scope, not module-singleton).
3. computeSelectionFragments honors the registered measurer; falls back to \\n-only when no measurer is registered (pure-layout unit tests).
4. Same wrappedLineRects(node, range) helper used by highlight decoration kind in overlay-anchor-impl-v1.

## Acceptance

1. setWrapMeasurer/getWrapMeasurer exported from @silvery/ag.
2. @silvery/ag-term registers at runtime init.
3. computeSelectionFragments produces one Rect per visual line for soft-wrapped selections.
4. STRICT test: 60-char paragraph wrapped at width 20 with selection (5, 35) emits 2 fragments at y=0, y=1 of contentRect.
5. Fallback path (no measurer registered) preserves \\n-only behaviour, verified by a unit test with a fresh @silvery/ag import.
6. No incremental-rendering regressions (SILVERY_STRICT=2 across existing selection fixtures).

## Why not Option A or C

- Option A (lift wrapText into a layering-neutral package) is cleanest long-term but requires moving ~800 LOC of unicode.ts. Filed as a future cleanup, not v1.
- Option C (compute fragments terminal-side) inverts the layout-signals pattern and forces canvas/DOM duplication.

## References

- Design doc: hub/silvery/design/overlay-anchor-system.md § 8
- Parent bead: @km/silvery/overlay-anchor-system
- Rationale: layout-signals.ts:486 docstring (wrap-spanning gap)
- Wrap source: vendor/silvery/packages/ag-term/src/unicode.ts:761 wrapText

