---
mentions:
  - km
  - Bjørn
id: "@km/infra/test-system"
aliases:
  - "@km/all/test-system"
  - km-all.test-system
  - km-all-test-system
created_by: Bjørn Stabell
created_at: 2026-04-09T05:28:36Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [/] Strictest — km's testing system @km/all #epic @Bjørn Stabell #P1 ^test-system

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

## Update 2026-05-07 — divergence has widened, verify-before-rebase

Sanity check on the branch state, 9 days after the last touch:

- Worktree `/Users/beorn/Code/pim/km-test-system-rebase` still on local branch `feat/test-system`, tip `0f73c16bc` (the 29-commit squash). Working tree clean, no in-flight edits.
- Origin/main has moved another ~2 days of cross-cutting work since 2026-04-28. Counts now: **1 commit ahead, 2035 commits behind origin/main**.
- Cross-cutting refactors that landed on main *since* the table above (each will collide with the squash):
  - `ChatEntryDisclosure` → `EntryDisclosure` rename (a5d5fd600 + the commit that introduced EntryDisclosure.tsx)
  - The 88-file no-non-null-assertion lint sweep (cffb9d418)
  - The bead schema migration that landed alongside the lint sweep (cffb9d418)
  - Codex km-tui polish (e65f7ad5b)
  - Bd retirement / km bd surface cutover (the new bead surface in `apps/km-cli/src/commands/`)
  - Sigil-board / @agent dispatch model + 60+ archive moves under @km/archive/
- p4-suites + p6-api are now both **closed** in the bead tree, but their *code* lives only on the unmerged branch. So either main absorbed equivalents through other paths (very plausible — the bd cutover landed many test changes), or the closures were aspirational while the rebase was paused.

**Before any rebase attempt, run the equivalence audit:**

```bash
# Did main absorb the substance via other paths?
git log origin/main --grep -E "testEnv|createTestApp|fast-check|plateau|MECE|driverTest|expectScreen" \
  --since "2026-04-28" --oneline | head -50

# Diff the squash's surface against main per-file
git diff --stat $(git merge-base origin/main 0f73c16bc)..0f73c16bc | sort -k3 -n -r | head -40

# For each touched file, check if main also touched it post-2026-04-28
git diff --name-only $(git merge-base origin/main 0f73c16bc)..0f73c16bc \
  | xargs -I{} sh -c 'echo "{} : $(git log origin/main --since 2026-04-28 --oneline -- {} | wc -l)"' \
  | awk '$3 > 0'
```

If main has independently absorbed >50% of the substance, **do not rebase** — the squash is now duplicative noise. Cherry-pick the unique residue (Option C variant from above) and abandon the branch.

If main has **not** absorbed the substance, the rebase is still worth doing but is now closer to ~6-8 hrs of careful porting given how the surface has shifted. Use a fresh pool slot, not the existing 9-day-old worktree (its submodule pointers are stale and `direnv` state is from a prior bun version).

**Recommended next step:** spawn a focused agent in a pool slot that runs the equivalence audit and reports: (a) percent of squash substance absorbed by main; (b) the residue list (commits / file-changes uniquely on the branch); (c) recommendation A/B/C with effort estimate. Do not attempt the rebase in the same agent — keep the audit separate so the call is informed before tools start reflowing 1500+ files.

**Holding state**: branch + worktree retained pending audit. Do not `git worktree remove` — the squash is the analysis artifact. If the audit decides "main absorbed it," THEN remove the worktree and delete `feat/test-system` (origin/feat/test-system can stay as historical reference).

## Update 2026-05-07 — links to current main tip

For audit context, recent main commits that touched test surface (informational, not exhaustive):

- `cffb9d418` chore: lint sweep + bead schema migration (725 files)
- `889b7cb34` feat(silvercode): cmd-hover on tool rows
- `b508319fa` feat(silvercode): AskUserQuestion replay rendering
- `a5d5fd600` fix(silvercode): complete ChatEntryDisclosure→EntryDisclosure rename

The lint sweep alone touched 88 .ts/.tsx files and the bead schema migration probably touched 100s more. Conflict surface against the squash is much wider than the 2026-04-28 table suggests.

