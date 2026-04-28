---
description: "Session-end triage of retained agent work — wip branches, stale worktrees, stashes, uncommitted changes. Decide integrate / discard / leave before stopping."
argument-hint: "[<scope-hint>]"
allowed-tools: Bash, Read, Skill, AskUserQuestion
benefits-from: [pm, complete, sop]
---

# Shutdown — End-of-session Triage

**Keywords**: shutdown, end of day, stop, wrap up, triage, retained work, before I quit

## What this is

End-of-session companion to `/startup`. Walks every form of retained work and forces a decision per row: **integrate** / **discard** / **leave** (deliberately, with the bead noted for next session).

Pairs with the eventual-consistency model from `feedback-agent-isolation-eventual-consistency.md` — branches are a triage queue, this skill is the triage UI.

## Context (live)

- Branch: !`git branch --show-current`
- Uncommitted (main worktree): !`git status --porcelain | head -20`
- Git worktrees: !`git worktree list`
- Bun worktrees: !`bun worktree list 2>/dev/null || echo "(unsupported / none)"`
- Local branches (non-main): !`git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'`
- Stashes: !`git stash list 2>/dev/null || echo "(none)"`
- In-progress beads (mine): !`bd list --status in_progress --assignee "$USER" 2>/dev/null | head -10 || bd list --status in_progress 2>/dev/null | head -10`
- Active /loop / /schedule (best-effort): !`ps -ef | grep -E "loop|schedule" | grep -v grep | head -5 || true`

## Step 1: Prefer the tool when it's built

If `tools/wip-triage.ts` exists, just run:

```bash
bun tools/sop.ts clean infra wip-triage
```

That's the canonical interactive walker (km-infra.orphan-branch-audit). The rest of this skill is the manual fallback for the period before the tool ships, and the deeper end-of-day hygiene that the tool doesn't cover (uncommitted main, in-progress beads, /loop processes).

## Step 2: Per branch / worktree — annotate

For each branch / worktree from the live context above:

1. **Linked bead**: parse from branch name (`wip/<id>`, `bug/<id>`, `feat/<id>`, `fix/<id>`) or scan last 5 commits for `km-<scope>.<slug>` patterns. `bd show <id>` for status (open / in_progress / closed / not-found).
2. **Divergence**: `git rev-list --count main..<branch>` (ahead) and `<branch>..main` (behind).
3. **Last-activity**: `git log -1 --format='%cr %h %s' <branch>`.
4. **Worktree mtime** (if applicable): `stat -f '%Sm' <worktree-path>` on macOS.

Build a table mentally:

```
ROW  KIND          BRANCH/PATH                              BEAD                    STATUS    DIVERGE          ACTION
1    git-worktree  .claude/worktrees/agent-…                km-foo.bar              closed    +3/-0            integrate?
2    branch        wip/km-foo.bar                           km-foo.bar              open      +5/-12           continue (next session) / discard
3    stash@{0}     "WIP — session-reducer queue-stuck-l4"   km-silvercode.l4        open      —                leave (recovery anchor)
```

## Step 3: Decide per row

For each row, pick exactly one verb:

### integrate

```bash
git fetch <worktree-path-or-clone> <branch>:<branch>     # if branch isn't already in main repo
git merge --ff-only <branch>                              # or cherry-pick -X theirs <sha> for non-FF
git worktree remove --force <worktree-path>               # if applicable
git branch -d <branch>
```

### discard

```bash
git worktree remove --force <worktree-path>
git branch -D <branch>
# stashes:
git stash drop <id>
```

### leave (deliberately)

Note the bead id + branch name + worktree path in the relevant bead's notes so /startup can find it tomorrow:

```bash
bd update <bead-id> --append-notes "$(date +%Y-%m-%d) — wip retained at <worktree-path> on <branch> (<sha>). Resume via: cd <path> && git switch <branch>"
```

Don't just leave silent rows — a "leave" without a bead note is how branches accumulate.

## Step 4: End-of-session hygiene

Beyond branch triage:

- **Main worktree uncommitted**: review `git status` output. Stage + commit anything intentional; if accidental, decide before closing.
- **In-progress beads claimed by you**: are they actually being worked? If not, release: `bd update <id> --assignee "" --status open` (so another session/agent can pick up).
- **Active /loop or /schedule**: stop them if you don't want them running while you're away (`bun /Users/beorn/Code/pim/km/vendor/bearly/tools/tribe-cli.ts ...` for tribe; CronList for cron jobs).
- **Tribe daemon**: if you started it, leave it running OR stop it depending on whether other sessions need it.

## Step 5: Final summary

After triage, output a one-line status:

- `✓ Ready to stop — N branches integrated, M discarded, K left (noted in beads).`
- `⚠ Stopping with attention items: <list>` — useful when a bead got "leave"-d without resolution.

Optionally: send a tribe broadcast or PushNotification if other sessions need to know what was triaged.

## Anti-patterns

- **Soft-leave** branches without bead notes → they pile up
- **Force-delete** stashes without checking what's in them
- **Integrate non-FF** without reading the diff (`git log -p main..<branch>`)
- **Trust "all green tsc"** without a fresh `npx tsc --noEmit | grep "error TS" | wc -l`
- **Skip step 4** because the branch triage felt thorough — uncommitted main + claimed-but-stale beads bite next session

## Pairs with

- `/startup` — opens the next session by surfacing what was left in `leave (deliberately)` rows
- `/complete` — feature/refactor-level closure; orthogonal to session-end triage
- `/sop infra wip-triage` — the cron-friendly version of step 1-3 (tracked in km-infra.orphan-branch-audit)
- `/checkpoint` — preserve session narrative to a bead before /compact
