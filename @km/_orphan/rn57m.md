---
id: "@km/_orphan/rn57m"
aliases:
  - km-rn57m
created_by: claude:a1a0e667
created_at: 2026-04-20T21:27:22Z
closed_at: 2026-04-20T22:21:54Z
close_reason: "Shipped silvery fix 418bb5ad bumped via km 307b9ab53. Kitty stdio
  probe (200ms) skipped when caller passes caps.kittyKeyboard=true. Verified:
  initApp 411.8ms → 206.8ms (~49% reduction) on real-TTY 552k-node vault repro.
  Remaining 143ms React-mount commit is separate architectural followup
  (provider stack), not in scope here."
---

# [x] Cold-start 16s event-loop block — (startup:react-mount), 2 renders, layout=26ms @km/_orphan #bug #P1

Reproduced 544ms-1577ms block on warm-cache run; user reports 16s on cold-cache.

INSTRUMENTATION DONE
- Real TTY repro via mcp__tty__start with /Users/beorn/Bear/Vault (552352 nodes).
- Heartbeat fires consistently at 'startup:react-mount':
  - Run 1 (DEBUG=km:tui:render): event loop blocked for 1577ms — render: layout=97ms (total=97ms) — (2 renders)
  - Run 2 (no DEBUG): event loop blocked for 544ms — render: layout=17ms (total=17ms) — (2 renders)
- Pipeline timing accounts for 17-97ms; the remaining 500-1500ms is JS work OUTSIDE pipeline.
- profile-startup.ts (which doesn't exercise the full Provider stack or workspace restore) finishes React mount in 84ms — confirming the bottleneck is in the production-only path.

STRONGEST HYPOTHESIS — setSelection descendant expansion
- apps/@km/tui/src/state/board-app-store.ts:1658 — alien-signals effect()
  * fires synchronously on registration (during react-mount, when nodeStore is registered to pane)
  * calls nodeStore.setSelection(selectedSet, repo)
  * apps/@km/tui/src/state/reactive.ts:194 setSelection → expandSelectionWithDescendants → collectDescendantsInto
  * recursively walks every descendant of every selected node via repo.getChildren (uncached on cold start)
- If the restored workspace selection includes a high-level node, this recurses through tens of thousands of descendants.

OTHER CANDIDATES (less likely, not yet ruled in/out)
- ag-term/runtime/create-app.tsx:656 await ensureLayoutEngine() — flexily WASM load (not synchronous JS, but could block on cold start)
- ag-term/runtime/create-app.tsx:1542 detectKittyFromStdio — ANSI roundtrip after first render; would block but only if probe slow
- syncManager.start() runs in WORKER thread but cross-thread message flood (worker: ignoredFn called for 18213 files visible in log) could saturate main-thread message queue
- React mount of full BoardApp tree with all providers (ThemeProvider, RepoProvider, StoreProvider, InputLayerProvider, ServicesProvider) — many useMemo/useEffect bodies in useBoardController, but most work O(visible_columns) not O(repo_nodes)

NEXT STEPS
1. Add console.time/console.timeEnd around the alien-signals effect at board-app-store.ts:1658 — log the size of selectedSet AND the time the setSelection call takes
2. Add a depth/cap guard to expandSelectionWithDescendants — if selectedSet.size > ~100, log a warning and abort walk OR cache by node version
3. If hypothesis confirmed: short-circuit setSelection when selectedSet is empty or only the cursor (which is the common case at startup)
4. Verify fix: re-run TTY startup, expect WARN to disappear or shrink to <50ms

CONSTRAINTS
- Pipeline files (vendor/silvery/packages/ag-term/src/pipeline/*.ts) are off-limits without silvery agent
- backdrop agent has WIP in vendor/silvery/packages/ag-term/src/pipeline/backdrop/index.ts (do not touch)
- migration agent is renaming tokens in vendor/silvery/packages/ag-react — confine edits to apps/@km/tui/

PRIOR ART (recall)
- 'Performance Optimization Lessons' (docs/lessons/performance.md) — the same pattern (death by descendant walk) was the root cause of the 60s→<1s name-index fix and the 10s→0 countDescendantsAtDepth early-exit
- Prior session 2 days ago landed phase-aware heartbeat (which is why phase=react-mount is now visible)