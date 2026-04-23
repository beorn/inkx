---
description: Maximize parallelization through sub-agents. Use when you have several todos, suspect tasks can be decomposed, or user requests parallel execution.
argument-hint: "[task description or bead IDs]"
---

**Keywords**: parallel, concurrent, sub-agents, decompose, maximize

# Maximum Parallelization Mode

**User Request**: $ARGUMENTS

## Step 1: Decompose (MANDATORY)

Analyze the user's request and break it into independent work units. Ask:

1. **What distinct areas/packages/files are affected?** → One agent per area
2. **What research is needed before implementation?** → Background agents
3. **What can run simultaneously vs. sequentially?** → Dependencies

Create a todo list with TodoWrite showing ALL work units.

## Step 2: Classify Work Units

| Category           | Pattern                       | Action                                   |
| ------------------ | ----------------------------- | ---------------------------------------- |
| Multi-area changes | Same change across N packages | N parallel Task agents (general-purpose) |
| Research + impl    | Need info before coding       | Background Explore agent + continue      |
| Multi-file edits   | Same pattern across files     | Parallel Read → Parallel Edit            |
| Independent tasks  | Unrelated subtasks            | Parallel Task agents                     |
| Verification       | Type-check, lint, test        | 3 parallel Bash calls                    |
| Batch refactoring  | Same technique on N functions  | N parallel Task agents (5 max per batch) |
| Complex projects   | 3+ tasks with coordination    | TeamCreate + teammate agents             |

## Step 3: Launch Agents (MANDATORY)

**Choose the right execution model:**

### Option A: Parallel Task agents (fire-and-forget, no coordination)

Best for independent tasks that don't need to communicate. **In a SINGLE message**, launch all independent Task agents:

```
→ Task 1: subagent_type="general-purpose", prompt="Add logging to @km/storage. Follow @km/core logger patterns."
→ Task 2: subagent_type="general-purpose", prompt="Add logging to km-cli. Follow @km/core logger patterns."
→ Task 3: subagent_type="general-purpose", prompt="Add logging to km-tui. Follow @km/core logger patterns."
```

**For research-first tasks**, launch in background and block-wait:

```
→ Task: subagent_type="Explore", run_in_background=true, prompt="Find all X patterns..."
→ Continue with known work while research runs
→ TaskOutput(task_id=<id>, block=true, timeout=600000) to retrieve results
```

**Never poll output files manually** (sleep + read loops waste turns). `TaskOutput(block=true)` handles the wait.

### Option B: Agent teams (coordinated, shared task list)

Best for complex projects (3+ tasks) where agents need to coordinate, share progress, or have dependencies. Use `TeamCreate` to create a team, `TaskCreate` for the shared task list, then spawn teammates with `Task(team_name=...)`:

```
1. TeamCreate(team_name="feature-x")
2. TaskCreate tasks for each work unit
3. Task(team_name="feature-x", name="researcher", subagent_type="general-purpose", prompt="...")
4. Task(team_name="feature-x", name="implementer", subagent_type="general-purpose", prompt="...")
5. Assign tasks via TaskUpdate, coordinate via SendMessage
```

**Prefer teams when:** tasks have dependencies, need shared state, or require back-and-forth coordination. **Prefer parallel Task agents when:** tasks are fully independent and need no communication.

## Step 4: Synthesize & Verify

After agents complete:

1. Review results for conflicts or integration issues
2. **Full suite** (`bun fix && bun run test:all`) runs ONCE from the parent — sub-agents skip this
3. Update todos as completed

### Agent Self-Verification (MANDATORY)

Sub-agents skip the full suite but **MUST self-verify** before claiming done:

1. **Per-step tsc**: After each major change, run `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/ | wc -l` and report the actual count
2. **Per-package tests**: Run `bun vitest run <package>/tests/` after modifying each package
3. **Evidence in completion message**: "Done" must include actual command output (error count, test count), not assertions like "all tests pass"
4. **Commit incrementally**: After each package/step, commit. Don't batch everything to the end — uncommitted work in worktrees gets lost

**Never tell agents "don't run tests."** Say: "Skip `bun fix` and `bun run test:all` (parent handles full suite). DO run `tsc --noEmit` and per-package `vitest run` to verify your own work."

**Why**: In session 0401b, an agent claimed "0 migration errors" when 443 TS errors remained. It had no feedback loop because the prompt said "parent handles all verification." The agent inferred completion from its own edits instead of checking. Trust-based completion claims don't work — require evidence.

## Prompt Structure for Migration Agents

For agents doing large migrations (interface changes, renames, field restructuring):

1. **Lead with the definition change** — the interface/type/schema modification comes FIRST, not buried among consumer updates
2. **Top-down execution order** — change the definition, THEN fix consumers. Never bottom-up (consumers first creates the illusion of progress without the core change)
3. **Mandatory verification after the definition change** — "After changing the interface, run `npx tsc --noEmit 2>&1 | grep error | wc -l`. You should see ~N errors. Report the actual count before continuing."
4. **Commit after the definition change** — don't wait until all consumers are fixed. Commit the interface change first, then commit consumer updates incrementally
5. **Use batch-refactor for mechanical consumer updates** — `bun vendor/bearly/tools/refactor.ts` for find-replace patterns across 100+ files

## Large Migrations (50+ files): Use /refactor migrate, NOT Agents

For type restructurings, field renames, or interface changes touching 50+ files: **don't assign an agent to manually edit each file.** Agents hallucinate completion on mechanical transforms. Instead, use `/refactor migrate`:

1. Agent analyzes the migration (blast radius, edge cases)
2. Agent writes batch-refactor commands (the transform spec)
3. Commands execute mechanically — 100% reproducible
4. tsc + tests verify — 100% reliable
5. Agent handles the ~10% edge cases that need judgment

