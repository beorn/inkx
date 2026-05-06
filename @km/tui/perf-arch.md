---
mentions:
  - km
  - claude
id: "@km/tui/perf-arch"
aliases:
  - km-tui.perf-arch
  - km-tui-perf-arch
created_at: 2026-02-08T09:26:23Z
closed_at: 2026-02-08T21:15:39Z
assignee: claude:a3625ec3
---

# [x] TUI architecture refactor: unified state, sync layout, fine-grained updates @km/tui #task #P0 @claude:a3625ec3

## Architecture Refactor: Cursor Movement < 5ms

## Goal

Cursor movement (j/k/h/l) must feel instant on a 1440-node board. Target: <5ms per keypress.

## Benchmark (2026-02-08, 1440 nodes, 200x60)

| Action    | before | after phase 1 |
| --------- | ------ | ------------- |
| cards j   | 86ms   | 73ms          |
| list j    | 46ms   | 33ms          |
| columns j | 40ms   | 25ms          |
| h/l       | 93ms   | 73ms          |

## Phase 1 — COMPLETED

TreeRenderContext, flat Zustand store, reduced subscriptions. Commits: f8d46c51, 7463ae9c, e556e2da, ffebb213.

## Phase 2 — New architecture

### Primitives

**Per-node children cache** in repo. Lazy (populated on demand), surgical invalidation (addNode→bust parent, moveNode→bust old+new, updateNode→nothing, deleteNode→bust parent). All consumers benefit: rendering, navigation, path derivation.

**Path** (number[]). SlateJS-aligned structural coordinate system. Derived lazily from cursorNodeId via cache lookups (no SQL). Pure arithmetic helpers: parent, next, previous, compare, isAncestor.

**ViewNavigation**. One rule: move to the next selectable node in that direction. Cards are the only wrapping container — h/l from inside a card hits the card boundary. All cross-group lateral movement uses curswantY.

### Store (minimal)

```
cursorNodeId: string
rootId: string | null
foldedNodes: Set<string>
selectedNodes: Set<string>
viewMode: ViewMode
```

### Key input flow

```
keypress
  → view.navigate(dir, cursorNodeId, curswantY)
    → uses repo.getChildren (cached) to find next selectable node
  → store.set({ cursorNodeId: newId })
```

### Render flow

```
cursorNodeId changed → Zustand notifies
  → Board re-renders
    → useChildren(repo, rootId) — from cache
    → each Column: useChildren(repo, colId) — from cache
    → each Card: useChildren(repo, cardId) — from cache
    → isSelected via store selector (per component)
    → React.memo: only old + new cursor nodes re-render
  → inkx render pipeline
```

### Mutation flow

```
action → repo.mutate(...)
  → cache: surgical invalidation (affected parents only)
  → store.set({ cursorNodeId: targetId })
  → Zustand notifies → re-render
    → useChildren: cache miss for affected parents only, hits for rest
```

### What gets removed

ColumnsLayout, ColumnState, CardState, colIndex, cardIndex, subPath, subIndex, selectionLevel, isAtCardLevel, isInOutlineMode, COLUMN_HEADER_INDEX, recomputeLayout, deriveCursorPosition, deriveColumnsFromRepo, useColumns, useCursorPosition, updateLayout effect, store→React→store feedback loop, status bar position display, columnIndex/siblingIndex in command context.

### Implementation steps

1. Per-node children cache in repo
2. NodePath module (pathOf, nodeAt, siblings)
3. useChildren(repo, parentId) hook
4. ViewNavigation per view
5. Remove old layout system
6. Profile render pipeline
7. Targeted per-node signals if profiling shows selector cost matters

### Acceptance criteria

1. j/k/h/l < 5ms on 1440-node board, zoom < 20ms
2. No pre-computed layout indices — all derived lazily via Path + cache
3. No store→React→store feedback loop
4. One navigation rule, view-resolved
5. Documented in docs/design/visual-navigation.md

