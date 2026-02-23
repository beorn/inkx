---
description: "Session-end completeness audit. Use when finishing a refactor, migration, or feature to verify nothing was left behind."
argument-hint: "[<what-was-refactored>]"
allowed-tools: Bash, Read, Glob, Grep, Skill, AskUserQuestion
---

# Session Completeness Audit

**Keywords**: complete, done, finish, session end, audit, remnant, leftover

## Context

- Branch: !`git branch --show-current`
- Status: !`git status --porcelain`
- Diff stats: !`git diff --stat HEAD~5 2>/dev/null || git diff --stat`
- Changed files: !`git diff --name-only HEAD~5 2>/dev/null || git diff --name-only`
- In-progress beads: !`bd list --status in_progress 2>/dev/null | head -10 || echo "(none)"`
- Recent commits: !`git log --oneline -5`

## What Was Refactored

$ARGUMENTS

If no argument provided, infer from the diff stats and recent commits above. If unclear, ask the user.

## Procedure

Run all 7 phases sequentially. Collect findings into a structured report. Each phase produces `PASS`, `FLAG` (non-blocking), or `BLOCK` (hard gate).

---

### Phase 1: Refactor Remnant Scan (HARD GATE)

This is the most important phase. Old references survive refactors constantly.

1. From the argument (or inferred from diffs), identify the **old terms** that should no longer appear — old function names, old type names, old config keys, old variable names
2. Grep ALL source for each old term:
   ```
   Grep pattern="<old-term>" glob="*.{ts,tsx}" path="<repo-root>"
   Grep pattern="<old-term>" glob="*.md" path="<repo-root>"
   ```
3. Classify each hit:

| Classification | Verdict | Example |
|---|---|---|
| Active usage (import, call, reference) | **BLOCK** | `import { oldFunc } from ...` |
| Re-export / compat shim | **FLAG** — should be deleted | `export { newFunc as oldFunc }` |
| Test referencing old API | **BLOCK** — test must update | `expect(oldFunc()).toBe(...)` |
| Comment / doc reference | **FLAG** — should update | `// Uses oldFunc for ...` |
| String literal (log msg, error) | **FLAG** — update if misleading | `log("oldFunc called")` |

**Hard gate**: Any BLOCK hit = **INCOMPLETE**.

---

### Phase 2: `/code clean` Dry Run

Run `/code clean --dry-run` on all files that appear in the diff.

Additionally, grep changed files for:

| Pattern | Verdict | Action |
|---|---|---|
| `export { X as Y }` (compat re-export) | **FLAG** | Should delete, not shim |
| `@deprecated` without a tracking bead | **FLAG** | Should delete or create bead |
| `TODO:remove`, `TEMPORARY`, `HACK`, `WORKAROUND` without bead | **FLAG** | Create bead or fix now |

Report findings — do NOT implement changes.

---

### Phase 3: Principles Compliance

Scan changed files for anti-patterns from `docs/principles.md` and `docs/lessons/refactoring.md`:

| Anti-Pattern | Check |
|---|---|
| Compatibility shims | `export { old as new }` or function overloads supporting both signatures |
| Silent fallbacks | `?? defaultValue` masking bugs in internal code |
| `@deprecated` annotations | Should delete, not annotate |
| Dual patterns | Two ways to do the same thing (infection vector) |
| `ensure*` guard checks | Let lower layer throw naturally |
| Getters/setters, pure delegators | Plain properties, direct calls |
| "Finish later" TODOs | Migration must be complete in this session |
| OldWay still exists | Must delete, not deprecate |

Report each finding with file:line and verdict (FLAG or BLOCK).

---

### Phase 4: Test Audit (HARD GATE)

1. Run tests:
   ```bash
   cd /Users/beorn/Code/pim/km ; bun run test:fast | tail -30
   ```
2. Check: do changed source files have corresponding test updates?
   - For each changed `.ts`/`.tsx` in `src/` or `packages/`, look for a test file that was also modified
   - Missing test update = **FLAG** (not always blocking, but notable)
3. Check: are any tests still testing removed/renamed APIs?
   - Grep test files for old terms from Phase 1
   - Test using removed API = **BLOCK**

**Hard gate**: Test failure = **INCOMPLETE**.

---

### Phase 5: Doc Audit

Grep for old/removed terms in documentation:

```
Grep pattern="<old-term>" path="<repo-root>/docs/"
Grep pattern="<old-term>" path="<repo-root>/.claude/skills/"
Grep pattern="<old-term>" path="<repo-root>/CLAUDE.md"
```

Also check:
- `docs/ref/ui.md` if UI state changed
- `MEMORY.md` for outdated references

Each stale doc reference = **FLAG**.

---

### Phase 6: Bead Audit

1. In-progress beads for completed work → **FLAG** (should close)
2. New `@deprecated` / `TODO` / `WORKAROUND` without a tracking bead → **FLAG**
3. Beads synced? Check if `.beads/` appears in `git status`:
   ```bash
   git status --porcelain .beads/ 2>/dev/null
   ```
   Dirty beads = **FLAG** (run `bd sync`)

---

### Phase 7: Git Hygiene (HARD GATE)

1. Lint passes:
   ```bash
   cd /Users/beorn/Code/pim/km ; bun fix
   ```
2. Clean working tree (no uncommitted changes after all fixes)
3. Beads synced (`bd sync`)
4. Pushed to remote
5. No temp/debug files (`*.debug.*`, `*.tmp.*`, `/tmp/km-explore-tests/`)

**Hard gate**: Lint failure or uncommitted changes = **INCOMPLETE**.

---

## Report Template

After all phases, produce this report:

```markdown
## Completeness Audit: <what-was-refactored>

### Phase 1: Remnant Scan
- [ ] No active usage of removed APIs
- Findings: ...

### Phase 2: Code Clean
- [ ] No compat shims, stale TODOs, or untracked deprecations
- Findings: ...

### Phase 3: Principles Compliance
- [ ] No anti-patterns in changed files
- Findings: ...

### Phase 4: Tests
- [ ] Tests pass
- [ ] No tests reference removed APIs
- Findings: ...

### Phase 5: Docs
- [ ] No stale doc references
- Findings: ...

### Phase 6: Beads
- [ ] In-progress beads closed or updated
- [ ] Beads synced
- Findings: ...

### Phase 7: Git Hygiene
- [ ] Lint passes
- [ ] Clean working tree
- [ ] Pushed to remote
- Findings: ...

### Verdict
**COMPLETE** / **INCOMPLETE — N blocking items remain**

Blocking:
1. ...

Flags (non-blocking, should address):
1. ...
```

## Hard Gates (all must pass for COMPLETE)

1. No active usage of removed APIs (Phase 1)
2. Tests pass (Phase 4)
3. Lint passes (Phase 7)
4. No uncommitted changes (Phase 7)

## Anti-Patterns

- Declaring "done" because tests pass — tests don't catch stale docs or compat shims
- Skipping remnant scan when no argument provided — infer from diffs
- Running `/code clean` in implementation mode — always `--dry-run` here
- Ignoring stale docs — they mislead future sessions
- Leaving `@deprecated` annotations — delete, not annotate

## Cross-References

- `/code clean` — invoked in Phase 2
- `/commit` — for committing fixes found during audit
- `/pm` — for bead closure
- `docs/principles.md` — source of Phase 3 compliance checks
- `docs/lessons/refactoring.md` — refactoring anti-patterns
