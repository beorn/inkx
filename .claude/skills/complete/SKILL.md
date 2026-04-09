---
description: "Session-end completeness audit. Use when finishing a refactor, migration, or feature to verify nothing was left behind."
argument-hint: "[<what-was-changed>]"
allowed-tools: Bash, Read, Glob, Grep, Skill, AskUserQuestion
---

# Completeness Audit

**Keywords**: complete, done, finish, session end, audit, remnant, leftover

## Context

- Branch: !`git branch --show-current`
- Uncommitted: !`git status --porcelain`
- In-progress beads: !`bd list --status in_progress 2>/dev/null | head -10 || echo "(none)"`
- Recent commits: !`git log --oneline -10`
- Diffs (truncated): !`git diff -U2 HEAD~5 -- ':!vendor' 2>/dev/null | head -200 || git diff -U2 -- ':!vendor' | head -200`
- Uncommitted diffs: !`git diff -U2 | head -100`

## Step 1: Verify Closed Beads (the #1 gap in our process)

**Before investigating anything else, verify every bead closed in this session.**

Beads get closed aspirationally — the agent did work, the bead says "done," but the /complete criteria don't actually pass. This is the most common failure mode and the hardest to catch because everyone assumes closed = done.

### Three failure modes to watch for

1. **Renamed, not deleted.** Agent renames `OldThing` → `NewThing` and closes "delete OldThing." The abstraction survives with a new name and the same number of references. (Real example: km-tui.tree.v4 Phase 10 — ColumnView → DerivedColumn → ColumnSnapshot, eventually deleted.)

2. **Wrapped, not eliminated.** Agent wraps old ceremony in a thinner wrapper and closes "eliminate ceremony." The call count doesn't change, just the call depth. (Real example: km-tui.tree.v4 Phase 9 — 21 useEffects → still 21, just calling store API now.)

3. **Numeric targets ignored.** Bead says "≤12 useEffects, ≤1000 LOC." Agent doesn't check the numbers before closing. (Real example: actual = 21 useEffects, 1356 LOC.)

### Verification protocol

For EVERY bead closed during this session (or this epic if auditing an epic):

1. `bd show <id>` — read the description, identify every /complete criteria
2. **Run every grep/wc/ls command literally.** Not "I think it's 0" — run it, paste the output
3. **For quantitative targets** (LOC, useEffect count, reference count): measure. If the number doesn't match, the bead was closed prematurely
4. **For deletion claims** ("delete X"): grep for X AND common renames. If it exists under a new name, that's not deleted
5. **For elimination claims** ("eliminate pattern"): grep for the pattern's STRUCTURE, not just its name. Same logic in a new function = not eliminated

```bash
# Batch-verify all criteria for an epic — run this as ONE block
bd list --parent <epic-id> --status closed | while read id; do
  echo "=== $id ===" && bd show $id 2>&1 | grep -A1 '/complete'
done
# Then run each grep command from the output
```

**If any criterion fails: REOPEN the bead.** "Mostly done" is not done. Report with verdict REOPEN, not PASS.

## Step 2: Understand the Work

**Argument**: $ARGUMENTS

Read the diffs above. Determine concretely:
- What was added, changed, or removed (functions, types, props, config keys, commands, UI states)
- For refactors: what old names/patterns were replaced, and what replaced them
- For new features: what new concepts were introduced
- For bug fixes: what behavior changed

If the diffs are truncated, Read the changed files to fill gaps. If still unclear, ask the user.

## Step 3: Investigate (the whole point of this skill)

**Think about what you DIDN'T touch.** The files you changed are fine — the compiler and tests verify those. The danger is everything else: the consumer you forgot, the doc page nobody reads, the test helper that still sets up the old shape, the sibling function with the same bug.

### Three principles for good hypotheses

1. **Follow the blast radius.** Every change has downstream consumers. A renamed export has importers. A changed type has destructurers. A new command should appear in help text. A fixed bug might exist in the sibling code path. Trace outward from your change.

2. **Check the shadow copies.** Code gets described in multiple places: source, tests, test fixtures, docs, skill files, CLAUDE.md, MEMORY.md, `docs/ref/ui.md`, error messages, log strings, comments. A change to the source that doesn't update the shadows leaves lies behind.

