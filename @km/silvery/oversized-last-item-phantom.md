---
mentions:
  - km
  - claude
id: "@km/silvery/oversized-last-item-phantom"
aliases:
  - km-silvery.oversized-last-item-phantom
  - km-silvery-oversized-last-item-phantom
created_by: claude:8b5b9e1c
created_at: 2026-04-21T03:14:45Z
closed_at: 2026-04-21T04:03:39Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
---

# [x] Phantom ▼1 when scrollTo=lastItem and item is taller than viewport @km/silvery #task #P2 @claude:8b5b9e1c

## Symptom

When the ListView scrollTo target is the last item AND that item is taller than
the effective viewport, layout-phase's calculateScrollState reports a phantom
trailing overflow indicator (▼1) even though there are no items below the
cursor.

## Reproduction

From the listview-scroll-properties.fuzz.tsx sweep (seed 0xc01dcafe, shrunk to
the minimum failing case):

- cols=40, rows=10, viewport=8, items=10, scrollTo=9, estH=4
- heights=[3,3,3,3,3,23,30,28,31,32]
- Last item (f-9, height=32) is the scrollTo target; viewport=8 rows.

Rendered output:

```
000:                   ▲8                  
001: ╭────────────────────────────────────╮
002: │f-9                                 │
003: │                                    │
004: │                                    │
005: │                                    │
006: │                                    │
007:                   ▼1                  
```

▼1 is wrong — there are 0 items below f-9.

## INV-2b violation

Asserted by listview-scroll-contract.test.tsx REGRESSION 2 (already known),
and now caught by listview-scroll-properties.fuzz.tsx via checkAllInvariants.

## Hypothesis (per prompt)

Likely root cause lives in layout-phase.ts `isPhantomReserveCut` logic for
oversized last items extending past `rawViewportBottom`. The trailing
placeholder Box (VirtualList's trailing spacer, zero logical items once window
covers end) may be counted as a "partially-visible bottom child" even when
there are no real items below the cursor.

Separately, the new "too-tall-to-fit" branch in calculateScrollState (commit
257aaf96) now chooses \`target.top - 1\` for oversized targets. That places
the target in row 1 (indicator reserve at row 0), but the bottom of the target
extends far past rawViewportBottom → anything counting 'items below bottom of
effective viewport' may erroneously see the oversized target's own tail as a
below-viewport item, or count the trailing placeholder.

## Scope

Layout-phase only, does NOT affect @km/tui. Fix requires:

1. Distinguishing "placeholder representing zero real items" from "real item
   partially below viewport" in the hiddenBelow counter.
2. Possibly excluding the scrollTo target itself from hiddenBelow when it's
   the last index (target.bottom > visibleBottom would naturally trigger, but
   there are no items after it).

## Out of scope for this session

Surface by INV-5 promotion (commit 71625fdc). Fix deferred to a future session.

