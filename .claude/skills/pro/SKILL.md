---
description: "GPT 5.4 Pro — code reviews, direct questions, architectural advice. Use when user says 'pro', '/pro', 'ask pro', or wants GPT 5.4 Pro's opinion on anything."
argument-hint: [review [<package>] | "<question>" | --history | --dry-run]
---

**Keywords**: pro, pro review, gpt pro, gpt 5.4, code review, automated review, ask pro, second opinion

# Pro — GPT 5.4 Pro

GPT 5.4 Pro for code reviews and direct questions.

**Cost**: ~$5-15 per package review, ~$1-3 per direct question.

## Command Mapping

| User Says | Mode | Action |
|-----------|------|--------|
| `/pro review` | **Code review** | Full workflow: discover → estimate → select → review → triage |
| `/pro review <package>` | **Code review** | Review specific package(s) directly |
| `/pro review --dry-run` | **Code review** | Discover + estimate only |
| `/pro review --history` | **Code review** | Show review history dashboard |
| `/pro review --stale` | **Code review** | Packages needing re-review |
| `/pro "<question>"` | **Direct query** | Ask GPT 5.4 Pro with project context |
| `pro, <question>` | **Direct query** | Same — casual form |

### Direct Query Mode

When the user says `/pro "question"` or "pro, what do you think about X":

1. Build a context file with relevant code (read the files, include key sections)
2. Run: `bun llm --model gpt-5.4-pro -y --no-recover --context-file /tmp/pro-context.md "<question>"`
3. Present the response, synthesize with your own analysis

Use for: architectural decisions, design review, "is this approach sound?", second opinions.

### Code Review Mode

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
3. Launch `bun llm --deep --model gpt-5.4-pro -y --no-recover --context-file /tmp/pro-review-<pkg>.md "GPT 5.4 Pro code review: <package>"` (fire-and-forget, exits in ~5s)
4. Launch up to 3 concurrently — recover results later with `bun llm recover`

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
