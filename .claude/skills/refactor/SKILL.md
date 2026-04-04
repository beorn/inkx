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

## When to Use Which

**`/refactor plan`** — the code's **shape** changes (new types, new packages, new layers):
- Extracting a package from a monolith
- Decomposing a monolithic type/function into composable parts
- Splitting a large file/module into multiple
- Adding a new abstraction layer (e.g., Board.apply pure reducer)
- Any architectural change that needs phased planning

**`/refactor migrate`** — the code's shape stays the same, just **names/types change** across many files:
- Rename a field/type across 50+ files (`task_marker` → `item.task.marker`)
- Change an interface and update all consumers (`item: boolean` → `item: ItemData`)
- API migration where 80%+ of changes are mechanical find-replace
- Any migration where batch-refactor can handle the bulk

**Decision rule**: If you could write a codemod/regex to do 80% of the work, use `/refactor migrate`. If each file needs different judgment about what to change, use `/refactor plan`.

**They compose**: A large refactor might use `/refactor plan` for the architecture (Phase 1: new type, Phase 2: new package) and `/refactor migrate` within a phase for the mechanical consumer updates.

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

## Phase Completion Protocol (MANDATORY — enforced, not advisory)

**Closing a bead without running its acceptance criteria is a bug.** The definition of done is not "I did a lot of work." It's "every acceptance grep returns the expected result."

### The gate: acceptance criteria MUST pass before `bd update -s closed`

1. **Run every /complete criteria grep from the bead description.** Literally run the command. If it doesn't pass, the bead stays open. No exceptions.

2. **Report actual numbers, not claims.** "0 hits" must come from a grep you just ran, not from your belief. Paste the command output.

3. **If criteria can't be met: update the bead, don't close it.**
   - Discovered the scope is larger than expected? Update the bead description with the real scope. Keep it open.
   - Got 80% done and ran out of time? Update notes with what's done, what's remaining, and exact counts. Keep it open.
   - Decided some items are unnecessary? Mark them "SKIPPED: reason" in the bead. Don't silently close.

4. **Never close a bead with known remaining work.** This is the #1 failure mode. "I'll track the rest in a follow-up" = the rest never happens. If there's remaining work, the bead stays open until it's either done or explicitly split into a tracked follow-up with its own acceptance criteria.

5. **If you deviate from the plan: update the bead BEFORE closing.** Bead says "delete X" but you kept X? Update the bead to say "kept X (reason)" and adjust the acceptance criteria.

### What "done" means for migrations

A migration bead with grep acceptance criteria (e.g., `grep "oldPattern" → 0 hits`) is **not done** until:
- The grep returns 0
- Tests pass
- No compat wrappers, re-exports, or bridges keeping the old pattern alive
- No "deprecated" annotations standing in for actual deletion

"Deprecated" is NOT "done." Deprecated fields with 299 references = 299 references, not done.

### For agents closing beads

When an agent claims a bead and tries to close it, it MUST:
1. Run ALL acceptance criteria from the bead description
2. Include the actual command output in its completion message
3. If any criteria fails: report what passed and what didn't, leave bead open
4. Never use words like "mostly done" or "remaining work is minor" as justification for closing

### Case studies (why this matters)

- **selection.4**: Agent closed bead claiming "per-pane sel done." Acceptance said `grep cursorNodeId → 0`. Reality: 299 hits. Bead had to be reopened.
- **@silvery/style** (Case Study 6): 8 phase items marked done that weren't — nobody ran the greps before checking the box.
- **ColumnState/CardState**: Each session found "still has consumers" and deferred to next phase. The old types survived indefinitely.

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
