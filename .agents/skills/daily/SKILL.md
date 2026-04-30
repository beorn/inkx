---
description: "Daily ritual — run today's due cadence routines, prompt about due weekly/monthly/quarterly, surface yesterday's leave-notes, recommend next bead. Run at least once a day."
argument-hint: "[--quick | --deep | --report] [<domain>]"
allowed-tools: Bash, Read, Skill, AskUserQuestion
benefits-from: [sop, pm, recall]
---

# Daily — Daily Ritual

**Keywords**: daily, morning, routine, cadence, scheduled maintenance, weekly check, monthly check, what's due, what should I do today

The cadence runner. Runs at least once a day. Different from `/merge` (which reduces WIP) — this runs the **scheduled** maintenance: daily-cadence things every time, plus any weekly / monthly / quarterly routines whose stamp has lapsed.

State lives in `.agents/skills/sop/state.json` (`lastRun.<domain>`); `tools/sop.ts` honors cadence windows.

## Modes

| Invocation | Behavior |
|---|---|
| `/daily` | Run today's due routines. Prompt before any longer-cadence due item |
| `/daily --quick` | Same as default but skip auto-prompts; only daily-cadence runs |
| `/daily --deep` | Ignore cadence; run all 11 SOP domains |
| `/daily --report` | Show what's due, take no action |
| `/daily security` | Single-domain run (passes through to `/sop security`) |

## Step 1 — surface what's due

```bash
bash packages/km-infra/scripts/sop-cadence-check.sh
bash packages/km-infra/scripts/test-cadence-check.sh
```

Print a table:

```
DUE TODAY:
  ✓ code            (every session)        ← will run
  ⏰ security       (weekly, 9d overdue)   ← prompt
  ⏰ packages       (monthly, 2d overdue)  ← prompt
  ✓ inbound         (weekly, fresh)         skip
  ✗ legal           (quarterly, 12d to go)  skip
  ⚠ test:fuzz      (>24h stale)            ← reminder
```

For each `⏰` row, prompt: **"Run security audit now (~3-5 min)? [y/N]"**

Default: yes for the daily cadence, ask for everything longer. The user's morning ritual shouldn't trigger a 15-minute deep scan without consent.

## Step 2 — run the agreed set

```bash
bun tools/sop.ts scan                  # default: due + agreed prompts
bun tools/sop.ts scan --all            # --deep
bun tools/sop.ts scan <domain>         # single domain pass-through
```

For each domain, the SOP machinery handles scan→propose→execute. Findings auto-fix where SOP rules permit; everything else surfaces.

## Step 3 — surface carry-over from `/merge --leave`

Find beads with recent "wip retained at" notes:

```bash
km bd list --status open --limit 50 2>/dev/null | \
  xargs -I{} km bd show {} 2>/dev/null | grep -B1 "wip retained at" | head -20
```

For each: bead id, retained worktree path, branch, sha. The user picks resume / re-triage (`/merge wtN`) / stale-out per row. Just surface; don't act.

## Step 4 — bd ready picks

```bash
km bd ready --priority 0 --limit 5
km bd ready --priority 1 --limit 10
```

Orientation only — don't claim.

## Step 5 — synthesize next-action

One sentence with bead id + slug + first concrete command. Priority:

1. Carry-over from yesterday's `/merge --leave` → resume
2. SOP P0-equivalent finding (CVE / broken CI / fresh security failure) → fix
3. Clean P0 ready → claim and start
4. Clean P1 ready → claim and start
5. Else → `/discuss` to plan

Example: `Next: km-foo.bar (P0 broken CI) — cd .claude/worktrees/wt3 && git fetch origin && bun km bd update km-wt3 --claim`

## Step 6 — close

Bump SOP cadence stamps for everything that ran. Print summary:

```
✓ Daily — code clean, security 0 CVE, packages 1 finding (auto-fixed). Next: km-foo.bar.
```

Or with leave-notes:

```
✓ Daily — 2 findings to review. Carry-over: km-recall-iter3 retained yesterday.
  Recommended: resume km-recall-iter3 (cd .claude/worktrees/recall-iter3 && git fetch).
```

## Anti-patterns

- **Auto-running multi-minute weekly/monthly/quarterly routines without prompt** — the user wakes up wanting to start working, not wait 15 minutes for a security audit
- **Claiming beads inside `/daily`** — orientation only; `/pm work <id>` to claim
- **Skipping cadence stamps** — leads to "did I run this?" guesswork next session
- **Confusing `/daily` with `/merge`** — `/daily` doesn't touch WIP. If main is dirty after `/daily`, that's a separate concern → run `/merge`
- **Trusting "all green tsc"** without a fresh count — SOP code domain re-runs every time

## Pairs with

- `/merge` — reduce WIP; orthogonal to cadence
- `/sop` — direct domain runs, ignores cadence stamps; the underlying machinery
- `/checkpoint` — preserve narrative for a specific bead before /compact
- `/pm work <id>` — claim a bead surfaced by `/daily`'s next-action recommendation
