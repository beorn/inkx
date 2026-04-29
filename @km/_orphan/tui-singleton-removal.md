---
id: "@km/_orphan/tui-singleton-removal"
aliases:
  - km-tui-singleton-removal
created_at: 2026-01-24T00:39:31Z
closed_at: 2026-01-24T16:33:02Z
---

# [x] Remove singleton usage from TUI layer @km/_orphan #task #P2 @15d108d7

## Background

Partial work was done to remove singleton functions from TUI code and pass vault via props/context. This work was incomplete and has been reverted.

## Affected Files

The following files need refactoring to accept vault as a parameter instead of using global getStore()/getNode()/etc:

- apps/@km/tui/src/board-adapter.ts
- apps/@km/tui/src/board-pills.ts
- apps/@km/tui/src/render.ts
- apps/@km/tui/src/state.ts
- apps/@km/tui/src/text/format.ts
- apps/@km/tui/src/views/Board.tsx
- apps/@km/tui/src/views/ListView.tsx
- apps/@km/tui/src/views/tree-node-helpers.ts

## Pattern

Change functions like:
```typescript
function getInheritedColor(node: KNode): string | undefined {
  const ancestors = getAncestors(node.id);  // singleton
  // ...
}
```

To:
```typescript
function getInheritedColor(vault: Vault, node: KNode): string | undefined {
  const ancestors = vault.getAncestors(node.id);  // DI
  // ...
}
```

## Testing

Update board-test.ts to pass vault through all render paths.