---
id: "@km/silvery/implicit-invariants-audit"
aliases:
  - km-silvery.implicit-invariants-audit
  - km-silvery-implicit-invariants-audit
created_by: claude:8b5b9e1c
created_at: 2026-04-20T21:52:39Z
closed_at: 2026-04-21T00:58:54Z
close_reason: "Added 5 STRICT invariants across scroll/layout contracts (4
  generic in layout-phase.ts:878-985 strictScrollInvariants, 1 in
  ListView.tsx:667-687 leadingHeight vs sumHeights). SILVERY_STRICT=1 warn / =2
  throw. Placed before skipStateUpdates so fresh-render comparisons also catch
  violations. Full silvery suite (5018 tests + STRICT=2) green: no new failures,
  no invariant violations. Commit 0cdf5f5b."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-silvery.implicit-invariants-audit
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-20T14:53:01Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-silvery.implicit-invariants-audit
    depends_on_id: km-silvery.virtualizer-from-layout
    type: blocks
    created_at: 2026-04-20T15:10:10Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Audit silvery for implicit contracts → convert to STRICT-mode invariants @km/silvery #task #P2 @claude:8b5b9e1c

blocks:: [[@km/silvery]], [[@km/silvery/virtualizer-from-layout]]

Multiple variants of column-top-disappears (4 sessions, 5+ commits) all stemmed from one undocumented contract: 'leadingHeight must equal scrollOffset' between useVirtualizer and scroll-phase. The contract was implicit and only became visible when broken under variable-height inputs.

Audit silvery's coordination points for similar implicit contracts and convert them to runtime invariants gated under SILVERY_STRICT (or a new SILVERY_INVARIANTS=1 env). Failure should throw with diagnostic context, not log silently.

Candidate areas to audit:
- scroll-phase: leadingHeight + sum(visible) >= scrollOffset + viewportHeight; firstVisibleChild/lastVisibleChild consistent with hiddenAbove/hiddenBelow counts
- clip bounds: childClipBounds always within viewportClipBounds; clip bottom never < clip top
- sticky positions: renderOffset within viewport when isSticking; never overlaps non-sticky pixels
- scroll anchors: explicit scrollOffset never beyond contentHeight - viewportHeight
- indicator reserves: hasOverflow implies indicatorReserve > 0 implies clip-bottom shrunk
- prevLayout/layoutChangedThisFrame: cleared exactly once per render, never stale

Pattern: use util like 'silveryAssert(cond, msgFn)' that's no-op in production, throws in tests/STRICT. Inspired by db CHECK constraints — make hidden contracts visible by failing loudly.

Why this exists: column-top-disappears reopened 3x this session because each fix exposed the next variant of the same divergence. STRICT=2 didn't catch it because it asserts incremental==fresh; both can be wrong identically. The right defense is per-coordination-point invariants.