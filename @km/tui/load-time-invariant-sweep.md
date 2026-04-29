---
id: "@km/tui/load-time-invariant-sweep"
aliases:
  - km-tui.load-time-invariant-sweep
  - km-tui-load-time-invariant-sweep
created_by: Bjørn Stabell
created_at: 2026-04-15T04:25:50Z
---

# [ ] Run checkInvariants once post-restore to silently heal stale state @km/tui #task #P3

blocks:: [[@km/tui]]

My reactive cursor recovery fix (commit 791067dd1, refined in 40aacb487) currently fires at Phase 3 of the FIRST user event — which means the user sees a 'Cursor reset: stale selection was outside the current board' warning toast on startup every time the restored workspace happens to have a stale cursor. Better UX: run checkInvariants ONCE after workspace restoration completes, before the first event dispatches, and silently heal any recoverable violations. The toast only fires for genuine runtime violations, not load-time drift.

Implementation plan:
1. In apps/@km/tui/src/state/board-app-store.ts, after restoreWorkspaceFromPersisted returns (or inside it right before returning), build an OpCtx-like view of the restored state and call checkInvariants from ../invariants.ts.
2. For each recoverable violation (cursor-under-root, cursor-visible, cursor-in-walkOrder), reset the pane's cursor to the first visible card under rootId (same logic as the Phase 3 handler in board-app.ts:659-697).
3. Log to km:invariants debug namespace ('load-time recovery: reset cursor from X to Y'). No toast.
4. Leave the runtime Phase 3 recovery in place as a safety net — but expect it to never fire now that loads are clean.

Test: write a regression test that restores a workspace with a deliberately-stale cursor, initializes the store, and verifies the cursor has been healed to a visible card WITHOUT showing a warning toast.

Held for the same reason as @km/tui/inscope-dialog-migration: board-app-store.ts may be edited by the omnibox agent's Phase 7-12 work. Confirm no collisions before landing.