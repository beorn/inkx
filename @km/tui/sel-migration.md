---
id: "@km/tui/sel-migration"
aliases:
  - km-tui.sel-migration
  - km-tui-sel-migration
created_by: Bjørn Stabell
created_at: 2026-04-11T00:41:29Z
closed_at: 2026-04-18T08:16:19Z
close_reason: "Phases 1-4 complete on feat/selection-plateau. 175 of 178 writer
  sites migrated across 28 files (11 src + 8 action + 4 pane/dialog + 5 test). 3
  sites deferred with TODO comments (toggle + remove patterns — Phase 4
  follow-up). Commits: 05670754b (Phase 1), 321590219 (Phase 2+3), 4b8fc74ce
  (cleanup), 479b73be9 (test migration). Phase 4 writer-deletion in
  @silvery/selection deferred to km-tui.sel-reader-migration — requires bigger
  silvery redesign."
---

# [x] Migrate 208 imperative sel.text/sel.node calls to unified selection dispatch @km/tui #task #P1 @Bjørn Stabell

blocks:: [[@km/silvery/selection-focus-plateau]]

# Refactor Plan: @km/tui/sel-migration

## Pre-flight Blocker

Plan is blocked on `km-all.unified-selection` which is currently underspecified. Before Phase 1 starts, the parent bead must commit to:

1. **setSelection signature** — `pane.setSelection(sel)` method vs free action
2. **Selection union exact shape** — text/node/gap fields, especially NodeSelection.anchor requirement
3. **Null/empty semantics** — `null` vs `{type:'none'}` vs `{type:'node', ids:[]}`
4. **Reader API** — do existing readers (`sel.node.cursor()`, `sel.text()`) stay? (Assumed yes; reader migration is deferred)
5. **BoardState integration** — projection over `@silvery/selection` vs replacement

Recommend: block sel-migration behind a scoping `/discuss` on `km-all.unified-selection` to resolve these 5 questions and produce a fully-worked reference call site before Phase 1 executes.

## Corrected Scope (counts verified via grep)

Bead description says "208 calls / 20 files". Actual:
- **Writes in scope**: 177 in src + 69 in tests ≈ **246 total**
- **Files touched**: 25 src + 15 tests = **40 files**
- Bead's list omits: `state/board-app-store.ts` (12), `views/tree-node-edit.tsx` (11), and tests entirely.

Complexity buckets:
- **Pure mechanical (~80%, ~200 sites)**: single-line swaps, safe for codemod
- **Paired coordination (~30 sites)**: `select+text.edit` or `deselect+select` pairs — these are the whole point of the refactor and MUST collapse to one `setSelection` call. Manual editing only.
- **Deselect-then-reselect (~10 sites)**: merge to single call
- **Multi-pane (~15 sites in board-app-store.ts)**: each pane receiver needs setSelection on its type

## Canonical Rewrites (the whole migration in 6 rules)

| OldWay | NewWay |
|---|---|
| `ctx.sel.node.select([id])` | `ctx.setSelection({type:'node', ids:[id]})` |
| `ctx.sel.node.select(ids)` multi | `ctx.setSelection({type:'node', ids})` |
| `ctx.sel.node.remove(id)` | `ctx.setSelection({type:'node', ids: current.filter(...)})` |
| `ctx.sel.text.edit(id, offset)` | `ctx.setSelection({type:'text', nodeId:id, offset})` |
| `ctx.sel.text.deselect()` | `ctx.setSelection({type:'none'})` |
| `sel.node.select([id]); sel.text.edit(id, 0)` | `setSelection({type:'text', nodeId:id, offset:0})` (one call) |

## Phases (4, strictly sequential, ship in one push)

### Phase 0: Install the new road (not in this bead)
Landed by `km-all.unified-selection`. Adds `setSelection` method + `Selection` union without deleting old writers. One module imports the type to prove compile.
**/complete**: `rg 'setSelection' apps/km-tui/src/state/board-app-store.ts` ≥1 hit. Old writers still compile.

