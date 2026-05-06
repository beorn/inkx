---
mentions:
  - km
id: "@km/silvery/output-cache-unbounded"
aliases:
  - km-silvery.output-cache-unbounded
  - km-silvery-output-cache-unbounded
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:11Z
closed_at: 2026-03-13T05:26:37Z
close_reason: "Fixed: Added size > 1000 cap to sgrCache and transitionCache in
  output-phase.ts — clears on overflow"
owner: bjorn@stabell.org
---

# [x] Bug: Output-phase sgrCache and transitionCache grow without bound @km/silvery #bug #P2

In output-phase.ts, OutputContext holds sgrCache and transitionCache maps that are never bounded or cleared. With arbitrary hyperlink URLs or many color combos, these grow without limit. Need LRU or size cap.

