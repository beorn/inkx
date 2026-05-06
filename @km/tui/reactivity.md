---
mentions:
  - km
id: "@km/tui/reactivity"
aliases:
  - km-tui.reactivity
  - km-tui-reactivity
created_at: 2026-02-05T21:44:31Z
closed_at: 2026-02-12T13:15:50Z
---

# [x] Investigate reactive state management for repo→UI data flow @km/tui #feature #P4

## Problem

`repo.version` (auto-incrementing counter on mutations) is used in `useMemo` deps to invalidate UI caches. Issues:

1. **Fragile accounting**: Every mutation method must remember `version++` — miss one and UI goes stale silently
2. **Dead read**: `useMemo` deps only checked on re-render — relies on co-occurring UI dispatch
3. **Full recompute**: Any mutation recomputes entire `useColumns` derivation (all columns + all cards)
4. **Getter/setter needed**: `versionHolder` pattern exists because mutation methods are created before `repo` object — structurally necessary, not accidental

## Current architecture

```
mutation → version++ → hope React re-renders → useMemo checks version → re-derive all columns
```

useColumns reads repo.getChildren(rootId) + getChildren(columnId) for each column. Pure derivation, but creates fresh objects every time (breaks React.memo referential equality).

## Analysis of approaches

### Quick fix: SQLite total_changes()

Replace manual `version++` with `db.prepare("SELECT total_changes()").pluck().get()`. SQLite maintains this counter automatically — eliminates accounting risk. Same dead-read limitation.

### useSyncExternalStore (medium)

Add subscribe/getSnapshot to Repo. afterMutation hook notifies subscribers → React re-renders automatically. Eliminates dead-read problem. Still recomputes everything.

### Normalized reactive store (full solution)

Maintain a normalized store (Map<id, Node> + Map<parentId, childId[]>) alongside SQLite. Components subscribe to their slice via selectors. Only affected components re-render. This is what Decker does with Slate between Yjs and React.

## Reference: How others solve this

### Slate (rich text editor)

- Editor is mutable singleton (like our repo)
- `onChange` callback registered via WeakMap, fires on every operation
- Callback increments version `v` in React context → subscribers re-render
- Hooks: `useSlate()` (all changes), `useSlateSelection()` (selection only) — granular subscriptions
- Source: https://github.com/ianstormtaylor/slate/blob/main/packages/slate-react/src/components/slate.tsx

### Decker (boardliner)

- Zustand for UI state (selectedIds, draggingIds, editMode)
- Content lives in Yjs+Slate, NOT in Zustand
- Slate-Yjs bindings make Slate reactive to Yjs changes
- Per-component subscriptions via Zustand selectors
- Source: ~/Code/DZ/decker/apps/webapp/packages/decker-boardliner/src/store/

### SQLite reactivity landscape

- **Level 1 — Table-level invalidation**: Track which tables a query touches, re-run on any change. Simple, fast enough. Used by vlcn.io, ElectricSQL, observable-sqlite.
- **Level 2 — Differential dataflow**: Incremental computation pipelines, only process deltas.
- **Level 3 — Inverted index**: Index queries instead of data, pinpoint invalidation.
- Bun doesn't expose SQLite update_hook yet (https://github.com/oven-sh/bun/issues/4175)
- Since we're the only writer/reader, we don't need SQLite hooks — our afterMutation hook already knows when writes happen.
- References:
  - https://vlcn.io/blog/the-march-to-reactivity
  - https://riffle.systems/essays/prelude/
  - https://github.com/jorroll/observable-sqlite

## Key insight

Inline editing (useLineEdit) is local state — keystrokes don't touch repo. Repo mutations only happen on discrete actions (toggle status, move, delete, confirm edit). So full recompute frequency = discrete action frequency, not keystroke frequency. This may be fine for current scale.

## Recommendation

Start with useSyncExternalStore + total_changes() (eliminates accounting + dead reads). If profiling shows full recompute is too slow, upgrade to normalized store with per-component selectors.

