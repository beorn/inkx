---
mentions:
  - km
  - Bjørn
id: "@km/tree/ktree-namespace"
aliases:
  - km-tree.ktree-namespace
  - km-tree-ktree-namespace
created_by: Bjørn Stabell
created_at: 2026-04-02T22:55:00Z
closed_at: 2026-04-02T23:05:47Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Unify TreeWalk + TreeMutator into KTree namespace — parallel with ViewTree @km/tree #task #P3 @Bjørn Stabell

Current: KNode + TreeMutator + TreeWalk = 3 concepts for one layer. Proposed: KNode + KTree = 2 concepts. KTree.getNode(), KTree.getChildren(), KTree.nodes() (was TreeWalk.nodes), KTree.addNode() etc. Mirrors ViewTree.nodes() API. Fewer concepts, parallel naming across layers. Touches @km/tree vendor package.

