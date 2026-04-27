---
description: Lightweight per-round bead-acceptance verification for integration cycles. Runs each merged bead's /complete grep against origin/main. Use after silvery-integrator (or similar) closes a round, before declaring it shipped.
argument-hint: [round-id|since-ref]
allowed-tools: Bash, Read, Grep
benefits-from: [pm, recall]
escalate-to: {complete: "session-end audit; round-close is a subset"}
---

# Round-Close — Per-Round Bead Acceptance Verification

**Keywords**: round close, integration close, bead verify, acceptance grep, post-merge gate

A lightweight gate that runs between integration rounds. Heavier than nothing, lighter than `/complete`. Catches the gap that bit the plateau-90 program: agent claims `bead closed` but acceptance grep at origin/main still fails.

## When to use

- After an integration round (silvery-integrator finishes a merge cycle and pushes silvery + km main)
- After spawning a teammate that claims to close a bead — verify the bead's acceptance criteria actually pass at origin
- Before declaring "ship state" at the end of any phased migration round

**Don't use for**: full session end (use `/complete`); single-file fixes (just verify directly); release prep (use `/release`).

## The Iron Rule

**Trust origin/main, not local worktrees.** An agent's `git log` showing a commit is not proof. A round-close gate runs:

```bash
git fetch origin
git grep <pattern> origin/main
```

If the grep fails at origin/main, the round is **not closed**, regardless of what local branches show.

## The protocol

### 1. List beads closed this round

```bash
# Ask the user, or check tasklist, or:
bd list --status closed --closed-after <round-start-iso8601>
```

For each bead, `bd show <id>` and locate the `/complete` / `Acceptance` section.

### 2. Extract grep patterns from each bead

A well-formed acceptance criterion looks like:
- `grep "X" → 0 hits`
- `git grep "Y" → ≥ 1 hit`
- `rg -E "pattern" path/ → 0 hits`

Copy them verbatim. Don't paraphrase.

### 3. Fetch origin

```bash
git fetch origin
cd vendor/<submodule> && git fetch origin && cd ..
```

If your worktree's submodule pin is stale, `git submodule update --init --recursive`.

### 4. Run each grep against origin/main

```bash
# Example for v3.1 acceptance
git grep recordPassCause origin/main -- 'packages/'   # expect 0 hits
git grep "logPass" origin/main -- 'packages/'         # expect ≥ 1 hit
```

**For submodules**: `cd <submodule>; git grep <pattern> origin/main`. Don't run from km root expecting submodule contents.

### 5. Compare to expected

| Result at origin/main | Action |
|---|---|
| Matches expected | Round closed for that bead. Mark verified. |
| Doesn't match | **Round NOT closed.** Either re-engage integrator OR reopen bead OR file a follow-up bead. |
| Cannot run grep (wrong path, missing tool) | Acceptance criterion is malformed; flag for bead cleanup. |

### 6. Report

```markdown
## Round X close — verification results

| Bead | Acceptance grep | Expected | Actual at origin/main | Status |
|---|---|---|---|---|
| km-silvery.foo | `git grep X` | 0 hits | 0 hits | ✓ PASS |
| km-silvery.bar | `git grep Y` | ≥ 1 hit | 0 hits | ✗ FAIL |

**Failures: N. Round status: not-yet-closed.**

Failed bead actions:
- km-silvery.bar: re-engage integrator OR reopen bead. Reason: [analysis].
```

## Common failure modes (from plateau-90 session)

1. **Agent committed but didn't push.** `git ls-remote origin <branch>` doesn't return the SHA agent reported. Fix: spawn agent with the new commit-AND-push CRITICAL block (see `/max` SKILL.md `Worktree commit-AND-push rules`).

2. **Branch wasn't merged into main.** Agent's branch exists at origin/feat/X, but origin/main doesn't reach it. Acceptance grep fails because main lacks the commit. Fix: re-engage integrator with explicit "Round N+1: merge feat/X."

3. **Submodule pin drift.** Lead worktree's submodule pin is stale (e.g., still on round-1 silvery while origin/main has round-3). Acceptance greps against the submodule's `origin/main` would still pass; greps against the lead worktree's local pin would fail. Fix: `git submodule update --init --recursive` after each round.

4. **Acceptance criterion is malformed.** Says "grep X → 0 hits" but doesn't specify path or tool, so verifier can't replay. Fix: make acceptance executable — `{cmd: "git grep X origin/main -- packages/", expected: 0}` rather than prose.

## Escalation

If round-close finds repeated failures across multiple rounds, escalate:
- 1 failure: re-engage integrator
- 2 failures: file a process bead, fix the integrator's protocol
- 3+ failures: escalate to `/why` to find the root cause

## Anti-patterns

- Trusting agent self-report. The whole point of `/round-close` is to verify against origin/main.
- Running greps against local worktree pin. Use `origin/main` explicitly.
- Skipping when "STRICT passed and tests are green." STRICT can pass even when the rename never landed; tests verify code that runs, not code that doesn't.
- Conflating with `/complete`. `/complete` runs at session end with full investigation + tests + lint + commit. `/round-close` is bead-grep-only — minutes per round, not the heavy ritual.
