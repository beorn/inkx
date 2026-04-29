---
id: "@km/silvery/virtualized-overflow-indicator-counts"
aliases:
  - km-silvery.virtualized-overflow-indicator-counts
  - km-silvery-virtualized-overflow-indicator-counts
created_by: claude:8b5b9e1c
created_at: 2026-04-20T22:27:55Z
closed_at: 2026-04-21T01:29:48Z
close_reason: "Fixed via BoxProps.representsItems + per-child logicalCount in
  layout-phase.ts calculateScrollState + ListView setting representsItems on
  leading/trailing placeholders. Also fixed phantom-reserve-cut for last-child
  INV-2b. New test: listview-variable-heights.test.tsx:258 ('placeholder
  representsItems makes ▲N/▼N exact for a scrolled virtualized list'). Full
  vendor silvery suite green at STRICT=2 for scroll-contract + overflow-fits +
  variable-heights (21 tests). Commit 1d8d6220."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-silvery.virtualized-overflow-indicator-counts
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-20T15:27:55Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Overflow indicator counts wrong for virtualized lists (▼1 means N hidden, not 1) @km/silvery #bug #P2 @claude:8b5b9e1c

blocks:: [[@km/silvery]]

Today, layout-phase scroll-phase derives hidden-count for ▼N / ▲N indicators by counting child Boxes outside the viewport. For a virtualized list, that includes the trailing/leading PLACEHOLDER Box — which represents N logical items, not 1. Result: a column with 15 hidden items shows ▼1.

/pro flagged this in the 2026-04-20 column-top-disappears review. It's an architectural gap: the indicator semantics conflate 'hidden boxes' with 'hidden logical items.'

Two paths:
1. Add explicit override props on scroll container: hiddenAboveCount, hiddenBelowCount. ListView passes (count - endIndex) as hiddenBelowCount and startIndex as hiddenAboveCount.
2. Add explicit virtual-spacer metadata on placeholder Boxes: { virtualItemCount: N }. layout-phase reads it.

Option 1 is simpler and renderer-neutral. Option 2 is more general (works for any virtualization scheme).

Effort: small — 1-2 day change in ListView + scroll-phase. Includes test that verifies indicator count matches actual hidden item count.