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
| `/refactor plan <scope>` | Create a phased plan for architectural changes |
| `/refactor review` | Review existing plan for gaps and risks |
| `/refactor phase <N>` | Execute a specific phase with /complete |
| `/refactor migrate <desc>` | Mechanical migration (50+ files) — batch-refactor + tsc gates |

`/refactor plan` and `/refactor phase` load [pm/workflows/refactor.md](../pm/workflows/refactor.md).
`/refactor migrate` loads [migrate.md](migrate.md) — for type restructurings, field renames, interface changes.

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

3. **Copy = debt until deletion.** When you copy code to a new package, the old copy is now tech debt. In the SAME commit: (a) verify the new copy works, (b) replace the old copy with a re-export from the new location (or delete it entirely), (c) run tests. Never leave both copies as independent implementations — duplicated code that compiles is invisible to tests and types, so it will never be caught unless you fix it now. (See Case Study 7 in docs/lessons/refactoring.md.)

4. **Every new package needs tests in the same commit.** Not "will add tests later." At minimum: `test("exports are defined", () => expect(createFoo).toBeDefined())`. The era2 audit found @silvery/commands shipped with zero tests.

5. **Docstrings document reality, not plans.** Only list APIs that exist. Future APIs belong in design docs (`silvery-internal/design/`), not source code comments. LLMs read docstrings literally — a listed-but-unimplemented function will be called and fail.

6. **Barrel exports = discoverability.** If `withApp()` works and has tests but isn't in the barrel, users can't find it. Export from barrel or don't ship. Subpath-only exports are for internal/advanced use.

7. **Write /complete criteria AFTER scoping, not before.** "grep for X → 0 hits" sounds good in a bead description but may be impossible if X has legitimate internal consumers. Update criteria when you discover the real blast radius.

8. **Audit the entire feature set, not just your session's changes.** `/complete` checks what YOU changed. A systematic feature-by-feature audit (bead promise vs actual code) catches what `/complete` misses: unimplemented promises, missing tests, stale docstrings.

## Phase Completion Protocol

Each phase must end with literal verification, not memory-based checkmarks. The pattern from Case Study 6 (@silvery/style): 8 items marked done that weren't — because nobody verified before checking the box.

1. **Run every /complete criteria grep from the bead description.** If the bead says "grep X in A → 0 hits", run that grep. If it doesn't pass, the phase isn't done.

2. **For each checklist item: verify with grep/ls/read, not from memory.** "Move X from A to B" means: grep X in A (should be 0), grep X in B (should be >0). "Delete Y" means: ls Y (should not exist). "Re-export from Z" means: grep "from.*Z" in the barrel file.

3. **If you deviated from the plan: update the bead description to match reality BEFORE marking done.** Bead says "delete chalk.ts" but you kept it for compat? Valid engineering — but update the bead to say "kept chalk.ts for compat (reason)" instead of marking "delete chalk.ts" as done.

4. **If a checklist item is impossible or unnecessary: mark it as "SKIPPED: reason", not "done".** This prevents bead drift — where the bead describes a world that doesn't exist.

The pattern is: bead says X, you did Y instead — that's fine engineering, but the bead must reflect Y, not X.

## Tribe Coordination

When working on the main worktree (not an isolated git worktree), **notify the tribe before starting disruptive work**:

- Before replacing imports across many files (tests may fail for other sessions)
- Before changing shared config (package.json, tsconfig, .mcp.json)
- Before modifying vendor/ packages that other sessions depend on
- Before any multi-file refactor that could break the build for 5+ minutes

Use `tribe_broadcast` or `tribe_send` to the chief: "Starting disruptive refactor on <scope>. Expect <description> to be broken for ~N min. Don't start <scope>-related work until all-clear."

Send an all-clear when the refactor is stable (tests pass).

**When to use a worktree instead**: If the refactor will take >30 min or touch >20 files, prefer `bun worktree` to avoid disrupting other sessions entirely. Worktrees are free — the overhead of creating one is far less than the cost of blocking the tribe.

## Retrospective (after all phases complete)

After closing a refactoring bead, write a brief retrospective in the bead notes or as a commit message. Include:

### Impact Analysis
- **Lines**: total added/removed across all repos (`git diff --shortstat`)
- **Files touched**: count and categories (new package, migration, docs, tests)
- **Dependencies**: added/removed/moved (e.g., "chalk moved from deps to devDeps")
- **npm**: packages published, version bumps
- **Test delta**: tests added, test files added, coverage changes

### What Went Well
- Techniques that worked (parallel agents, break-then-fix, specific tooling)
- Design decisions that held up under implementation

### What Didn't Go Well
- Bead drift (items marked done that weren't)
- Pragmatic deviations that weren't recorded
- Scope creep or missed scope
- Time spent on unexpected issues

### Value Assessment
- **Before**: describe the problem state (duplication, missing types, stale deps)
- **After**: describe what's better (unified API, validated inputs, fewer deps)
- **Was it worth it?**: honest assessment — some refactors don't pay off
