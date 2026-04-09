# Autoresearch: Code Quality

> Autonomous code quality improvement. Reduce warnings, complexity, and dead code
> while maintaining or improving test coverage.

## Your Mission

Improve km's code quality score **without breaking tests or regressing performance**.
Make the code more DRY, concise, clear, and internally consistent. Each experiment
is a small, focused improvement. You never stop — iterate until interrupted.

## Setup (once per session)

```bash
cd /Users/beorn/Code/pim/km

# 1. Agree on a run tag with the human (e.g., "q-mar23")
RUN_TAG="<tag>"
git checkout -b autoresearch/$RUN_TAG

# 2. Read this file
# 3. Run baseline
bun infra/autoresearch/run-quality.ts --baseline
```

## Experiment Loop (repeat forever)

### 1. Choose an experiment

Pick ONE focused improvement from these categories, in priority order:

#### A. Fix lint warnings/errors (highest impact on score)

```bash
bun run lint 2>&1 | head -60   # See current warnings
```

Pick a warning, understand it, fix it properly. Don't just suppress with comments.
Common patterns:

- **Unused variables/imports**: Remove them
- **Type safety**: Replace `any` with proper types
- **Promise handling**: Add proper await/error handling
- **Unnecessary conditions**: Simplify boolean logic

#### B. Reduce complexity (refactor high-complexity functions)

```bash
bun lint:complexity --brief 2>/dev/null | head -10  # Worst offenders
```

Pick the highest-complexity function and refactor:

- Extract helper functions for distinct phases
- Replace nested if/else with early returns
- Replace switch chains with lookup objects
- Extract complex conditions into named predicates

**Budget**: Each refactored function should be ≤30 cognitive complexity after.
**Rule**: Don't refactor exhaustive switches or React render functions (they're inherently branchy).

#### C. Remove dead code

- Unused exports (grep for import sites)
- Unreachable branches
- Commented-out code blocks
- Deprecated functions with no callers

#### D. Improve DRY (extract shared patterns)

- Find 3+ identical code blocks → extract utility
- Find repeated type assertions → create typed helper
- Find copy-pasted validation → extract shared validator

**Rule**: Only extract if the shared pattern has 3+ call sites. Two similar blocks
are NOT worth abstracting — the abstraction adds more complexity than it saves.

#### E. Improve test coverage (add missing tests)

- Find exported functions with no tests
- Add tests for edge cases found during refactoring
- Add tests for code you changed (prove it still works)

**Rule**: Tests should be at the right layer (see .claude/skills/tests/SKILL.md).
Journey tests (user-visible behavior) > unit tests (implementation details).

### 2. Implement the change

Keep changes minimal — one improvement per experiment.

### 3. Commit

```bash
git add -A
git commit -m "quality: <one-line description>"
```

### 4. Run measurement

```bash
bun infra/autoresearch/run-quality.ts
```

This measures lint warnings, complexity, LOC, test count, and produces a verdict.

### 5. Act on verdict

**If KEEP**: The commit stays. Move to the next experiment.

**If DISCARD**: Revert and try something else.

```bash
git revert HEAD --no-edit
```

### 6. Never stop

Go back to step 1.

## Decision Criteria

An experiment is **KEEP** when ALL of these hold:

1. **Quality improved**: Score increased (fewer warnings, less complexity, or more tests)
2. **Tests pass**: All existing tests still pass
3. **No regressions**: No new lint errors, no test count decrease
4. **Code didn't grow much**: If LOC increased >20, the improvement must be proportional

An experiment is **STRONG KEEP** when:

- ≥5 warnings removed, OR
- ≥20 total complexity points reduced, OR
- Quality score improved by ≥20

An experiment is **DISCARD** when ANY of these hold:

- Tests fail or test count decreased
- Lint errors increased
- Warnings increased without complexity decrease
- Score didn't improve

## What You Can Edit

**Fair game** (these packages have measurable quality signals):

- `apps/km-tui/src/` — TUI views, hooks, state
- `apps/km-cli/src/` — CLI commands, importers
- `packages/km-storage/src/` — Storage, sync, queries
- `packages/km-markdown/src/` — Parser, serializer
- `packages/km-board/src/` — Board state, columns
- `packages/km-core/src/` — Core types, utilities
- `packages/km-tree/src/` — Tree display
- `packages/km-commands/src/` — Command system

**Off limits**:

- `vendor/` — Submodules (fix directly in their repos)
- `infra/autoresearch/` — This tooling
- `benchmarks/` — Benchmark files
- `.claude/` — Skill files

## Tips

- **Start with lint warnings** — they're the easiest to fix and have the highest score impact.
  Each warning removed = +1 to the score. An error removed = +10.
- **Complexity refactoring has high risk** — always run tests after. Start with functions
  that have clear phase boundaries (setup → process → cleanup).
- **Don't move code between files** unless it eliminates an import cycle or makes an API
  boundary cleaner. File moves create merge conflicts for other branches.
- **Dead code is free score** — removing unused exports/functions improves LOC without risk.
- **Read the function before refactoring** — understand WHY it's complex. Sometimes complexity
  is inherent (state machines, parsers). Don't make it worse by adding indirection.
- **One test added = +0.5 score** — modest but compounds. Add tests when you refactor to
  lock in the behavior.
