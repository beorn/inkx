---
id: "@km/_orphan/ruk0"
aliases:
  - km-ruk0
created_at: 2026-01-16T11:50:45Z
closed_at: 2026-01-16T11:59:54Z
---

# [x] Test gap: km-tree package has 0 tests @km/_orphan #bug #P2

**Test gap**: @km/tree exports tree navigation utilities with zero dedicated tests.

Package: packages/@km/tree/
Untested exports:
- getNodeAtPath() - Navigate tree to node
- getSiblingCount() - Get sibling count
- getCurrentIndex() - Get current index
- collectAllNodeIds() - Collect all node IDs
- findPathByNodeId() - Find node by ID
- Types: TreeNode, TreePath, NodeState, CursorPath

Note: These ARE tested indirectly via @km/_orphan/tui-core tests, but @km/tree has no dedicated test suite.

Fix: Create packages/@km/tree/tests/ or document that testing happens via @km/_orphan/tui-core.