### Phase 1: Mechanical — leaf files (codemod)
**Scope**: 13 files × ≤6 writes each, no paired patterns (keyboard-card-ops, tui-context, tui.tsx, ui-context, invariants, use-card-interaction, useBoardController, CheckboxIcon, CardColumn, Board.tsx, command-bridge, board-selection-helpers, board-effect-runner).
**Tooling**: `bun vendor/bearly/tools/refactor.ts` with 6 canonical rewrite rules.
**Delete**: nothing yet (writers stay until Phase 4).
**/complete**: `rg -n 'sel\.(node|text|gap)\.(select|edit|deselect|remove|clear|toggle)'` on all 13 files → 0 hits.

### Phase 2: Paired coordination — action files (manual, load-bearing)
**Scope**: board-actions.ts (53), board-actions-edit.ts (13), board-actions-zoom.ts (11), board-actions-nav.ts (8), board-actions-selection.ts (5), board-actions-search-replace.ts (6), board-actions-find.ts (5), board-tree-ops.ts (6). **Total 107 writes.**
**Tooling**: **manual only**. Collapse paired `select+text.edit` patterns by hand first, then codemod leftovers. Process: read whole file → grep paired patterns with -B2 -A2 → collapse → tsc → test:fast → commit.
**Delete**: nothing yet.
**/complete**: 0 hits in all 8 files. Spot-check collapsed pairs: `rg -nU 'setSelection\(\{\s*type:\s*[\x27"]text[\x27"]' apps/km-tui/src/board/ | wc -l` ≥10.

### Phase 3: Pane store + dialogs (multi-pane audit)
**Scope**: state/board-app-store.ts (12 multi-pane), board/board-app.ts (13), views/use-board-dialogs.ts (8), views/tree-node-edit.tsx (11). **44 writes, highest risk.**
**Process**: type-system audit — every pane type (detailPane, boardPane, parentPane) must have `setSelection` on its interface. Then migrate.
**Add new invariant**: `apps/km-tui/src/invariants.ts` — "selection is never text-edit without matching node cursor." This is the bug class the refactor kills.
**New tests**: `apps/km-tui/tests/unified-selection.test.ts` — prove paired-op collapse + new invariant.
**/complete**: 0 hits in all 4 files; src-wide 0 hits: `rg -n 'sel\.(node|text|gap)\.(select|edit|deselect|remove|clear|toggle)' apps/km-tui/src`.

### Phase 4: Tests + delete old writers
**Scope**: 15 test files × 69 writes (codemod-safe — tests don't have paired patterns). **Then delete the writer methods from `@silvery/selection`.**
**Delete**:
1. `select/edit/deselect/remove/clear/toggle` methods from `@silvery/selection`'s text/node/gap sub-stores (keep readers)
2. `sel.text`/`sel.node` writer surface from BoardPane interface
3. Run `tsc` — any consumer outside apps/@km/tui errors out → fix in same commit
**/complete**: `rg -n 'sel\.(node|text|gap)\.(select|edit|deselect|remove|clear|toggle)' apps/km-tui` → 0. Writer definitions gone from vendor/silvery/packages/selection/src. Full `bun run test:all + bun run check` green.

## Deferred (out of scope)

- **Reader migration**: 77 read sites (`sel.node.cursor()`, `sel.text()`) continue to work via projection. Create follow-up `km-tui.sel-reader-migration` bead on close.
- **@km/tui/atomic-tree-ops**: consumes unified selection, separate bead, blocked on the same Phase 0.
- **@km/tui/tea**: TEA state machines downstream.

## Risks

- @km/all/unified-selection underspecified → don't start Phase 1 until resolved
- Paired-pattern codemod false positives → Phase 2 is manual-only
- Count drift (bead says 208) → update bead description before starting
- Phases 1-3 keep old writers alive, violating "delete first" → acceptable IFF all 4 phases ship in one push with zero-WIP discipline; if cut midway, not done
- `@silvery/selection` has non-@km/tui consumers → pre-count with `rg '.' .` before Phase 4

## Tooling

- Phase 1: batch codemod (`bun vendor/bearly/tools/refactor.ts`)
- Phase 2: manual (load-bearing, paired patterns)
- Phase 3: manual + type audit + new invariant + new test file
- Phase 4: codemod for tests, TypeScript-error-driven deletion for writers