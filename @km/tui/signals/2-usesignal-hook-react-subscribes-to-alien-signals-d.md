---
id: "@km/tui/signals/2-usesignal-hook-react-subscribes-to-alien-signals-d"
aliases:
  - km-tui.signals.2
  - km-tui-signals-2
  - "@km/tui/signals/2"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:52:58Z
closed_at: 2026-04-05T09:18:12Z
close_reason: Reactive<T> deleted, useReactive deleted (0 hits). 35 call sites
  migrated. useSignal hook enhanced. 62 test files pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] useSignal hook — React subscribes to alien-signals directly @km/tui #task #P2 @Bjørn Stabell

## useSignal hook + Reactive<T> → signal<T> migration

### Problem
Two signal systems: alien-signals (sel store, computed) and Reactive<T> (ReactiveNodeStore, cursor sync). They don't compose — alien-signals computed can't depend on Reactive<T> values and vice versa. The _selVersion bridge exists because React reads Zustand store (signal-store.ts) while sel writes alien-signals.

### Solution
1. Create useSignal(s) hook: useSyncExternalStore over alien-signals effect
2. Replace Reactive<T> with signal<T> from alien-signals (~20 instances in reactive.ts)
3. Replace useReactive(r) with useSignal(s) in views
4. Delete _selVersion bridge — views subscribe to sel signals directly

### Scope
- reactive.ts: Reactive<T> class → signal<T> from alien-signals
- reactive.ts: ReactiveNodeStore fields (cursor, cursorCardNodeId, cursorColumnNodeId, selected per-node, etc.)
- reactive.ts: useReactive() → useSignal()
- board-app-store.ts: delete _selVersion bridge effect (~20 lines)
- Board.tsx, TreeNode.tsx, CardColumn.tsx, etc.: useReactive(nodeStore.cursor) → useSignal(nodeStore.cursor)

### Key files
- apps/@km/tui/src/state/reactive.ts — Reactive<T> class (lines 20-43), ReactiveNodeStore (lines 103+), useReactive hook (lines 46-50)
- apps/@km/tui/src/state/board-app-store.ts — _selVersion bridge (lines 550-583)
- apps/@km/tui/src/views/Board.tsx — useAppStore selectors for sel state
- apps/@km/tui/src/views/TreeNode.tsx — useReactive(nodeStore.cursor)

### Acceptance
```
grep 'class Reactive' apps/km-tui/src/ -r → 0 hits
grep '_selVersion' apps/km-tui/src/ -r → 0 hits
grep 'useReactive' apps/km-tui/src/ -r → 0 hits
bun vitest run apps/km-tui/tests/ → all pass
```