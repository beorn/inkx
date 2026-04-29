---
id: "@km/tui/transform-migrate"
aliases:
  - km-tui.transform-migrate
  - km-tui-transform-migrate
created_by: Bjørn Stabell
created_at: 2026-04-09T07:52:59Z
closed_at: 2026-04-09T23:50:37Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Migrate board action handlers to sel.transform() — eliminate manual cursor reconciliation @km/tui #task #P2 @Bjørn Stabell

## What

Migrate board action handlers to use sel.transform() (SlateJS pattern)
instead of manual cursor reconciliation.

## Foundation (DONE)

sel.transform(op, prevTree, nextTree) is now available on SelectionStore
(commit d7c57b320). It atomically repairs cursor/anchor/ids/sub when the
tree changes.

## Migration Sites

9 tree mutation calls across 3 files:

- apps/@km/tui/src/board/board-actions-edit.ts (4 calls)
  - executeBatchDelete (the canonical case)
  - handleAddNode variants
  - indent/outdent
- apps/@km/tui/src/board/board-actions.ts (2 calls)
- apps/@km/tui/src/board/board-effect-runner.ts (3 calls)

## Migration Pattern

Replace this:
```ts
// Manual cursor reconciliation
const cursorTarget = computeNextSibling(...)
repo.deleteNode(id)
sel.node.select([cursorTarget])
```

With this:
```ts
// Atomic transform — captures pre-tree snapshot
const prevTree = captureTree(repo)
repo.deleteNode(id)
sel.transform({ type: "deleteNode", id }, prevTree, currentTree)
```

## Prerequisites

1. Implement captureTree(repo) helper that snapshots walkOrder + parent map
   and exposes SelectionTree interface (walkOrder, has, contains)
2. Decide: use the existing TreeLens or build a separate snapshot type?
   The lens is reactive — snapshots need to be immutable

## Why Incremental

The existing manual reconciliation works correctly. Invariant #11 doesn't
fire in tests or real usage. This migration is quality/elegance, not bug
fix. Each handler can be migrated independently with full test coverage.

## Acceptance Criteria

- [ ] captureTree(repo) helper exists with SelectionTree interface
- [ ] executeBatchDelete migrated and tested
- [ ] All 9 tree mutation sites use sel.transform()
- [ ] Manual cursor adjustment code (computeNextSibling, etc.) removed
- [ ] All tests pass
- [ ] Invariant #11 still doesn't fire