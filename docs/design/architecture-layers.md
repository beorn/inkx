# Architecture Layers

km uses three layers. Each layer may only depend on layers below it.

```
Application  (km-tui, km-cli)     state machines, UI, command dispatch
Operations   (km-tree)            tree mutations via TreeMutator interface
Domain       (km-core)            pure data types + static helpers
```

## Domain (km-core)

Pure types and functions. No repo, no DB, no side effects.

**Core interfaces** use the SlateJS namespace pattern: a TypeScript `interface` and a `const` share the same name via declaration merging. A single `import { KNode } from "@km/core"` gives consumers both the type and the namespace.

```ts
// interfaces/node.ts — KNode interface (from types.ts) + KNode namespace
export interface KNode extends _KNodeInterface {}

export const KNode = {
  isOutline(node: NodeLike): boolean { ... },
  isItem(node: NodeLike): boolean { ... },
  isBlock(node: NodeLike): boolean { ... },
  isEmbed(node: EmbedLike): boolean { ... },
  isTask(node: TaskLike): boolean { ... },
  matches(node, props): boolean { ... },
} as const

// interfaces/position.ts — Position interface + Position namespace
export interface Position { parentId: string; childIdx: number }

export const Position = {
  of(node: NodeLike): Position | null { ... },
  first(parentId: string): Position { ... },
  last(parentId: string): Position { ... },
  equals(a: Position, b: Position): boolean { ... },
} as const
```

Also includes: task marker/status conversion, node validation, date utilities, query parser, metadata extraction. All pure functions on data shapes.

## Operations (km-tree)

Tree mutations. Depends on km-core only. Uses a `TreeMutator` interface (which Repo satisfies) rather than concrete storage:

```ts
// block-ops.ts
export interface TreeMutator {
  getNode(id: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  addNode(parentId: string | null, node: Partial<KNode>): string
  updateNode(id: string, changes: Partial<KNode>): void
  moveNode(id: string, newParentId: string, position: number): void
  deleteNode(id: string): void
}
```

Provides: `splitNode`, `mergeWithPrevious`, `indentNode`, `outdentNode`. Currently scattered across files -- a Tree consolidation is planned (bead `km-core.slate-interfaces`).

## Application (km-tui, km-cli)

State machines, UI components, command dispatch, selection, keyboard handling.

- `position-resolver.ts` -- repo-dependent Position helpers (`resolveLocationKey`, `moveTo`, `nodeAt`). Pure `Position` construction stays in km-core; resolution that needs the repo lives here.
- `board-actions.ts` -- command dispatch, verb execution
- Views, dialogs, navigation handlers

## Layer Rules

1. **Domain never imports from Operations or Application.**
2. **Operations never imports from Application.**
3. **Application can import from any layer.**
4. Pure data flows down, effects flow up.

Concretely: `km-core` has zero imports from `km-tree`, `km-tui`, or `km-cli`. `km-tree` imports from `km-core` but never from `km-tui` or `km-cli`.
