---
aliases:
  - @km/infra/test-system.real-vault-golden-snapshot
  - @km/infra/test-system-real-vault-golden-snapshot
created_at: 2026-05-05T21:23:12.390Z
---

# [x] Real-vault golden cell-snapshot CI step (catches regressions visible in user env) #feature #P2

## Resolution 2026-05-05 (wt6)

Landed in commit `b6ce31c3b` on branch `wt6` (origin/wt6). Lead session integrates.

Shipped:

- New test `apps/km-tui/tests/golden-vault-frame.slow.spec.ts` mounts BoardApp through `testBoard` at the full-app default geometry (360 × 120) against a checked-in fixture vault.
- New fixture `apps/km-tui/tests/fixtures/golden-vault/` — 5 markdown files (Inbox / Active / Blocked / Review / Done) with ~30 list-item cards total. Mixed inline content: links, hashtags, sigil tags, priorities, code spans, mentions, wikilinks. Column order pinned via a `.km/sibling-order.json` written from `beforeAll` (the source-of-truth lives in the test file's `COLUMN_ORDER` constant; `.km/` is in the repo-wide gitignore).
- Cell-level golden snapshot at `apps/km-tui/tests/__snapshots__/golden-vault-frame.golden.txt` — 390 lines, ~16 KB. Format: `<dims>` header, plain text rows, then per-row style runs (`R<row>  c<a>..c<b> fg=<rgb> bg=<rgb> attr=<flags>`). Rows with no non-default styling are omitted. Diff smoke-tested by mutating a card title — diff is plain-text and shows the changed line plus the column-extent shift in the style runs immediately under it.
- Asserted via `toMatchFileSnapshot`. Updates require an explicit `--update` flag.
- Helper extension: `tests/helpers/real-board.ts` gains a `parseDeferred?: boolean` option (default off) so the snapshot captures parsed card content instead of the production discoverOnly skeleton placeholders. Uses the in-process sequential parse path for deterministic ordering.
- Drive-by fix in the same helper: `countPaintedCells` now reads flattened `FrameCell` attributes (`cell.bold`, etc.) instead of the obsolete nested `cell.attrs` shape. Was failing tsc in this worktree.
- Doc updated in `apps/km-tui/tests/CLAUDE.md` under "Snapshot Testing (Layout Regression)" — purpose, slow-project placement, update workflow, masking rationale, file pointers.

Determinism guarantees:

- `state.db*` wiped in `beforeAll`; every CI run is a cold load.
- ULIDs (node IDs) and `created_at`/`updated_at` never reach a painted cell — they live in the DB only.
- Trailing whitespace trimmed in text rows; style runs preserve column positions exactly so a one-column shift still surfaces.
- Test runs ~300 ms in the slow vitest project, excluded from `test:fast`, included in `test:slow` and `test:ci`. Verified deterministic across three consecutive runs.

Acceptance from the original spec:

- [x] new test `apps/km-tui/tests/golden-vault-frame.slow.spec.ts`
- [x] runs in test:slow project (excluded from test:fast for speed)
- [x] captures full 360 × 120 cell grid post-render
- [x] diff output shows changed cells with neighboring context (text rows + per-row style runs)
- [x] documented in km test docs (`apps/km-tui/tests/CLAUDE.md`) as the canonical 'visible regression' check

## Original brief

Even with the testBoard harness fix and no-stale-residue invariant, we have no CI step that asserts 'the kanban view at user dimensions, on the user's actual vault, renders the same cells today as it did yesterday.' Without it, any rendering regression that doesn't trip an existing invariant ships unnoticed (today's incident: 13 columns of stale paint in production for an unknown duration).

Proposal: a slow CI step that runs km-tui against a checked-in test-vault (or a synthetic vault built to match real-vault density), at 360x120, captures the rendered frame as a cell-level snapshot (text + bg/fg per cell), and asserts byte-identical match against golden. Auto-update on intentional change; fail loudly on drift.

Reuse existing snapshot infrastructure (vitest snapshots) but at cell granularity, not text. For dependent fields (timestamps, transient UI state) use placeholder masking.

Acceptance:

- new test apps/km-tui/tests/golden-vault-frame.slow.spec.ts (or similar)
- runs in test:slow project (excluded from test:fast for speed)
- captures full 360x120 cell grid post-render
- diff output shows changed cells with neighboring context for human review
- documented in km CLAUDE.md as the canonical 'visible regression' check

