---
id: "@km/tui/startup-input-freeze"
aliases:
  - km-tui.startup-input-freeze
  - km-tui-startup-input-freeze
created_by: Bjørn Stabell
created_at: 2026-04-15T14:36:36Z
closed_at: 2026-04-15T16:15:19Z
close_reason: "Fixed via commit 5484d34c5. Root cause:
  selection-adapter.walkOrder did a fresh O(visible) DFS on every cursor move
  (@silvery/selection store.select → app.tree.walkOrder). On a 528k-node vault
  that cost 3-5s of main-thread JS per j/k press. Two-part fix: (1) cache
  walkOrder by (lens identity, root) in selection-adapter.ts so subsequent
  selects against the same lens hit cache; (2) schedule a 50ms setTimeout warmup
  in tui.tsx that runs preloadSubtree + forces lens.walkOrder once during
  startup — the 3s walk runs while the user is reading the board, and in-flight
  keypresses queue through naturally. Preserves walkOrder-filter semantics so
  stale IDs still normalize out (embed-symlink + command-contracts tests pass).
  Regression test: apps/km-tui/tests/selection-adapter.test.ts (5 tests).
  Verified on /Users/beorn/Bear/Vault: before, every j press triggered a 3070ms
  main-thread block after 'key j → cursor_down'; after, one 3140ms block tagged
  '(startup)' and all subsequent keys are instant. Verification: bunx tsc
  --noEmit = 6 errors (baseline maintained), bun vitest run apps/km-tui/tests
  packages/km-storage/tests packages/km-commands/tests = 173 files / 4045 tests
  pass / 0 failures."
---

# [x] 2-5s input freeze after app open — arrow keys blocked @km/tui #bug #P1

blocks:: [[@km/session/0415a]]

# Regression — app startup freeze

## Symptom (user dogfood)

> after opening the app now - there is a 2-5s freeze period where i cannot use arrow keys anymore - it didn't use to have that before (before the refactoring)

The app window renders but arrow key navigation is blocked for 2-5 seconds. After the freeze passes, keys work normally. Did not happen before the recent omnibox + keybinding refactoring.

## Likely suspects

1. **Loading gate on input dispatch** — a condition in command-bridge.ts or board-app.ts that blocks arrow key resolution when ui.isLoading / ui.backgroundParsing / watcherStatus.state === "starting" is true.
2. **Schema migration on startup** — the FTS5 migration from tokenchars `[` -> `~` (SCHEMA_VERSION 2 -> 3) triggers a drop-and-rebuild of nodes_fts on first open after upgrade. If the rebuild is synchronous on the main thread, it would block input for 2-5s on vaults with thousands of nodes.
3. **Omnibox render-time projection** — UnifiedOmniboxConnector calls defaultBuildOpCtx + buildKeybindingContextFromOpCtx + commandResultsForOmnibox on every render. If the connector mounts during startup (even though omnibox isn't open), it could churn.
4. **backgroundParsing discoverOnly mode** — deferred file parsing may be gating input.

## Repro

1. Close the app
2. Open `bun km view ~/Bear/Vault`
3. Press arrow keys immediately
4. Observe: no response for 2-5s, then keys start working

## Investigation direction

- Grep for `isLoading`, `backgroundParsing`, `watcherStatus.state === "starting"` in the input dispatch path
- Check if FTS5 schema migration runs on startup and how long it takes
- Check recent commits to command-bridge.ts, board-app.ts, useBoardController
- Time the startup sequence with DEBUG_LOG

## Acceptance

Arrow keys respond within 100ms of the app window appearing.