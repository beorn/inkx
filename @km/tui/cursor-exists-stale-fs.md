---
id: "@km/tui/cursor-exists-stale-fs"
aliases:
  - km-tui.cursor-exists-stale-fs
  - km-tui-cursor-exists-stale-fs
created_by: Bjørn Stabell
created_at: 2026-04-14T19:05:32Z
closed_at: 2026-04-14T19:14:45Z
close_reason: "Fixed: added repairPaneCursor in board-app-store.ts
  undoableRepo.subscribe handler. When a pane's cursor points to a deleted node
  (e.g. fs sync replaced the file), clamps to first node in walkOrder on the
  next repo mutation. Tests: board-selection.spec.ts > stale cursor repair (2
  tests) — both failed before the fix (cursor-exists invariant fired on press
  Escape) and pass after. Full apps/km-tui/tests/ suite green (2130 tests)."
---

# [x] Invariant violation [cursor-exists] after fs file replacement @km/tui #bug #P2

blocks:: [[@km/tui]]

When a file is replaced in the filesystem (e.g., synced/rewritten with new node IDs), the board view still shows the old node cards. Moving the cursor up to one of those stale-displayed nodes triggers the cursor-exists invariant.

Repro from user:
1. km view a vault
2. Replace a file in the fs (or have it replaced) so its node IDs change
3. Cursor up to a node that visually appears in the board but whose ID no longer exists in repo
4. CRASH: Invariant violation [cursor-exists]: Cursor points to non-existent node {"cursor":"01KP6GZVAZD524MT1Y42PG7V8A"}

Stack:
- apps/@km/tui/src/invariants.ts:327 checkInvariants
- board-app.ts:653 routeThroughCommandSystem
- board-app.ts:385 handleKey

Two bugs:
1. The board view-lens is showing nodes from a stale snapshot — it should be reactively reflecting the repo state
2. Even if a transient gap exists, cursor navigation should clamp/repair to a live node rather than landing on a tombstone (and the invariant should ideally not fire for this — or there should be a fallback that picks the nearest live node)