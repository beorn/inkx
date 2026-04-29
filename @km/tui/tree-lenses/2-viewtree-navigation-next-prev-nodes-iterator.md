---
id: "@km/tui/tree-lenses/2-viewtree-navigation-next-prev-nodes-iterator"
aliases:
  - km-tui.tree-lenses.2
  - km-tui-tree-lenses-2
  - "@km/tui/tree-lenses/2"
created_by: Bjørn Stabell
created_at: 2026-04-05T23:17:39Z
closed_at: 2026-04-05T23:39:40Z
close_reason: "Already implemented in createViewTree (ce58aca8): next(), prev(),
  nodes({ from?, reverse? }), walkOrder. 4 tests cover navigation behavior."
owner: bjorn@stabell.org
---

# [x] ViewTree navigation: next/prev/nodes() iterator @km/tui #task #P2

Add tree-wide navigation to ViewTree:
- view.next(id) → string | null (DFS next in visible tree)
- view.prev(id) → string | null (DFS prev)
- view.nodes() → Iterator<string> (all visible, forward from root)
- view.nodes({ from: id }) → Iterator from specific node
- view.nodes({ from: id, reverse: true }) → backward iterator

Wire sel adapter to use view.nodes() for walkOrder.

Acceptance:
- view.next/prev match existing nextInWalk/prevInWalk behavior
- nodes() iterator produces same order as walkOrder array
- sel adapter reads walkOrder from ViewTree