---
mentions:
  - km
id: "@km/tui/view-lens-robustness"
aliases:
  - km-tui.view-lens-robustness
  - km-tui-view-lens-robustness
created_by: Bjørn Stabell
created_at: 2026-04-14T20:01:20Z
closed_at: 2026-04-14T20:08:25Z
close_reason: "Shipped view-lens.fuzz.ts with 3 invariants: walkOrder
  termination + no duplicates, parent/children bidirectional agreement, and full
  reachability from lens root. Runs under FUZZ=1. The strongest check
  (reachability) would have caught the exact zoom-stack-overflow class of bug
  where parent() returns an ancestor whose children() doesn't include the node.
  Simple paragraph+heading trees for now — embeds are a natural extension if
  another regression hits."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.view-lens-robustness
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T13:01:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] View-lens robustness: fuzz + downward walk guard @km/tui #task #P3

blocks:: [[@km/tui]]

Follow-up after the zoom chain.length off-by-one + embed-mismatch fixes. Two defensive improvements:

1. Fuzz harness that exercises view-lens parent/children across random rename/zoom/fold sequences on realistic trees. Should catch re-entry cycles, stale chain links, and embed vs real-children mismatches.
2. Downward walk guard: view-lens.ts has a parentInFlight Set for re-entry protection. Add a mirror childrenInFlight Set with post-condition check that each recorded descendant gets its parent populated. Goal: convert 'chain links silently drop' bugs from 'stack overflow on run' to 'asserts at dev time'.

Origin: this session's zoom stack overflow repro exposed two independent bugs in view-lens parent/children mutual recursion. Shipped fix was minimal; this bead captures the belt-and-suspenders work.

Files:

- packages/@km/_orphan/board/src/view-lens.ts (add childrenInFlight + post-condition)
- packages/@km/_orphan/board/tests/ (new fuzz file)
- vimonkey for the fuzz harness

No user-facing behavior change.

