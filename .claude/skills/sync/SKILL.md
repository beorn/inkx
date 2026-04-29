---
description: "Daily rhythm — triage retained agent work, run SOP scan, surface state. Auto-detects start-of-session (orient + carry-over) vs end-of-session (decide-and-stop). Run at the start of the day or before stopping."
argument-hint: "[--quick | --deep | --start | --end | --report]"
allowed-tools: Bash, Read, Skill, AskUserQuestion
benefits-from: [pm, sop, complete, recall]
---

# Sync — Daily Rhythm

**Keywords**: sync, daily, morning, end of day, shutdown, startup, triage, retained work, wip, where did i leave off, before i quit, what's pending

## What this is

One skill for both ends of the working day:

- **Start-of-session** (morning): orient on state, run `/sop scan`, surface what `/daily --end` left noted yesterday, recommend next action.
- **End-of-session** (before stopping): triage every form of retained agent work — wip branches, stale worktrees, stashes, uncommitted main — and force a decision per row (integrate / discard / leave-with-note).

Both modes share the same enumeration of retained work + bd state; differ in whether they show-only or force-decision.

Pairs with the eventual-consistency model (`feedback-agent-isolation-eventual-consistency.md`): branches are a triage queue, this skill is the triage UI.

## Modes

| Flag | Mode | When |
|------|------|------|
| (default) | auto-detect | Uncommitted main + claimed in-progress + active worktrees → end mode. Clean → start mode. |
| `--start` | orientation | Force start mode (full SOP scan, show state, recommend next) |
| `--end` | triage | Force end mode (force decision per retained-work row) |
| `--report` | read-only | Enumerate everything, take no action |
| `--quick` | (with --start) | Cadence-respecting SOP scan only (~30-90s) |
| `--deep` | (with --start) | All 11 SOP domains regardless of cadence (~5-15 min) |

## Context (live — both modes)

- Branch: !`git branch --show-current`
- Uncommitted (main): !`git status --porcelain | head -20`
- Recent commits (24h): !`git log --since="24 hours ago" --oneline | head -15`
- In-progress beads (mine): !`km bd list --status in_progress --assignee "$USER" 2>/dev/null | head -10 || km bd list --status in_progress 2>/dev/null | head -10`
- Git worktrees: !`git worktree list | grep -v "^/Users/beorn/Code/pim/km " | head -15`
- Bun worktrees: !`bun worktree list 2>/dev/null | head -10 || echo "(unsupported / none)"`
- Local non-main branches: !`git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$' | head -20`
- Stashes: !`git stash list 2>/dev/null | head -5`
- Tribe sessions: !`bun /Users/beorn/Code/pim/km/vendor/bearly/tools/tribe-cli.ts status 2>/dev/null || echo "(no daemon)"`
- Test cadence: !`bash packages/km-infra/scripts/test-cadence-check.sh 2>&1 | head -5 || true`
- SOP cadence: !`bash packages/km-infra/scripts/sop-cadence-check.sh 2>&1 | head -10 || true`

## Auto-detect heuristic

If no explicit mode flag:

- Uncommitted main OR retained worktree on closed bead OR active /loop process → **end** mode
- Clean main + no immediate retained work + recent commits all in main → **start** mode
- Mixed/ambiguous → ask the user once: "End-of-session triage or morning orient?"

## Step 1 (both modes): enumerate retained work

If `tools/wip-triage.ts` exists (km-infra.orphan-branch-audit shipped):

```bash
bun tools/sop.ts scan infra wip-triage    # both modes use the report
```

Otherwise, manual recipe:

```bash
for br in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'); do
  ahead=$(git rev-list --count main..$br 2>/dev/null)
  behind=$(git rev-list --count $br..main 2>/dev/null)
  bead=$(echo "$br" | sed -nE 's|^(wip|bug|feat|fix|chore|docs|refactor|test|ci|style|perf)/(.*)|\2|p')
  status=$(km bd show "$bead" 2>/dev/null | head -1 || echo "(no bead)")
  echo "$br  ahead=$ahead behind=$behind  $status"
done
```

