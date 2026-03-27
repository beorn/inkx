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

## Step 1: Understand the Work

**Argument**: $ARGUMENTS

Read the diffs above. Determine concretely:
- What was added, changed, or removed (functions, types, props, config keys, commands, UI states)
- For refactors: what old names/patterns were replaced, and what replaced them
- For new features: what new concepts were introduced
- For bug fixes: what behavior changed

If the diffs are truncated, Read the changed files to fill gaps. If still unclear, ask the user.

## Step 2: Investigate (the whole point of this skill)

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

### For multi-phase or epic-level audits

When auditing an entire epic (not just one session), add a **feature-by-feature verification** step: for each closed bead, check that the bead's specific promises match actual code. This catches gaps that per-session `/complete` misses — unimplemented promises, missing tests, stale docstrings across the full feature set.

### Bead-vs-Reality Verification

When auditing work tracked by a bead, verify each promise literally — not from memory, not from bead notes saying "done." This catches "bead drift" where the bead says one thing but reality diverged (see Case Study 6 in `docs/lessons/refactoring.md`).

1. **Read the bead description**: `bd show <id>`. Identify every checklist item and /complete criteria.
2. **For EACH checklist item**: verify it literally with grep/ls/read.
   - "Move X from A to B" → grep X in A (should be 0), grep X in B (should be >0)
   - "Delete Y" → ls Y (should not exist)
   - "Re-export from Z" → grep "from.*Z" in the barrel file
   - "Rename A to B" → grep A (should be 0 outside history/changelogs), grep B (should be >0)
3. **For EACH /complete criteria in the bead**: run the exact grep command as written.
4. **Flag any item that's marked done but doesn't match reality.** Report it as a finding with verdict FIX.

This step is especially important after multi-phase work where each phase assumed previous phases were accurate.

## Step 3: Code Clean

Run `/code clean --dry-run` on the files changed by this session's work. This catches things the hypothesis scan won't — simplification opportunities, anti-patterns from `docs/principles.md`, logging violations, narrative flow issues.

Don't implement — just report findings alongside the investigation results.

## Step 4: Wrap Up

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

- Declaring "done" because tests pass — tests don't catch stale docs, compat shims, or sibling bugs
- Only grepping for exact old names — search for variants, related concepts, partial matches
- Scoping investigation to changed files — the whole point is checking what you DIDN'T change
- Leaving `@deprecated` or compat re-exports "for safety" — they become permanent
- Forming only 2-3 obvious hypotheses — push to 5-10, prioritize non-obvious ones
