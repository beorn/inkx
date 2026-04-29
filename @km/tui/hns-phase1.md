---
id: "@km/tui/hns-phase1"
aliases:
  - km-tui.hns-phase1
  - km-tui-hns-phase1
created_by: Bjørn Stabell
created_at: 2026-04-08T07:30:53Z
closed_at: 2026-04-08T08:09:24Z
close_reason: "Engine built (21 tests), shadow wired in ReactiveNodeStore.
  Skipped rename+privatize since cutover+purge happening in same session.
  Commits: 35b7d47db, 7c11c80c5."
---

# [x] Phase 1: Engine + Shadow — build reduced signals, wire alongside old sync @km/tui #task #P1 @Bjørn Stabell

Build the reduced signal engine AND wire it as shadow calculator in one phase. No shipping engine without wiring it.

## What to do

1. Build core engine: tree.ancestors/descendants descriptors, .some()/.count()/.reduce() combinators, Symbol brand, store.batch(), TreeAccess interface
2. Build tree.up/down imperative iterators
3. Add cursorDescendant + selectedAncestor as reduced signals
4. Wire batch() alongside existing syncCursor/syncSelected in Board.tsx
5. New implementation runs as shadow — only old path drives UI
6. Add dev-mode assertion: shadow vs old must agree after every batch

### Legacy isolation (prevent drift)

Old sync methods get renamed + privatized so no component can accidentally call them:

\`\`\`ts
class ReactiveNodeStore {
  // NEW public API
  batch(tree: TreeAccess, fn: () => void): void { ... }
  node(id: string): NodeSignals { ... }

  // LEGACY — private, renamed, shadow-only. Removed in km-tui.hns-phase3.
  /** @deprecated REMOVING in km-tui.hns-phase3 — do NOT add callers */
  private _legacySyncCursor(...) { ... }
  private _legacySyncSelected(...) { ... }
}
\`\`\`

Components that currently call nodeStore.syncCursor() get a compile error after this rename — forced to use the new batch() API or be explicitly wired through the shadow comparator.

Board.tsx (the only caller of syncCursor/syncSelected/syncEdit) calls both paths:
\`\`\`ts
// Board.tsx — shadow comparison
nodeStore.batch(tree, () => { /* new path */ })
nodeStore._legacySyncCursor(...)  // shadow, not driving UI
assertParity(newSignals, oldSignals)  // dev-mode only
\`\`\`

Shadow window is minimal — exists only to verify parity before Phase 2 flips reads. Target: shadow lives for one test suite run, not days.

## Delete
Nothing yet — old sync stays as private shadow, new is public active.

## New tests
- tests/reduced-signals.test.ts — engine unit tests (descriptors, batch, counts, reparent, cleanup)
- tests/shadow-parity.test.ts — differential: old sync vs new reduced signals on same operations

## /complete
\`\`\`bash
bun vitest run apps/km-tui/tests/reduced-signals.test.ts  # must pass
bun vitest run apps/km-tui/tests/shadow-parity.test.ts  # must pass
bun vitest run apps/km-tui/tests/tree-concerns.test.ts  # prototype tests still pass
bun run test:fast  # all pass with shadow enabled
# Bench: wall time ≤ 110% of Phase 0 baseline

# Legacy isolation verified:
rg 'syncCursor\b' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0 (renamed to _legacySyncCursor)
rg 'syncSelected\b' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null | wc -l  # → 0 (renamed to _legacySyncSelected)
# NOTE: _legacySyncCursor/_legacySyncSelected WILL exist (private, shadow-only) — that's expected.
# They are removed in Phase 3. The grep above verifies no PUBLIC syncCursor/syncSelected calls remain.
rg '_legacySyncCursor' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null  # expected: 2-3 hits (definition + shadow caller in Board.tsx)
rg '_legacySyncSelected' --glob '!.beads' --glob '!vendor' -t ts -c 2>/dev/null  # expected: 2-3 hits (same)
\`\`\`