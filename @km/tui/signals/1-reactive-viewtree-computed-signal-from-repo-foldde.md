---
id: "@km/tui/signals/1-reactive-viewtree-computed-signal-from-repo-foldde"
aliases:
  - km-tui.signals.1
  - km-tui-signals-1
  - "@km/tui/signals/1"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:52:57Z
closed_at: 2026-04-05T09:01:04Z
close_reason: "Auto-refresh adapter eliminates all 8 refreshSelTree calls.
  Acceptance: grep refreshSelTree → 0 source hits. 62 test files pass."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Reactive ViewTree — computed signal from repo+foldDepths @km/tui #task #P2 @Bjørn Stabell

## Reactive ViewTree — computed signal from repo+foldDepths

### Problem
ViewTree is rebuilt per key event in buildOpCtx (board-app.ts:257-286). After repo mutations (addNode, deleteNode, moveNode), the cached ViewTree is stale. sel.node.select([newId]) fails because walkOrder doesn't include the new node. Current fix: manual refreshSelTree() at ~7 call sites — fragile, will be missed.

### Solution
Make ViewTree a computed signal: `computed(() => buildViewTree(repo, rootId, foldDepths))`
- Auto-invalidates when repo.version changes (repo mutation)
- Auto-invalidates when rootId changes (zoom)
- Auto-invalidates when foldDepths changes (fold)
- sel adapter reads computed walkOrder — always fresh

### Prerequisites
- repo.getSnapshot() needs to be readable as an alien-signal (wrap in signal + effect)
- rootId and foldDepths need to be signals (currently store fields)
- OR: simpler approach — version-stamped lazy recomputation in sel adapter

### Simplest first step (version-stamped lazy)
In selection-adapter.ts, walkOrder() checks repo.getSnapshot() vs cached version. If stale, rebuild ViewTree. ~20 lines. Eliminates refreshSelTree() immediately.

### Key files
- apps/@km/tui/src/state/selection-adapter.ts:59-75 — walkOrder() implementation
- apps/@km/tui/src/board/board-app.ts:257-288 — buildOpCtx ViewTree cache
- apps/@km/tui/src/board/board-app.ts:322-327 — refreshSelTree() helper

### Acceptance
```
grep refreshSelTree apps/km-tui/src/ -r → 0 hits (deleted)
bun vitest run apps/km-tui/tests/ → same or fewer failures
```