---
mentions:
  - km
  - Bjørn
---

# [x] Unify TreeWalk + TreeMutator into KTree namespace — parallel with ViewTree @km/storage/tree #task #P3 @Bjørn Stabell

Current: KNode + TreeMutator + TreeWalk = 3 concepts for one layer. Proposed: KNode + KTree = 2 concepts. KTree.getNode(), KTree.getChildren(), KTree.nodes() (was TreeWalk.nodes), KTree.addNode() etc. Mirrors ViewTree.nodes() API. Fewer concepts, parallel naming across layers. Touches @km/storage/tree vendor package.