3. **Look for the old way still working.** The most insidious remnant isn't a broken reference — it's a *working* one. Compat re-exports, `@deprecated` annotations, function overloads supporting both signatures, two code paths doing the same thing. If the old way still works, someone will use it. (From `docs/lessons/refactoring.md`: "Deprecated code still works, so there's no urgency" — that's exactly why it never gets cleaned up.)

### How to investigate

**CRITICAL: Never skip this step.** The investigation IS the point of /complete — tests and lint are table stakes anyone can run. The hypotheses catch what automation can't: stale docs, dead references, orphaned code, leaking abstractions.

**Scale with surface area.** The 5-10 hypothesis range is a minimum for small changes. For larger work:
- 1-3 files changed → 5 hypotheses
- 5-10 files changed → 10 hypotheses
- 10+ files or cross-package → 15-20 hypotheses
- Docs reorg / rename / deletion → add hypotheses for every deleted/renamed file

Form hypotheses. Prioritize non-obvious ones — the obvious searches (exact old name) are easy; the creative ones (variant spellings, related concepts, sibling functions) catch what others miss.

For each hypothesis, grep the **entire repo**:
```
Grep pattern="<term>" glob="*.{ts,tsx}"
Grep pattern="<term>" glob="*.md"
```

Run independent searches in parallel. Include variant spellings, partial matches, related concepts.

### Classify findings

| Finding | Verdict |
|---|---|
| Active code using removed/old API | **FIX** |
| Test exercising removed API or old shape | **FIX** |
| Re-export, compat shim, `@deprecated` keeping old way alive | **FIX** |
| Dual pattern — old + new both work | **FIX** |
| Doc/skill/comment describing old behavior | **FIX** |
| Docstring promising unimplemented API | **FIX** |
| New package with zero tests | **FIX** |
| New export not in barrel (undiscoverable) | **FIX** |
| `TODO`/`HACK`/`WORKAROUND` without tracking bead | **FIX** |
| /complete criteria that doesn't match reality | **FIX** |
| Changelog, git history, bead history | skip |

**Default: fix everything you find.** Don't leave small issues as "FLAGS" to be cleaned up later — they rarely get cleaned up. The investigation IS the cleanup pass.

Only escalate to the user when a fix would be:
- **Architecturally significant** (changes public API, adds dependencies, restructures packages)
- **Risky without context** (you're unsure if the old code is still needed by someone)
- **Large blast radius** (touching 20+ files that weren't part of the original work)

For everything else — stale docs, version bumps, redundant imports, missing exports, outdated comments — just fix it and note what you did in the report.

### Bead-vs-Reality (already covered in Step 1)

Step 1 handles bead verification. If you're auditing work NOT tracked by beads, apply the same rigor: for each claim ("deleted X", "eliminated Y", "reduced to N"), verify literally with grep.

## Step 4: Code Clean

Run `/code clean --dry-run` on the files changed by this session's work. This catches things the hypothesis scan won't — simplification opportunities, anti-patterns from `docs/principles.md`, logging violations, narrative flow issues.

Don't implement — just report findings alongside the investigation results.

## Step 5: Wrap Up

Run tests and lint — table stakes, not the point of this skill:

```bash
cd /Users/beorn/Code/pim/km ; bun fix && bun run test:fast | tail -30
```

Close completed beads. Sync (`bd sync`). Commit and push.

**BLOCK if tests or lint fail.**

## Report

```markdown
## Completeness: <work summary>

### What was done
<1-2 sentences>

### Investigation
| # | Hypothesis | Search | Result |
|---|---|---|---|
| 1 | "Callers of X still destructure old shape" | `Grep oldField *.ts` | PASS — 0 hits |
| 2 | "docs/ref/ui.md still lists removed state" | `Grep oldState docs/` | FIXED — updated ui.md:42 |
| 3 | "unfold has same bug as fold" | `Read unfold.ts:80` | FIXED — applied same fix |
| 4 | "Major API redesign needed" | analysis | ESCALATE — ask user |

### Code Clean
<Summary of /code clean --dry-run findings, or "No issues found">

### Mechanical
- [x] Tests pass
- [x] Lint passes
- [x] Committed and pushed

### Verdict
**COMPLETE** / **INCOMPLETE — N blocking items**
```

## Anti-Patterns

- **Skipping Step 1** (bead verification) — the most common and most costly mistake. Everything else catches residue; Step 1 catches lies
- **Accepting agent "done" claims without running the greps** — agents close beads aspirationally. Trust but verify. Run the commands yourself
- **Closing beads with renamed-not-deleted code** — grep for the OLD name AND the new name. If the same ref count exists under a new name, nothing was deleted
- **Closing beads when numeric targets weren't met** — "≤12 useEffects" means measure it. If it's 21, the bead stays open
- Declaring "done" because tests pass — tests don't catch stale docs, compat shims, or sibling bugs
- Only grepping for exact old names — search for variants, related concepts, partial matches
- Scoping investigation to changed files — the whole point is checking what you DIDN'T change
- Leaving `@deprecated` or compat re-exports "for safety" — they become permanent
- Forming only 2-3 obvious hypotheses — push to 5-10, prioritize non-obvious ones
