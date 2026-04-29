---
id: "@km/tui/reduced-signals-typed-api"
aliases:
  - km-tui.reduced-signals-typed-api
  - km-tui-reduced-signals-typed-api
created_by: Bjørn Stabell
created_at: 2026-04-08T14:52:36Z
closed_at: 2026-04-08T15:03:36Z
close_reason: Function-accessor API shipped. tree.descendants(s =>
  s.cursor).some() + store.node(id).cursor(true). Proxy captures keys at
  definition time. All 216 tests pass. Commit 54176e7d0.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Reduced signals: function-accessor API (s => s.cursor) instead of string keys @km/tui #task #P1 @Bjørn Stabell

Redesign reduced signal API from string keys to function accessors.

## Problem

Current API uses string keys:
```ts
store.defineReduced("cursorDescendant", tree.descendants("cursor").some())
store.setPrimary("sub1", "cursor", true)
```

Design doc (tree-reduce.md) specifies function accessors:
```ts
cursorDescendant: tree.descendants(s => s.cursor).some()
```

String keys are inconsistent with the rest of the codebase, which uses typed property access everywhere (Zustand selectors, PaneSignals, alien-signals, era2 patterns).

## Codebase Precedents

All state access in km uses typed accessors, not string keys:
- Zustand: `(s) => s.ui.showHelp`
- PaneSignals: `ps.rootId()` (alien-signal call)
- useSignal: `useSignal(ps.visibleLens)` (typed signal ref)
- Commands: string IDs for registry lookup only, typed execute context

## Design Direction

Declarative state definition with inferred types:
```ts
const store = reactiveTree({
  state: () => ({
    cursor: signal(false),
    selected: signal(false),
    editing: signal(false),
    cursorDescendant: tree.descendants(s => s.cursor).some(),
    selectedAncestor: tree.ancestors(s => s.selected).some(),
    editingDescendant: tree.descendants(s => s.editing).some(),
  }),
  tree: treeAccess,
})

// Usage: store.node(id).cursorDescendant() — typed, no string lookup
```

## Key Type Challenge

The accessor function `s => s.cursor` needs `s` to be typed as the state object shape. This requires the factory to know its own return type during definition — a circular reference that TypeScript handles via inference from the factory function's return type (same pattern as Zustand's `createStore`).

## Implementation Approach

1. Define `reactiveTree<T>(config)` where T is inferred from `state()` return
2. State factory returns object with primary signals + reduced descriptors
3. Store inspects return: `signal()` values → primary, `[REDUCED]` branded → reduced
4. `node(id)` returns typed proxy with all fields accessible as properties
5. `batch(tree, fn)` unchanged — fn receives typed node accessors

## /complete
```bash
# No string keys in reduced signal definitions
rg 'defineReduced\|setPrimary\|"cursor"\|"selected"\|"editing"' apps/km-tui/src/state/reduced-signals.ts -c | wc -l  # → 0
# Function accessor pattern used
rg 's => s\.' apps/km-tui/src/state/reduced-signals.ts -c  # → > 0
# Tests updated
bun vitest run apps/km-tui/tests/reduced-signals.test.ts  # pass
```