---
id: "@km/silvery/outline-incremental-clear"
aliases:
  - km-silvery.outline-incremental-clear
  - km-silvery-outline-incremental-clear
created_by: claude:da9990c5
created_at: 2026-04-28T20:42:37Z
closed_at: 2026-04-28T21:09:56Z
close_reason: >-
  Fixed in silvery commit 21c08bff (km submodule bump b62aacafc).


  Root cause: cross-frame outline-snapshot carrier (`RenderPostState`) lived on
  per-`createAg` `_postState`, but renderer.ts and scheduler.ts create a fresh
  Ag per frame — so the carrier was empty every frame, `clearPreviousOutlines`
  found no prior snapshots, and stale outline pixels from `prevBuffer.clone()`
  leaked through. Same shape as km-yej6 (cross-frame state on a transient
  object).


  Fix: expose `postState` on `AgRenderOptions` / `AgRenderResult` so
  per-frame-Ag callers can hold the carrier at instance level alongside
  `prevBuffer`. Renderer / scheduler each track `postState`, pass it via
  `ag.render({ prevBuffer, postState })`, and reset it alongside `prevBuffer` on
  every invalidation (resize / clear / pause / resume). Fresh STRICT renders use
  `ag.render({ fresh: true })` which substitutes a throw-away empty carrier.


  Tests:

  - tests/features/outline-incremental.test.tsx (6 tests): all pass.

  - tests/features/outline-postate-cleanup.test.tsx (2 tests): all pass.

  - tests/features/outline-postate-carrier-renderer.test.tsx (NEW, 3 regression
  tests for the parent-edge geometry + 20 toggle cycles + sibling outline
  migration): all pass — and confirmed they FAIL on the f9be40d0 baseline.

  - Full silvery features suite under SILVERY_STRICT=1: 26 baseline failures →
  18 with fix (exact 8-test delta, no new regressions). The remaining 18 are
  pre-existing baseline failures unrelated to outlines (useAgNode,
  layout-dirty-regression, softwrap-selection-fragments, decoration-rects,
  anchor-ref, cursor-invariants, focus-as-output, selection-fragments — all
  touching the signal-allocation / reactive-system surface).

  - km-tui suite: 2534 passed / 39 skipped — same as baseline.


  /complete criteria:

  - [x] Both test files pass under SILVERY_STRICT=1

  - [x] Regression test pins parent-outline + dirty-child shape
  (outline-postate-carrier-renderer.test.tsx)

  - [x] No new STRICT mismatches in km-tui suite (2534 still 2534)

  - [x] Documented incremental-cascade rule in
  vendor/silvery/packages/ag-term/src/pipeline/CLAUDE.md (decoration phase
  section, "Carrier ownership — load-bearing for per-frame-Ag callers")


  Knowledge file updated: .claude/agents/expert/silvery-knowledge.md (new entry
  at top, including the worktree node_modules symlink trap that cost ~30 minutes
  mid-session).


  Side note from this session: encountered a worktree node_modules trap where
  `bun install` had silently created `node_modules` as a symlink to the main km
  checkout's node_modules instead of a real directory. Effect: vitest loaded
  baseline files from main, debug logs added in the worktree never fired, the
  "fix" appeared to do nothing. Diagnostic: `readlink -f
  node_modules/silvery/packages/ag-term/src/renderer.ts` — if real path is in
  main km, recreate node_modules in the worktree. Documented in
  silvery-knowledge.md.
started_at: 2026-04-28T20:46:09Z
owner: bjorn@stabell.org
assignee: claude:da9990c5
dependencies:
  - issue_id: km-silvery.outline-incremental-clear
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-28T13:42:55Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] Incremental fast-path doesn't clear outline pixels outside parent rect when only child dirty signal is set @km/silvery #bug #P0 @claude:da9990c5

blocks:: [[@km/silvery]]

Surfaced by @km/_orphan/yej6 (column-resize STRICT mismatch) silvery agent run.

## Symptom

Two test files fail with the same root cause when running silvery's STRICT vs fresh comparison:

- vendor/silvery/tests/features/outline-incremental.test.tsx (6 tests)
- vendor/silvery/tests/features/outline-postate-cleanup.test.tsx (2 tests)

8 total failures. Fail under HEAD; orthogonal to the column-resize fix (verified — same failures with and without @km/_orphan/yej6 changes applied).

## Root cause (preliminary)

Incremental render fast-path doesn't clear outline pixels OUTSIDE a parent rect when the only dirty signal is on the child node. Fresh render correctly clears them; incremental skips the clear because the parent's rect didn't change. Net: stale outline glyphs remain in cells the parent USED to paint outline borders into, then a child mutation re-runs only the child's paint, leaving the parent's prior pixels orphaned.

This is the textbook 'incremental ≠ fresh' shape — but localized to outline rendering specifically.

## Why P0

This is the SECOND class of incremental-vs-fresh STRICT mismatch surfaced this week (the first was @km/_orphan/yej6's resize-multipass case). Silent pixel corruption in a rendering library is a P0-grade bug. STRICT mode catches it now; without STRICT it would ship unnoticed and degrade visual fidelity in long-running sessions where outline parents update less often than children.

## Reproduction

  cd /Users/beorn/Code/pim/km
  bun vitest run vendor/silvery/tests/features/outline-incremental.test.tsx
  bun vitest run vendor/silvery/tests/features/outline-postate-cleanup.test.tsx

Both fail with STRICT mismatch diagnostics naming the orphaned pixels.

## Investigation start

- vendor/silvery/packages/ag-term/src/pipeline/render-phase.ts — outline render path; trace the dirty-flag propagation from child node up to parent's outline-bearing cells
- vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts — diff path; check whether stale pixels are being preserved across the child-only dirty cycle
- The test fixtures show the exact diff — start there

## /complete criteria

- [ ] Both test files pass under SILVERY_STRICT=1
- [ ] Regression test pins the specific shape (parent renders outline, child mutates, parent's outline cells outside child rect remain correct)
- [ ] No new STRICT mismatches in @km/tui suite (2534 baseline)
- [ ] Document the incremental-cascade rule for outline rendering in vendor/silvery/packages/ag-term/src/pipeline/CLAUDE.md