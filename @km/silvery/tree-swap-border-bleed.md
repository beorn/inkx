---
id: "@km/silvery/tree-swap-border-bleed"
aliases:
  - km-silvery.tree-swap-border-bleed
  - km-silvery-tree-swap-border-bleed
created_by: Bjørn Stabell
created_at: 2026-04-12T04:29:00Z
---

# [ ] incremental render leaves stale border chars when demo tree swaps at same position @km/silvery #bug #P2

blocks:: [[@km/silvery]]

Observed via /explore of vendor/silvery/examples/bin/cli.ts text layout: cycling from demo 2 (borderStyle="single" ┌─┐) to demo 3 (borderStyle="round" ╭─╮) leaves the OLD single-border top row visible behind the new round-border at the same cell position, producing a stacked-border artifact.

NOT reproduced via createRenderer.rerender() with a simple borderStyle prop change — that path correctly updates border cells. The bug involves an entire component tree unmounting and a different tree mounting at the same position (conditional rendering of Demo1 / Demo2 / Demo3 via a state toggle).

Needs a regression test that uses rerender() to swap ENTIRE trees, not just prop changes, to exercise the dirty-flag cascade for mount/unmount at the same layout position.

Screenshot: /tmp/explore-screenshots/03-demo3-wide-120.png

Also in the same screenshot: the second paragraph box in demo 3 has an off-by-one height measurement — the last wrapped line of text overwrites the bottom border row. May or may not be the same root cause.