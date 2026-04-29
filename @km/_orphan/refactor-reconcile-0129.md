---
id: "@km/_orphan/refactor-reconcile-0129"
aliases:
  - km-refactor-reconcile-0129
created_at: 2026-01-29T18:20:44Z
closed_at: 2026-01-29T18:33:12Z
assignee: claude:298008b9
---

# [x] Refactor reconcile.ts: extract handler modules @km/_orphan #task #P1 @claude:298008b9

reconcile.ts (1050 lines) has heavy DRY violations in handlers:
- handleCreate vs handleCreateWithParsed (nearly identical)
- handleUpdate vs handleUpdateWithParsed (massive duplication)
- applyReconcileOps vs applyReconcileOpsAsync (duplicate logic)

Recommended approach:
1. Extract handlers/create-handler.ts - unified create
2. Extract handlers/update-handler.ts - unified update with configurable parsing
3. Extract handlers/delete-handler.ts - delete/rename handlers
4. Extract reconciliation-applier.ts - base class for sync/async apply
5. Extract node-differ.ts - all diffing logic
Target: reduce to ~400 lines