---
description: Automated GPT 5.4 Pro code review across km packages. Discovers targets, estimates costs, launches reviews, triages findings, creates beads, tracks history.
argument-hint: [<package>|--history|--dry-run]
---

**Keywords**: pro review, code review, gpt pro, automated review, package review, quality audit

# Pro Review — Automated GPT 5.4 Pro Code Review

Runs GPT 5.4 Pro deep research reviews across km packages with cost estimation, parallel execution, structured triage, and adaptive learning from review history.

**Cost**: ~$5-15 per package (GPT 5.4 Pro deep research pricing).

## Command Mapping

| User Says | Action |
|-----------|--------|
| `/pro-review` | Full workflow: discover → estimate → select → review → triage |
| `/pro-review <package>` | Skip discovery, review specific package(s) directly |
| `/pro-review --dry-run` | Discover + estimate only, no reviews launched |
| `/pro-review --history` | Show review history dashboard from `history.jsonl` |
| `/pro-review --stale` | Show packages needing re-review (significant changes since last review) |

## Workflow

### Step 1: Discovery & Cost Estimation

Load [discover.md](discover.md) and run the discovery process:
1. Scan `packages/`, `apps/`, `vendor/` for TypeScript packages
2. Count LOC, estimate tokens and cost
3. Check review history for prior reviews
4. Present cost table to user

**Skip this step** if user specified a package name directly.

### Step 2: User Selection

Present the discovery table using `AskUserQuestion`. Support selection shortcuts:
- Numbers: `2,3,5` or `1-4`
- `all` — review everything
- `unreviewed` — only packages never reviewed
- `stale` — packages reviewed >2 weeks ago or with significant changes since

### Step 3: Create Tracking Bead

**Before launching any reviews**, create a tracking epic:

```bash
# Find next sequential number
bd list --id-prefix km-all.pro-review --limit 100
# Create tracking epic
bd create --id km-all.pro-review-<N> --type epic --title "Pro Review Round N: <date> — <packages>" --priority 2
bd update km-all.pro-review-<N> --parent km-all
bd update km-all.pro-review-<N> --claim
```

### Step 4: Per-Package Review

For each selected package, load [review.md](review.md) and execute:
1. Gather context (shared header + package source + prior findings)
2. Build context file at `/tmp/pro-review-<package>.md`
3. Launch `bun llm --deep --model gpt-5.4-pro -y --no-recover --context-file /tmp/pro-review-<pkg>.md "GPT 5.4 Pro code review: <package>"`
4. Run in background — launch up to 3 concurrently

### Step 5: Triage

As each review completes, load [triage.md](triage.md):
1. Read the output file (NOT the task output — find the `/tmp/llm-*.txt` file)
2. Classify findings as P0-P3
3. Create per-package review bead under the tracking epic
4. Create individual bug beads for P0/P1 findings
5. Update tracking bead description with cumulative dashboard
6. Present findings table to user
7. Ask: "Fix P0/P1 now? (recommended) / Track only / Skip"

### Step 6: Fix (Optional)

If user wants fixes:
- Launch `/max` with parallel agents for independent P0/P1 fixes
- TDD enforced: failing test before fix
- Each agent closes its bug bead when done

### Step 7: Record History

Load [history.md](history.md) and append results to `history.jsonl`.

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Skip the tracking bead | Future sessions can't find review results |
| Launch >3 concurrent reviews | Deep research queue has practical limits |
| Skip triage, just dump findings | Raw findings are overwhelming — classification enables prioritization |
| Fix P2/P3 automatically | Low-priority findings need user judgment |
| Send code without context header | Reviewer needs architecture + principles to give good advice |
| Use `--context` instead of `--context-file` | Shell quoting breaks on backticks in source code |
| Forget `--no-recover` | Stale recovered responses from prior calls waste money |
