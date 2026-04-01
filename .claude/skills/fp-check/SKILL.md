---
description: "False positive gate — mandatory verification before accepting review findings. Use after /review, /pro, /codex, or /cso produces findings to filter noise from signal."
argument-hint: [findings source, e.g. "review", "pro", "cso"]
---

# FP-Check — False Positive Verification Gate

**A finding is not a fact until verified. Every automated review produces false positives. This skill filters them.**

Inspired by Trail of Bits' systematic false positive verification: each finding gets an independent verification pass with mandatory evidence before it's accepted as real.

## The Task

$ARGUMENTS

**If no arguments**: Check the most recent review output in the conversation. Look for findings from `/review`, `/pro`, `/codex`, or `/cso`.

## The Gate

Every finding must pass through this 3-step gate before action is taken:

### Step 1: Reproduce

Can you independently confirm the finding?

- **Code issue** → read the code path; does the issue actually exist?
- **Security finding** → trace the data flow; is the vulnerability reachable?
- **Style/pattern issue** → check if the codebase convention matches; is this actually wrong here?
- **Performance issue** → is there evidence of actual impact, or is it theoretical?

Verdict: **CONFIRMED** (reproduced) or **UNVERIFIED** (can't reproduce)

### Step 2: Contextualize

Is this finding relevant in THIS codebase?

- Does the codebase already have mitigations the reviewer didn't see?
- Is the "vulnerable" code path only reachable in test/dev contexts?
- Does the project's architecture make this a non-issue? (e.g., "SQL injection" in a codebase that uses parameterized queries everywhere)
- Is this a known accepted risk documented in beads or CLAUDE.md?

Verdict: **RELEVANT** or **FALSE POSITIVE** (with reason)

### Step 3: Prioritize

If confirmed and relevant, how urgent?

- **P0** — Active vulnerability or data-loss risk. Fix now.
- **P1** — Real bug affecting users. Fix this session.
- **P2** — Code quality issue. Create a bead.
- **P3** — Nitpick or theoretical. Note it, don't act.

## Processing Findings

For each finding from the review:

```
FINDING: [one-line description]
SOURCE: [which review tool found it]
REPRODUCE: [CONFIRMED/UNVERIFIED] — [evidence: file:line, test output, or "cannot reach this code path because X"]
CONTEXT: [RELEVANT/FALSE POSITIVE] — [reason]
PRIORITY: [P0/P1/P2/P3]
ACTION: [fix now / create bead / note only / dismiss]
```

## Batch Processing

When a review produces many findings (common with `/pro` or `/cso`):

1. **Quick scan first** — read all findings, group by category
2. **Dismiss obvious FPs** — things like "missing error handling" on infallible paths, "hardcoded string" that's a constant, "unused import" that's a type-only import
3. **Deep verify remaining** — run the 3-step gate on each survivor
4. **Report the ratio** — "X/Y findings confirmed (Z% FP rate)"

The FP rate is useful feedback for calibrating future reviews.

## Output

```
REVIEW SOURCE: /[tool]
TOTAL FINDINGS: [N]
CONFIRMED: [N] ([percentage])
FALSE POSITIVES: [N] ([percentage])
  - [reason category]: [count] (e.g., "already mitigated: 3", "unreachable code: 2")
ACTIONS:
  P0: [list or "none"]
  P1: [list or "none"]
  P2: [beads to create]
  P3: [noted, no action]
```

## Anti-Patterns

- **Accepting findings without verification** — the whole point is independent confirmation
- **Rejecting findings without evidence** — "probably fine" is not a reason; show why
- **Skipping context check** — a real issue in another codebase may be a non-issue here
- **Treating all findings equally** — P0 gets fixed now; P3 gets noted. Don't blur the line.
- **Not tracking FP rate** — if a tool produces >50% FPs, recalibrate how you use it
