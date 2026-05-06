---
mentions:
  - km
  - claude
id: "@km/silvery/listview-refinements"
aliases:
  - km-silvery.listview-refinements
  - km-silvery-listview-refinements
created_by: claude:2405c72e
created_at: 2026-04-25T16:14:28Z
closed_at: 2026-04-25T19:21:47Z
close_reason: Six refinements landed at vendor/silvery d28ae1d2 + km bump
  d0a553da9. Width-keyed measurement cache (${itemKey}:${width}), top/bottom
  scroll spacers (preserve virtual extent), viewport-anchored windowing via
  firstVisibleChild, maxEstimatedRows budget (cap by cost not count),
  virtualization prop (none|index|measured) with virtualizationThreshold default
  100. 17 new tests in tests/features/list-view-refinements.test.tsx all pass;
  broader silvery features tests no new failures (1695 pass, 26 pre-existing
  baseline failures). silvercode message-wrap-truncation + markdown regression
  tests still pass.
started_at: 2026-04-25T19:05:29Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.listview-refinements
    depends_on_id: km-silvery.view-as-layout-output
    type: parent-child
    created_at: 2026-04-25T09:14:28Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.view-as-layout-output
---

# [x] ListView height-independence: row-budget, width-keyed cache, scroll spacers, escape hatch @km/silvery #feature #P1 @claude:2405c72e

blocks:: [[@km/silvery/view-as-layout-output]]

Phase 3 of `km-silvery.view-as-layout-output` shipped (vendor/silvery 72b8fa52 + km 19ea18e21) with index-window virtualization (cursor ± 50 overscan; flex-grow=1 overflow=scroll). Pro review (2026-04-25) flagged this as defensible for current chat-history workloads but insufficient as a general ListView strategy.

## Issues

### 1. Cursor-windowing != viewport-windowing

The current window is `cursor ± overscan`, but users can scroll independently of cursor. Symptom: scroll past the cursor's position → rendered slice is wrong. Fix: window must be **viewport-anchored**, with cursor as a secondary constraint.

### 2. Lost scroll extent on resize / prepend

Without top/bottom spacers (measured or estimated), scroll position drifts on resize and content prepend. Especially bad for chat logs where new messages appear at the bottom.

### 3. Width-dependent item heights — no width-keyed measurement cache

If item wrapping depends on available width, the per-item measurement cache MUST be keyed by (id, width). Otherwise pane resize causes correctness bugs (cached heights are wrong for the new width).

### 4. Cap by cost, not item count

50 items is cheap for 1-line rows, expensive for tall markdown blocks. Add row-budget: `maxEstimatedRows` alongside `maxItems`. Window expands until either limit is hit.

### 5. Escape hatch

Add `virtualization="none" | "index" | "measured"` prop. "none" renders all items (right default for small lists). "index" is current behavior. "measured" is the future (real pixel-aware virtualizer with anchor preservation).

### 6. Disable below threshold

Default to `virtualization="none"` for lists under N items / M estimated rows. Most real lists never need virtualization.

## Required invariants

- **Never under-render the visible viewport.** If unsure, render more, not less.
- **Preserve scroll extent.** Spacers from measured-or-estimated heights.
- **Anchor to viewport first, cursor second.** Use `ScrollStateSnapshot.firstVisibleChild`.
- **Width changes invalidate measurement cache.** Width-keyed cache.
- **Render-all for small lists.** Threshold-driven.

## Test workloads to cover

- Long code blocks (highly variable height)
- Mixed text + image content (image rendered in cell-block dimensions)
- Wheel scroll without cursor move
- Prepend (new messages at top)
- Resize with cached heights (different width)

## References

- /pro deep review: `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-5zsn.txt` § Phase 3
- /pro fast review: `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-yvaz.txt` § B + E
- Phase 3 commit: vendor/silvery 72b8fa52 + km 19ea18e21
- Parent: `km-silvery.view-as-layout-output`
- Prior art: `react-window`, CodeMirror viewport rendering, ProseMirror virtualization

## Acceptance

- [ ] Width-keyed measurement cache (resize doesn't desync heights)
- [ ] Top/bottom spacers preserve scroll extent
- [ ] Viewport-anchored windowing (firstVisibleChild as primary anchor)
- [ ] `maxEstimatedRows` row-budget alongside `maxItems`
- [ ] `virtualization` prop: none / index / measured
- [ ] Default = none below threshold
- [ ] Tests cover variable-height items + scroll-independent-of-cursor + resize

