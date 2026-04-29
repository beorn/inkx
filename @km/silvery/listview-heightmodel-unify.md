---
id: "@km/silvery/listview-heightmodel-unify"
aliases:
  - km-silvery.listview-heightmodel-unify
  - km-silvery-listview-heightmodel-unify
created_by: claude:2405c72e
created_at: 2026-04-26T07:47:51Z
closed_at: 2026-04-26T08:41:54Z
close_reason: "Shipped Phase 1+2: silvery c5e58336 + 7c3afbc5 + 98eaadd3.
  HeightModel (Fenwick prefix-sum tree) is sole source for
  totalRows/prefixSum/range queries. sumHeights kept on 2 deliberate sites
  (visibility-gate jitter prevention + SILVERY_STRICT independent cross-check) —
  documented. Phase 3 (incremental delta + STRICT cross-check rewire) deferred.
  22 HeightModel tests + 8 follow-end + 62 listview total all green. Session:
  km-session.0425-evening"
---

# [x] ListView: unify height truths into single prefix-summed HeightModel @km/silvery #epic #P2 @claude:2405c72e

blocks:: [[@km/silvery/architectural-plateau]]

Per /pro review 2026-04-26 (hub/silvery/reviews/2026-04-26-listview-height-independent-pro-review.md). Currently 3+ height representations: totalRowsStable, totalRowsMeasured, rowsAboveViewport, ad-hoc sumHeights() calls. Each fix in this class (J/H/M/O) patches one site. Architectural fix: introduce HeightModel — predictedHeight[i] = measured(i, width) ?? estimate(i), backed by prefix-sum tree (Fenwick/segment) for O(log n) updates and O(1) totals. ALL row-space consumers (scroll cap, at-bottom, scrollbar visibility, thumb position, anchor preservation) derive from one source. Closes the bug class. Companion bead @km/silvery/listview-followpolicy-split for the cursor-vs-stickyBottom split.