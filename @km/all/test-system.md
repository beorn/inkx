---
mentions:
  - km
  - Bjørn
id: "@km/all/test-system"
aliases:
  - km-all.test-system
  - km-all-test-system
created_by: Bjørn Stabell
created_at: 2026-04-09T05:28:36Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [/] Strictest — km's testing system @km/all #epic #P0 @Bjørn Stabell

## Strictest — km's Testing System

**Status (2026-04-28)**: feat/test-system branch is 30 commits ahead of main, but main has diverged with substantive work that conflicts with the consolidations on the branch. **Integration is the current blocker, not feature completion.**

## Philosophy

Four-tier assertion hierarchy: invariants > properties > typed assertions > snapshots.
MECE principle: each behavior tested at exactly one layer, no gaps, no overlaps.

## Branch state (feat/test-system @ ae63da93b)

### What's shipped on the branch (29 commits)

**Phase 3 — testEnv removed from TestApp**

- driver removed from TestApp interface (8f26c465a)
- testEnv → createTestApp/createDriverTest split

**Phase 4 — Property tier**

- fast-check property-based tests (ec349e9ef)
- Plateau enforcement: 4 rules in `bun fix` gate (ebfc61c8a)
- Curated `.spec.ts` flagship tier (014bb88b4, 9cbcbdc48)

**Phase 5 — MECE consolidation**

- .test/.spec pair merges across visual, card, detail, invariants, persistence (99db85947, 342b58190, 8c0198eaa)
- Major consolidations: omnibox, windowing, view-modes (3cf2d097f)
- Absorbs: vd-filter, board.test, zoom-garble-repro (508091090, 7da2913fe, ec349e9ef)

**Phase 6 — TestApp API refinement**

- Locator strictness + test.extend fixture (2cab18fd1)
- Structured UI-tree snapshot API (df3bf7446)
- Default `createTestApp()` minimal board (c9d2b6d5d)
- `termless()` async variant — dual sync/async backends (d297cf244)

**Bonus features (not pure test infra)**

- Omnibox SigilSpec registry (20ada24b3)
- @km/storage `getAllNodes` on Repo interface
- BoardView dimColor → $muted tokens (4085dd6a4)
- Bench path migration after tests/ → bench/ (ae63da93b)

### Plateau-enforcement child closed ✓

- @km/all/test-system/plateau-enforcement (P1) — completed on branch

## Rebase blocker (the actual remaining work)

Main has moved on with substantive cross-cutting refactors that conflict with the branch's consolidations:

| Main's change                                         | Commits                                               | Conflicts with branch                                               |
| ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Sterling token rename ($bg-selected, $fg-muted, etc.) | 1d886ad2a, a82854dc3, 2b6c60fcc, aee9e0f0b            | Tests deleted by Phase 5 still get edited on main                   |
| app.expectScreen → expect(app).toContainText          | 3568fb28a                                             | Touches layout-bugs, vd-filter, visual (all consolidated on branch) |
| Edge-based horizontal scroll fix                      | a05888b8e                                             | scroll-and-cursor (consolidated)                                    |
| TEA Phase 6 omnibox refactor                          | 88a59ba5c, c5c41a56d                                  | unified-omnibox-integration (consolidated)                          |
| TypeScript error sweep (210 → 0)                      | aee9e0f0b                                             | helpers/test-app.ts, matchers.ts                                    |
| Misc test/component fixes                             | 51017489e, ee4d67c7f, 0ce906d30, 966618404, 75cd83fd9 | Various                                                             |

## Remaining work (after integration)

### @km/all/test-pro-findings (P1, OPEN)

17-item Pro review scoreboard — semantic model, differential tests, generated sequences, matchers. Untouched.

### @km/all/test-system/p4-invariants (P2, OPEN)

- Content stability invariant (after every structural action, verify text unchanged when no mutation occurred). Cost ~2ms/action.
- Border integrity invariant at strict-2 only. Cost ~5ms/check.
- withStore reason-tag migration for 193 callsites.

### @km/all/test-system/p5-mece (P2, OPEN)

- Finish ~101 → ~55-60 files.
- Blocker: board-reducer.test.ts and view-navigation.test.ts can't move to @km/_orphan/board until source moves first.

### @km/all/test-system/p6-api (P2, OPEN)

6 remaining items: shrink TestApp surface, command()/press() distinction, card(title)→node(id) migration, vitest test.extend for typed fixtures, plus 2 more.

## Integration paths (decision required)

**Option A — Careful port rebase** (~3-4 hrs)

- For each UD/UU conflict: read main's change to deleted file, apply equivalent change to consolidation target on branch.
- Result: linear history, all main fixes preserved, all branch work preserved.

**Option B — Merge main into branch** (~30 min)

- Single merge commit, take both sides. Sterling/expectScreen stay where main has them; consolidations stay where branch has them.
- Result: non-linear history, all work preserved.

**Option C — Cherry-pick must-haves** (~1 hr)

- Pick non-test commits onto main: omnibox SigilSpec, getAllNodes, plateau enforcement, locator strictness, tree-snapshot API, default createTestApp().
- Abandon Phase 5 consolidations that conflict (deferred to post-Sterling).
- Result: clean linear history, smaller delta, but loses MECE consolidation work that needs redoing later.

## Branch handle

- Worktree: `/Users/beorn/Code/pim/km-test-system-rebase` (created 2026-04-28, branch local-only at squash commit `0f73c16bc`)
- Origin branch: `origin/feat/test-system @ ae63da93b` (untouched)
- Squash for ease of rebase analysis: `0f73c16bc` (29 commits collapsed)

## npm scope

strictest reserved on npm (0.0.1).

