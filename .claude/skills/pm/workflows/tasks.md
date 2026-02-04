---
description: Task completion workflow - refactoring, cleanup, documentation
---

# Task Implementation Workflow

Workflow for tasks (refactoring, cleanup, docs, dependency updates).

## Staleness Check

If the bead is **older than 1 week**, re-verify requirements before starting. Tasks are particularly prone to staleness — refactoring targets may have already been cleaned up, docs may have been updated, dependencies may have changed. See [SKILL.md Staleness Check](../SKILL.md#staleness-check).

## Common TDD Cycle

For tasks requiring tests (refactoring, moves):

```text
Ensure tests pass (baseline)
  ↓
Make change incrementally
  ↓
bun run test:fast → GREEN
  ↓
Refine if needed
  ↓
Close bead with evidence
```

**Core commands:**

```bash
bun run test:fast    # Verify behavior preserved
bun fix              # Lint + format
bd close <id> --reason "<evidence>"
```

---

## Step 1: Determine if Tests Needed

| Task Type          | Tests?   | Reasoning                    |
| ------------------ | -------- | ---------------------------- |
| Refactoring        | ✅ Yes   | Preserve behavior            |
| Cleanup/formatting | ❌ No    | No logic changes             |
| Documentation      | ❌ No    | Markdown only                |
| Dependency update  | ⚠️ Maybe | Run test:fast to verify      |
| Code move/rename   | ✅ Yes   | Existing tests, update paths |
| Config changes     | ⚠️ Maybe | Depends on impact            |
| Performance        | ✅ Yes   | Verify unchanged + faster    |

**Rule**: Logic changes → tests needed.

---

## Step 2A: Tasks WITH Tests

**For refactoring tasks, read first:**
- [/docs/principles.md](/docs/principles.md) - Architecture patterns, composability
- [/docs/lessons/refactoring.md](/docs/lessons/refactoring.md) - Phase order, breaking vs fixing

**Refactoring:**

```bash
bun run test:fast  # Baseline - should pass

# Refactor incrementally
# After each change:
bun run test:fast  # Should stay GREEN

bun fix            # Final cleanup
```

**Common refactorings:**

```bash
# Extract function
mcp__refactor-typescript__refactoring \
  operation=extract_function \
  filePath=<file> line=<line> text="<code>"

# Rename symbol
mcp__refactor-typescript__refactoring \
  operation=rename \
  filePath=<file> line=<line> text="<symbol>" name="<new-name>"

# Move files (auto-updates imports)
mcp__refactor-typescript__file_operations \
  operation=move_file \
  sourcePath=<old> targetFolder=<new>/

# Organize/cleanup
mcp__refactor-typescript__code_quality \
  operation=organize_imports filePath=<file>
```

**Cross-package refactoring**: Use `/max` to parallelize same refactoring across multiple packages.

---

## Step 2B: Tasks WITHOUT Tests

**Documentation:**

- Write concise, actionable content
- Include code examples
- Link related docs
- No test verification needed

**Cleanup:**

```bash
bun fix              # Auto-fix lint/format
bun run test:fast   # Smoke test
```

---

## Step 3: Close

**With tests:**

```bash
bd close <id> --reason "Completed: <summary>. Tests pass."
```

**Without tests:**

```bash
bd close <id> --reason "Completed: <summary>."
```

---

## Task Examples

**Dependency update:**

```bash
bun update <package>
bun run test:fast  # Verify nothing broke
bd close <id> --reason "Updated <pkg> from v<old> to v<new>. Tests pass."
```

**Performance:**

```bash
# Baseline
bun run test:fast  # Note timing

# Optimize
# Keep behavior identical

# Verify
bun run test:fast  # Faster + passes

bd close <id> --reason "Optimized <what>. Improved from <old> to <new>."
```

---

## Refactoring Safety

**Safe** (behavior-preserving):

- Extract function/variable
- Rename symbol
- Move file
- Inline function
- Change signature (with all call sites)

**Risky** (extra care):

- Control flow changes
- Data structure modifications
- Error handling changes
- Async pattern changes

**For risky:** Consider feature bead with acceptance tests.

---

## Converting Task → Feature

If scope expands:

```bash
bd update <id> --type feature --notes "Scope expanded, needs feature treatment"
# Follow feature-workflow.md instead
```

---

## Anti-Patterns

- ❌ Refactoring unrelated code "while I'm here"
- ❌ Manual file moves (breaks imports - use TS tools)
- ❌ Defensive programming for impossible cases
- ❌ Forgetting to verify tests still pass

---

## Quality Checklist

**Before closing:**

- [ ] Tests pass (if applicable)
- [ ] bun fix passes
- [ ] No console.log left
- [ ] Behavior preserved (for refactoring)
- [ ] Evidence in close reason
- [ ] No scope creep
