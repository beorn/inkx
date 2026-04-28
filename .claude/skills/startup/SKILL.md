---
description: "Daily morning routine — full SOP scan, state orientation, carry-over from yesterday's /shutdown. Run once at the start of each working day to surface everything that needs attention."
argument-hint: "[--quick | --deep]"
allowed-tools: Bash, Read, Skill, AskUserQuestion
benefits-from: [pm, sop, recall]
---

# Startup — Daily Morning Routine

**Keywords**: startup, morning, daily, kickoff, what's pending, where did i leave off, today

## What this is

Runs once at the start of each working day. Combines:

1. **State orientation** — branch, uncommitted, in-progress beads, retained work from yesterday
2. **Full SOP scan** — all due domains by cadence (replaces ad-hoc `/sop` invocations)
3. **Cadence reminders** — test, SOP, stale beads
4. **Triage carry-over** — what was deliberately left from yesterday's `/shutdown`
5. **Recommended action** — single best next thing to do

Pairs with `/shutdown` (end of session). Where `/shutdown` decides per row, `/startup` shows the morning landscape.

## Modes

- `--quick` (default): orientation + SOP scan due domains only (cadence-respecting). 30-90s.
- `--deep`: same plus `/sop --all` (all 11 domains regardless of cadence). 5-15 min.

## Context (live)

- Branch: !`git branch --show-current`
- Uncommitted: !`git status --porcelain | head -30`
- Recent commits (last 24h): !`git log --since="24 hours ago" --oneline | head -20`
- In-progress beads: !`bd list --status in_progress 2>/dev/null | head -15 || true`
- Retained git worktrees: !`git worktree list | grep -v "^/Users/beorn/Code/pim/km " | head -20`
- Bun worktrees: !`bun worktree list 2>/dev/null | head -10 || true`
- Local non-main branches: !`git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$' | head -20`
- Stashes: !`git stash list | head -5`
- Tribe sessions (best-effort): !`bun /Users/beorn/Code/pim/km/vendor/bearly/tools/tribe-cli.ts status 2>/dev/null || echo "(no daemon)"`
- Test cadence: !`bash packages/km-infra/scripts/test-cadence-check.sh 2>&1 | head -5 || true`
- SOP cadence: !`bash packages/km-infra/scripts/sop-cadence-check.sh 2>&1 | head -10 || true`

## Step 1: Surface yesterday's deferred work

Find beads that ended yesterday's session in a "leave (deliberately)" state — those have a recent note added by `/shutdown`. Pattern: `bd list --status open` and grep notes for "wip retained at" within last 48h.

```bash
bd list --status open --limit 50 2>/dev/null | grep -B0 -A0 "wip retained" 2>/dev/null || true
# or fall through and check each in-progress bead's notes manually
```

For each: show the bead, the retained-worktree path, the branch, the SHA. The user decides: resume / re-triage / stale-out.

## Step 2: Run full SOP scan

```bash
bun tools/sop.ts scan        # --quick: due domains only
# OR
bun tools/sop.ts scan --all  # --deep: all 11 domains
```

Surface findings inline. Domains:

- **code** — typecheck, lint, tests, complexity (every-session cadence)
- **packages** — version drift, deps, publishability (monthly)
- **security** — CVEs, secrets, supply chain (weekly)
- **sites** — README sync, GSC, link check (per-release)
- **infra** — CI, hooks, accountly, Cloudflare, **wip-triage** (monthly)
- **legal** — licenses, attribution (quarterly)
- **inbound** — issue triage, CVE intake (weekly)
- **backlog** — stale beads, orphans, session promotion (weekly)
- **packaging** — bundle sizes, CJS/ESM compat (per-release)
- **market** — competitive moves, ecosystem changes (TBD)
- **growth** — reach metrics (TBD)

For each finding: report-only in `--quick`, walk fixes in `--deep`.

## Step 3: Read the cadence reminders

The `bash packages/km-infra/scripts/test-cadence-check.sh` and `sop-cadence-check.sh` outputs from the live context. If they printed anything: tell the user explicitly. Don't auto-run multi-minute suites — surface and let the user pick.

## Step 4: Wip-triage view (read-only)

Run the read-only scan from the wip-triage tool when it's built (km-infra.orphan-branch-audit):

```bash
bun tools/sop.ts scan infra wip-triage
```

Until then, use the manual recipe:

```bash
# Per retained branch / worktree, show: linked bead, divergence, age
for br in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'); do
  ahead=$(git rev-list --count main..$br 2>/dev/null)
  behind=$(git rev-list --count $br..main 2>/dev/null)
  bead=$(echo "$br" | sed -nE 's|^(wip|bug|feat|fix|chore|docs|refactor|test|ci|style|perf)/(.*)|\2|p')
  status=$(bd show "$bead" 2>/dev/null | head -1 || echo "(no bead)")
  echo "$br  ahead=$ahead behind=$behind  $status"
done
```

Show table; do NOT act. Acting on retained work is `/shutdown`'s job (or interactive `bun tools/sop.ts clean infra wip-triage` when built).

## Step 5: Today's bd-ready picks

```bash
bd ready --priority 0 --limit 5    # P0 ready
bd ready --priority 1 --limit 10   # P1 ready
```

Show top results. Don't claim anything — orientation only.

## Step 6: Recommended next action

Synthesize a single suggestion based on what surfaced:

- **If `/shutdown` left something explicit**: resume that first.
- **Else if SOP found a P0-equivalent issue** (CVE, broken CI, stale tests >7d): fix that.
- **Else if there's a clean P0 ready**: claim it.
- **Else**: pick from P1 ready or run `/discuss` to plan.

Format the recommendation as one sentence, with the bead id + slug + first concrete command.

## Step 7: End summary

Print a closing line:

- `Ready: N P0 ready · M P1 ready · K SOP findings · L retained branches · <recommendation>`

Optionally: PushNotification if running as a scheduled job (cron) so the user sees the summary on their device.

## Anti-patterns

- **Auto-running multi-minute suites** (test:ci, /sop --all without explicit --deep) — surface, don't act
- **Claiming beads inside /startup** — orientation only; `/pm work <id>` to claim
- **Silently skipping cadence reminders** — explicit text or it disappears in the noise
- **Re-running yesterday's broken work** — check the leave-noted beads first

## Pairs with

- `/shutdown` — feeds carry-over into step 1
- `/sop` — `/startup` invokes a full `/sop scan`; `/sop` directly is for ad-hoc domain runs
- `/pm` — drill in once `/startup` surfaces a target bead
- `/discuss` — when no clear next action emerges
- `/checkpoint` — preserve narrative if `/startup` produces a long carry-over list
