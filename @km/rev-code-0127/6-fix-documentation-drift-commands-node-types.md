---
mentions:
  - km
id: "@km/rev-code-0127/6-fix-documentation-drift-commands-node-types"
aliases:
  - km-rev-code-0127.6
  - km-rev-code-0127-6
  - "@km/rev-code-0127/6"
created_at: 2026-01-27T14:28:39Z
closed_at: 2026-01-27T14:32:29Z
---

# [x] Fix documentation drift (commands, node types) @km/rev-code-0127 #task #P3

**Medium**: Documentation doesn't match implementation

Issues:

1. docs/ref/commands.md describes comprehensive Ctx interface with storage access
  - Actual: CommandContext has only cursor, selection, viewMode
  - Missing: storage, dispatchBoard, dispatch, refresh(), buildTree()
  - Fix: Clarify "Design Target (Future)" vs actual
2. docs/storage.md missing node types
  - Missing: "embed" type in NodeType enum
  - Missing: fs_mtime field in KNode interface
3. docs/architecture.md missing DisposableStore
  - Implementation has DisposableStore class for managing subscriptions
  - Not documented in events section

Actions:

1. Update commands.md to show actual vs target interface
2. Document "embed" type and fs_mtime in storage.md
3. Add DisposableStore to architecture.md

