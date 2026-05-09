# `km view` hangs on zoom out (Ctrl-C dead) #bug #P0

## Symptom

User-reported 2026-05-08, two reports:
1. After 21fefe351 (km-view-tree-sync-in-getter-hang fix landed): `bun km view <vault>` "still crashes when zoom out" (paraphrased).
2. Clarified: it's not a crash — it's a HANG. After pressing `Z` (zoom-out), the process freezes. **Ctrl-C is ineffective** — confirms the JS event loop is fully blocked by synchronous work, NOT a crash with a stack trace.

Reassigned to @agent/4 (verified the prior hang fix; has TTY repro infrastructure).

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

The Ctrl-C-dead nature points to a synchronous infinite loop. Three top suspects in the cursor-occurrence-path WIP:

1. **`findDescendantPath` in `apps/km-tui/src/board/board-app.ts:43`** (HOTTEST suspect — chief verified by inspection during triage). Recursive DFS over `tree.children(id)` with **NO cycle detection and NO depth bound**. After zoom-out, the visible lens may include embedded children that resolve back to an ancestor (e.g. `![[parent]]` inside a child renders as a child whose tree.children(...) returns the ancestor's children — cycle). Each recursion call loops the same subtree forever. Quick fix candidate: thread a `visited: Set<string>` through the inner recursion. Verify FIRST that this is actually the source by reproducing with a vault that contains the cycle pattern.
2. **`findVisibleCursorReplacement` in `state/board-app-store.ts:1936`** — `while (current?.parent_id)` walk. Latent risk if any node's `parent_id` chain forms a cycle (rare but possible after malformed sync state). Already-bounded versions exist in adjacent walks (`findVisibleAncestor` and `isVisibleInLens` use `depth < 100` guard); this one doesn't.
3. **`checkRenderInvariants` in `apps/km-tui/src/render-invariants.ts`** — fires after every `press()`. If post-zoom-out the cursor briefly violates an invariant AND the recovery code re-presses, infinite retry. Less likely (the invariant function throws cleanly on violation), but worth ruling out.

Prior in-flight code that landed in this session (`21fefe351`) ruled out the `tree.sync` getter call as the recurring source. This is a separate hang in the same WIP feature surface.

## Acceptance

- Failing test FIRST (TDD): zoom out from a deep cursor location in a real vault triggers the crash. Test must be added to `apps/km-tui/tests/` and reproduce against the user's reported sequence.
- Fix must keep the render invariants intact — don't relax the gate to silence the symptom; the invariant is correct, the cursor migration is wrong.
- `bun km view ~vault` zoom-out works for at least 10 sequential zoom-out cycles without crash.
- Linked tracking: `@km/all/km-view-tree-sync-in-getter-hang` (already closed; this is a separate regression in the same WIP).

## Provenance

Reported by user, 2026-05-08, after `git pull origin main` brought 21fefe351. Filed by chief. Initially assigned to agent1 (@agent/2) — reassigned to **agent4 (@agent/4)** at user request after the Ctrl-C-dead clarification. agent4 owns the verification infrastructure that confirmed the prior 21fefe351 fix; right person for this one.
