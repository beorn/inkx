---
id: "@km/_orphan/j9nx"
aliases:
  - km-j9nx
created_at: 2026-01-16T14:13:30Z
closed_at: 2026-01-16T17:03:59Z
---

# [x] UI components should use TNode not DBNode @km/_orphan #task #P2

UI components should work with tree representation (TNode/TreeNodeState) not raw database type (DBNode). The data flow: DBNode → TNode → UI Components. Review and update UI component type signatures.