---
mentions:
  - km
  - claude
id: "@km/tribe/recall-step1-hypothesis-test"
aliases:
  - km-tribe.recall-step1-hypothesis-test
  - km-tribe-recall-step1-hypothesis-test
created_by: claude:4de4a3ab
created_at: 2026-04-28T01:51:34Z
started_at: 2026-04-28T02:38:09Z
owner: bjorn@stabell.org
assignee: claude:4de4a3ab
dependencies:
  - issue_id: km-tribe.recall-step1-hypothesis-test
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-27T18:51:47Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [/] Step 1 (Day 1): Cheapest hypothesis test — does mem-thought-shaped output even feel useful? @km/tribe #task #P1 @claude:4de4a3ab

blocks:: [[@km/tribe]]

## Step 1 — Cheapest hypothesis test (no code)

Goal: prove or disprove the mem-thought hypothesis with a 1-day shell script before any architecture investment.

## What

Shell script that every 5 minutes:

- Reads the last 10 turns of an active silvercode session (or current Claude Code session)
- Runs `bun recall --agent` on a synthetic query derived from those turns
- Logs the result to `/tmp/mem-thought-hypothesis.log`

End of day: manual eyeball review. Out of ~10 emits across the working day, how many would have been useful if injected into the conversation?

## Gates

- **Kill gate**: 0 of 10 useful → STOP THE PROJECT. Save 6 weeks.
- **Proceed gate**: 3+ of 10 useful → continue to Step 2 (Tier 2 v2 + Tier 3 v0 A/B)

## Acceptance

- Script exists at `/tmp/mem-thought-hypothesis.sh` (or `tools/mem-thought-hypothesis.sh` if more permanent)
- Ran for at least 4 hours of real work
- Manual eyeball summary committed to bead notes: 'X of Y emits were useful, Y of Y were noise'
- Decision recorded: kill or proceed

## Parent

@km/tribe/recall (four-tier memory architecture)

## Out of scope

No code changes to silvercode. No new dependencies. Just a shell script + manual review.