Build a row table: source kind (git-worktree / bun-worktree / branch / stash) × linked bead × bead status × divergence × age.

## Step 2 (start mode only): orient

### 2a. Surface yesterday's deferred work

Find beads with recent "wip retained at" notes (added by `--end`):

```bash
km bd list --status open --limit 50 2>/dev/null | xargs -I{} km bd show {} 2>/dev/null | grep -B1 "wip retained at"
```

Show: bead, retained worktree path, branch, SHA. The user picks resume / re-triage / stale-out per row.

### 2b. Run SOP scan

```bash
# --quick: cadence-respecting, due domains only
bun tools/sop.ts scan
# --deep: all 11 domains
bun tools/sop.ts scan --all
```

Surface findings inline. Default `--quick` if no flag.

### 2c. Cadence reminders

Already in live context above (test-cadence-check.sh, sop-cadence-check.sh). Restate explicitly if either printed anything. Don't auto-run multi-minute suites.

### 2d. bd-ready picks

```bash
km bd ready --priority 0 --limit 5
km bd ready --priority 1 --limit 10
```

Orientation only — don't claim.

### 2e. Recommend single next action

One sentence with bead id + slug + first concrete command. Synthesis priority:
1. Yesterday's "leave (deliberately)" rows → resume
2. SOP P0-equivalent finding (CVE / broken CI / >7d stale tests) → fix
3. Clean P0 ready → claim
4. Else: P1 ready or `/discuss` to plan

## Step 3 (end mode only): force decision per row

For each retained-work row from Step 1, pick one verb:

### integrate

```bash
git fetch <worktree-path-or-clone> <branch>:<branch>
git merge --ff-only <branch>     # cherry-pick -X theirs <sha> for non-FF
git worktree remove --force <worktree-path>
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

Note the carry-over in the relevant bead so `--start` finds it tomorrow:

```bash
km bd update <bead-id> --append-notes "$(date +%Y-%m-%d) — wip retained at <worktree-path> on <branch> (<sha>). Resume via: cd <path> && git switch <branch>"
```

**Rule**: a "leave" without a bead note is a soft-leave; those accumulate. Always note.

## Step 4 (end mode only): hygiene beyond branches

- **Main worktree uncommitted**: review `git status`. Stage + commit anything intentional; if accidental, decide before stopping.
- **In-progress beads claimed by you**: are they being worked? If not, release: `km bd update <id> --assignee "" --status open`.
- **Active /loop or /schedule**: stop them if you don't want them running while away.
- **Tribe daemon**: leave or stop depending on whether other sessions need it.

## Step 5 (both modes): close

### Start mode summary
`Ready: N P0 · M P1 · K SOP findings · L retained · <one-sentence recommendation>`

### End mode summary
`✓ Stopped — N integrated, M discarded, K left (noted in beads).`
or
`⚠ Stopping with attention items: <list>` (when "leave" rows existed without bead notes)

Optionally PushNotification if running as a scheduled job so the user sees the summary on device.

## Anti-patterns

- **Soft-leave** branches without bead notes (--end) → they pile up
- **Auto-running multi-minute suites** (--start without --deep flag) → surface, don't act
- **Claiming beads inside --start** → orientation only; `/pm work <id>` to claim
- **Force-delete stashes** without checking what's in them
- **Integrate non-FF** without reading the diff (`git log -p main..<branch>`)
- **Trust "all green tsc"** without a fresh count

## Pairs with

- `/sop` — `/daily --start` invokes `/sop scan` internally; `/sop` directly is for ad-hoc domain runs
- `/complete` — feature/refactor-level closure, orthogonal to daily-rhythm triage
- `/checkpoint` — preserve narrative to a bead before /compact (also runs from pre-compact hook)
- `/pm` — drill in once `/daily --start` surfaces a target bead
