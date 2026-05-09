# `km view` crashes on zoom out #bug #P0

## Symptom

User-reported 2026-05-08 (chief) after 21fefe351 (km-view-tree-sync-in-getter-hang fix landed): `bun km view <vault>` still crashes when invoking zoom-out (`Z` keybinding by default).

## What we know

- Regression observed AFTER the cursor-occurrence-path WIP landed (e58f0fab4) — the WIP touched `apps/km-tui/src/board/board-app.ts`, `board-actions-nav.ts`, `board-actions-edit.ts`, `state/board-app-store.ts`, `driver.ts`, `tui.tsx`, `workspace-persist.ts`, plus the new `render-invariants.ts` gate. Any of these are suspect — particularly the cursor-replacement / occurrence-hint paths or the new `checkRenderInvariants` post-press assertion.
- The hang fix at 21fefe351 only removed the in-getter `tree.sync` call. It did NOT touch zoom logic. So this is a separate regression.
- Zoom-out path: `apps/km-tui/src/board/board-actions-edit.ts` has `handleZoomOut` (or related). `packages/km-board/src/board-reducer.ts` defines the ZOOM_OUT effect. `apps/km-tui/src/state/board-app-store.ts` handles the dispatch.

## Reproduction (needs user input)

User needs to paste:
1. The exact key sequence that triggers the crash (e.g., `Z`, `<C-o>`, etc.).
2. The crash output (stderr / `RenderInvariantError` message / stack trace).
3. The vault path (so we know if it's vault-shape-dependent).
4. Approximate cursor location when the crash fires (root? deeply zoomed in?).

Suggested capture command for the user:
```bash
DEBUG=km:*,silvery:* DEBUG_LOG=/tmp/km-zoom-crash.log bun km view <vault> 2>&1 | tee /tmp/km-zoom-crash.stderr
# Then reproduce the crash; paste the last ~50 lines of both files into this bead.
```

## Suspect surfaces (TDD: reproduce first)

- `checkRenderInvariants` in `apps/km-tui/src/render-invariants.ts` — fires after every `press()`. The new invariants are: exactly-one-cursor + cursor-has-bbox + cursor-x-y-in-viewport. Zoom-out changes the viewport and visible tree simultaneously; the cursor may briefly be invalid mid-transition.
- `findVisibleCursorReplacement` in `state/board-app-store.ts:1917` — runs on lens changes, walks `repo.getNode().parent_id` chain. Zoom-out changes the lens shape; if the previous cursor's ancestor chain doesn't include the new root, the replacement may return null → cursor=null → downstream assumes non-null.
- `cursorOccurrenceHint` cleanup — the hint isn't cleared on zoom-out. A stale hint pointing at a node outside the new zoom-root could trip the `findDescendantPath` walk in `getStateBoard`.

## Acceptance

- Failing test FIRST (TDD): zoom out from a deep cursor location in a real vault triggers the crash. Test must be added to `apps/km-tui/tests/` and reproduce against the user's reported sequence.
- Fix must keep the render invariants intact — don't relax the gate to silence the symptom; the invariant is correct, the cursor migration is wrong.
- `bun km view ~vault` zoom-out works for at least 10 sequential zoom-out cycles without crash.
- Linked tracking: `@km/all/km-view-tree-sync-in-getter-hang` (already closed; this is a separate regression in the same WIP).

## Provenance

Reported by user, 2026-05-08, after `git pull origin main` brought 21fefe351. Filed by chief, assigned to agent1 in @agent/2 slot.
