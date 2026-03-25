---
description: Plan and execute large refactors — phased migrations, API redesigns, package extractions. Use when a refactor spans multiple files/packages and needs a plan with phases, /complete criteria, and zero-WIP discipline.
argument-hint: [plan|review|phase]
allowed-tools: Task, Read, Glob, Grep, Bash, Agent, Edit, Write, AskUserQuestion
---

# Refactor — Large-Scale Refactoring Plans

**Keywords**: refactor, migration, extract, decompose, split, rename, redesign, phase

Plans and executes large refactors with phased discipline. Not for small renames or one-file cleanups — use `/code clean` for those.

## MANDATORY FIRST STEP

**Read [docs/lessons/refactoring.md](../../docs/lessons/refactoring.md) IN FULL before proceeding.** This is not optional. Use the `Read` tool to read the entire file now — every case study, every lesson. The reasoning behind the rules matters as much as the rules themselves. If you skip this, you will repeat the mistakes documented in it.

## Quick Actions

| Command | Purpose |
|---|---|
| `/refactor plan <scope>` | Create a phased plan |
| `/refactor review` | Review existing plan for gaps and risks |
| `/refactor phase <N>` | Execute a specific phase with /complete |

All commands load the refactoring workflow at [pm/workflows/refactor.md](../pm/workflows/refactor.md).

## When to Use

- Extracting a package from a monolith
- Decomposing a monolithic type/function into composable parts
- Migrating from OldAPI to NewAPI across many consumers
- Splitting a large file/module into multiple
- Any change touching 10+ files that can't be done atomically

## Package Extraction Rules (from era2)

When extracting packages from a monolith:

1. **Rename first, split later.** If the monolith is being renamed (e.g., @silvery/tea → @silvery/create), do the rename as one atomic operation before splitting into sub-packages. Renaming while splitting causes combinatorial breakage.

2. **One package per session.** Extract one package fully (copy → delete from old → fix breaks → test) before starting the next. Extracting 5 packages in parallel leads to shallow implementations (copy without delete, missing tests).

3. **Copy = debt until deletion.** When you copy code to a new package, the old copy is now tech debt. Either delete the old copy in the same commit, or create a tracking bead with explicit scope. Never leave both copies "temporarily."

4. **Every new package needs tests in the same commit.** Not "will add tests later." At minimum: `test("exports are defined", () => expect(createFoo).toBeDefined())`. The era2 audit found @silvery/commands shipped with zero tests.

5. **Docstrings document reality, not plans.** Only list APIs that exist. Future APIs belong in design docs (`silvery-internal/design/`), not source code comments. LLMs read docstrings literally — a listed-but-unimplemented function will be called and fail.

6. **Barrel exports = discoverability.** If `withApp()` works and has tests but isn't in the barrel, users can't find it. Export from barrel or don't ship. Subpath-only exports are for internal/advanced use.

7. **Write /complete criteria AFTER scoping, not before.** "grep for X → 0 hits" sounds good in a bead description but may be impossible if X has legitimate internal consumers. Update criteria when you discover the real blast radius.

8. **Audit the entire feature set, not just your session's changes.** `/complete` checks what YOU changed. A systematic feature-by-feature audit (bead promise vs actual code) catches what `/complete` misses: unimplemented promises, missing tests, stale docstrings.
