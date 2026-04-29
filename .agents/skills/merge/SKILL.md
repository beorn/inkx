---
description: "Reduce WIP — converge every in-flight work surface back to origin/main. Worktrees, branches, stashes, claimed-but-stale beads, submodule pointer drift, /loop and /schedule routines. Anytime, optionally scoped."
argument-hint: "[<surface>...] [--dry-run] [--leave <surface>...] [--kill]"
allowed-tools: Bash, Read, AskUserQuestion
benefits-from: [pm, sop]
---

# Merge — Reduce WIP

**Keywords**: merge, converge, settle, integrate, reduce wip, finish, land, ship retained, stop the bleeding

One job: drive every reducible work surface back to `origin/main`-consistent state. After `/merge` succeeds with no `--leave` flags, `git status` is clean, every worktree branch tip equals `origin/main`, every submodule pointer is fetchable from its origin, and zero un-integrated commits exist anywhere on this machine.

Pairs with the worktree-pool standing rule (AGENTS.md "Branches and worktrees"): branches are dead, worktrees-and-merge-back is the lifecycle. `/merge` is the merge-back primitive.

## Modes

| Invocation | Behavior |
|---|---|
| `/merge` | Enumerate WIP. Default first run of session = `--dry-run`; second = action |
| `/merge --dry-run` | Report only. Show count, surface, action that would be taken |
| `/merge wt3 wt5` | Only these surfaces (slot names, branch names, paths) |
| `/merge --leave wt3 feat/spike` | Action everything EXCEPT these. Note them in their bead so `/daily` surfaces tomorrow |
| `/merge --kill` | Also stop active `/loop` / `/schedule` routines |
| `/merge --report` | Same as `--dry-run` (alias) |

## Step 1 — enumerate WIP (always)

```bash
# Surfaces, in this order:
git worktree list --porcelain                       # named worktrees + pool slots
git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'
git stash list
km bd list --status in_progress --assignee "$USER"  # claimed-but-stale check
git submodule foreach 'git rev-parse HEAD'          # vs each submodule's origin/main
git status --porcelain                              # main repo dirty?
ps -ef | grep -E 'Codex.*loop|Codex.*routine' | grep -v grep
```

Build one table:

```
WIP: 7
  surface             tip-sha   ahead/behind   linked bead          state
  ────────────────────────────────────────────────────────────────────────
  wt3                 abc1234   3/0            km-foo.bar           commits to push+integrate
  wt7                 (clean)   0/0            km-wt7 (idle)        slot already released
  km-recall-iter3     0654d0d   2/0            km-tribe.recall      named worktree, push+integrate
  feat/legacy         old111    1/57           (none)               likely stale, ask
  stash@{0}           — — —     —              —                    review or drop
  vendor/bearly       53fc57a   ahead          —                    push submodule pointer
  main (uncommitted)  — — —     2 files        —                    commit-or-discard
```

## Step 2 — drive each surface to integrated

For each row, in priority order (least risky first):

### Submodule pointer drift
```bash
cd vendor/<pkg> && git push origin HEAD:main           # if user-authorized direct push
```
Or open a PR via `gh pr create`. Choose by user's policy for that submodule.

### Pool worktree wtN with commits
```bash
cd .claude/worktrees/wtN
git push origin wtN
cd /Users/beorn/Code/pim/km
git fetch origin wtN
git merge --ff-only origin/wtN || \
  git cherry-pick -X theirs $(git rev-list main..origin/wtN | tac)
git push origin main
# Release the slot
cd .claude/worktrees/wtN
git reset --hard origin/main
git submodule update --recursive
km bd close km-wtN --reason "shipped <SHA>"
```

### Pool worktree wtN with uncommitted changes
Prompt: commit-or-discard. No silent stash. If commit: stage, write a conventional message, then continue with the "with commits" path.

### Named worktree (e.g. `km-recall-iter3`)
Same as pool worktree but no slot to release; instead `git worktree remove` after integrating.

### Local non-main branch
```bash
git push origin <branch>
git fetch origin <branch>
git merge --ff-only origin/<branch> || git cherry-pick ...
git push origin main
git branch -D <branch>
git push origin :<branch>     # delete remote
```

### Stash
Show `git stash show -p stash@{N} | head -40`. Prompt apply / drop. Never auto-apply.

### Main repo uncommitted
Show `git status` + brief `git diff --stat`. Prompt commit-or-discard. Never auto-stash.

### Claimed in-progress beads with no recent commits
"You have km-foo.bar claimed since 5 days ago, no commits attached. Release? [y/N]"
```bash
km bd update <id> --assignee "" --status open
```

### Active /loop or /schedule (only with `--kill`)
List them, prompt per row.

## Step 3 — verify clean

```bash
git status                     # clean
git rev-parse origin/main      # this is the tip
git worktree list              # only main + intentional retained
git for-each-ref refs/heads/ | grep -v '/main$' | wc -l   # 0 (or only --leave)
git stash list                 # empty (or only --leave)
git submodule foreach 'git rev-list HEAD --not origin/main'  # empty
```

If any check fails, report it. Don't claim victory on a partial sweep.

## Step 4 — record `--leave` exemptions

For each surface in `--leave`, append to its linked bead:
```bash
km bd update <bead> --append-notes "$(date +%Y-%m-%d) — wip retained at <surface> on <branch> (<sha>). Resume via: cd <path> && git switch <branch>. /merge to settle."
```

`/daily` reads these notes and surfaces them as carry-over.

## Step 5 — summary

```
✓ Merged — N integrated, M discarded, K left (noted in beads), L unchanged
WIP: 7 → 1 (deliberately retained: feat/silvery-spike)
```

Or:

```
⚠ Stopped — WIP: 7 → 4. Items needing your input:
  • wt5: uncommitted changes, conflicting with main on apps/silvercode/welcome.tsx
  • km-recall-spike: claimed bead with -- recent commits but no push (last commit 9d ago)
```

## Anti-patterns

- **Auto-apply stashes** — never. They almost always need review.
- **Force-push `wtN` over divergent remote** — fetch + rebase or cherry-pick instead.
- **Leave a "leave" surface without a bead note** — accumulates as soft-leave debt.
- **Skip the `--dry-run` on first session run** — too easy to nuke an experiment you forgot about.
- **Claim victory after Step 2 without Step 3 verify** — partial sweeps look done but aren't.
- **Run `/merge` while a teammate's session has dirty main** — collisions; coordinate via tribe first.

## Pairs with

- `/daily` — runs cadence-based maintenance; orthogonal axis (cadence vs WIP).
- `/checkpoint` — preserve a single bead's narrative + WIP intentionally; the `--leave` companion.
- `/sop` — domain-by-domain ops, not WIP-focused.
- `/pm` — drill into a single bead surfaced by `/merge` as stale.