**The agent's value is understanding the pattern, not applying it 189 times.** See `.claude/skills/refactor/migrate.md`.

## Isolation: When to Use Worktrees

**Don't assume you're the only agent.** Other agents may be working on the same repo concurrently.

### HARD RULE: 2+ agents on the same submodule = worktree-isolate every agent

If you're spawning two or more agents that will touch files inside the **same** `vendor/<pkg>/` submodule (silvery, bearly, flexily, loggily, termless, etc.), **every such agent MUST use `isolation: "worktree"`** — no exceptions based on blast-radius classification. This rule supersedes the blast-radius table below whenever it applies.

**Why:** The 2026-04-20 backdrop+themedetect incident had exactly TWO agents on vendor/silvery and the failure already happened (orphaned commits + lying bead closure). Two is sufficient. The 2026-04-22 hook-router /max run repeated the rule violation (Agent A + Agent B both on vendor/bearly without isolation); it worked only because the agents happened to touch disjoint files — discipline, not luck, should be what prevents collisions.

Checklist before launching the Agent calls:

- Count: how many agents in this `/max` batch will write to `vendor/<same-pkg>/`?
- If ≥ 2: add `isolation: "worktree"` to **every one of them** that touches that submodule, and append the CRITICAL commit block below
- After launching: verify with `git worktree list --porcelain` that each worktree entry actually exists. `isolation: "worktree"` can fail silently.
- Canonical memory: [feedback-worktree-shared-submodule.md](/Users/beorn/.config/claude-profiles/bjorns@gmail.com/projects/-Users-beorn-Code-pim-km/memory/feedback-worktree-shared-submodule.md)

### Blast-radius classification (applies when the submodule rule doesn't force isolation)

| Blast Radius | Examples | Isolation |
|---|---|---|
| **Foundational** — changes to core libraries, rendering engines, test infrastructure, storage layer | silvery output phase, flexily layout, km-storage schema, vitest config | **Worktree** (`isolation: "worktree"`) — breakage here breaks every other agent |
| **Cross-cutting migrations** — type changes touching 50+ files across packages | item-as-object, field renames, API restructuring | **NO worktree** — agent needs main state. Use batch-refactor on main. |
| **Cross-cutting additive** — touches multiple packages but additive-only | New shared utility, package.json scripts | **Worktree** preferred, shared OK |
| **Leaf** — isolated to one app/component, no downstream consumers | km-tui view component, CLI command handler, single test file | **Shared workspace** (default) — low risk of conflicts |

**Worktree commit rules (CRITICAL):**
- Agents in worktrees **MUST commit** their changes (worktrees are cleaned up when no commits exist, losing all work)
- **Every worktree agent prompt MUST end with explicit commit instructions.** Append this block to the END of every `isolation: "worktree"` prompt:

  > CRITICAL: You are in a worktree. You MUST commit before finishing.
  > Uncommitted work is DESTROYED when the worktree is cleaned up.
  > Commit early and often with conventional commits. Your final message
  > MUST include the commit SHA as proof.

  **Why this is mandatory**: In the @silvery/selection session, three agents lost ALL their work because they finished without committing. The worktree cleanup destroyed hours of work. General "commit incrementally" guidance is not enough — agents need the instruction at the END of the prompt (where it's freshest in context) with CRITICAL-level urgency.

- Use `bun worktree merge <name>` from main to integrate after

**If `isolation: "worktree"` fails** (e.g., WorktreeCreate hook error, uncommitted changes): fall back to shared workspace but sequence foundational agents — don't run two foundational agents on the same package concurrently.

## Anti-Patterns

- Launch agents one at a time, waiting for each
- Do research yourself when an Explore agent could do it in background
- Edit files one at a time when pattern is clear
- Skip TodoWrite (user can't see your parallel progress)
- Let sub-agents run `bun fix` or `test:all` (parent does this once)
- Assume you're the only agent — other sessions/agents may be working on the same repo
- Run two foundational agents on the same package without isolation
- Tell agents "don't run tests" without giving them tsc + per-package vitest as self-checks
- Trust agent "done" claims without evidence (actual command output)
- Let agents batch all commits to the end — require incremental commits per step
- Give agents 3,000-word prompts that bury the critical step among mechanical ones — lead with the interface/definition change, then consumer updates
- Spawn worktree agents without the CRITICAL commit block at the end of their prompt

## Lead Agent Responsiveness (CRITICAL)

When using teams, the lead (you) must **delegate ALL implementation to teammates** and remain free for conversation with the user. The lead's job is:

1. **Decompose** — break work into tasks
2. **Delegate** — assign tasks to teammates
3. **Coordinate** — relay context, resolve conflicts, unblock teammates
4. **Report** — summarize progress when asked
5. **Verify** — run final `bun fix && bun run test:all` after teammates finish

The lead must **never** do implementation work directly when teammates are available. If you're editing code, you're blocking conversation. If the user sends a message, you should be able to respond immediately — not after finishing a 200-line refactor.

**Anti-pattern**: Lead creates a team, then does all the work itself while teammates sit idle.
**Correct**: Lead creates tasks, spawns teammates, assigns work, and stays in a tight respond-to-user loop.

## Sticky Mode

Once `/max` is invoked or user requests parallelization:

- **All subsequent work in this session should maximize parallelization**
- Proactively decompose new tasks into parallel units
- Continue using TodoWrite + parallel Task agents for all multi-step work
- This mode persists until session end or user explicitly requests sequential execution

## Execute Now

Decompose, create TodoWrite, launch ALL independent agents in ONE message, report plan. Stay in parallel mode for rest of session.
