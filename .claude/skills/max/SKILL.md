---
description: Maximize parallelization through sub-agents. Use when you have several todos, suspect tasks can be decomposed, or user requests parallel execution.
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
2. **Run verification ONCE from the parent agent only:**
   ```bash
   bun fix && bun run test:all
   ```
   Sub-agents must NOT run `bun fix`, `test:fast`, or `test:all` — the parent handles all verification.
3. Update todos as completed

## Isolation: When to Use Worktrees

**Don't assume you're the only agent.** Other agents may be working on the same repo concurrently. Classify each work unit by blast radius:

| Blast Radius | Examples | Isolation |
|---|---|---|
| **Foundational** — changes to core libraries, rendering engines, test infrastructure, storage layer | silvery output phase, flexily layout, km-storage schema, vitest config | **Worktree** (`isolation: "worktree"`) — breakage here breaks every other agent |
| **Cross-cutting** — touches multiple packages or shared types | Type changes, shared utility updates, package.json scripts | **Worktree** preferred, shared OK if changes are additive-only |
| **Leaf** — isolated to one app/component, no downstream consumers | km-tui view component, CLI command handler, single test file | **Shared workspace** (default) — low risk of conflicts |

**Worktree rules:**
- Agents in worktrees **MUST commit** their changes (worktrees are cleaned up when no commits exist, losing all work)
- Tell agents explicitly: "Commit your changes with conventional commits before finishing"
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

## Sticky Mode

Once `/max` is invoked or user requests parallelization:

- **All subsequent work in this session should maximize parallelization**
- Proactively decompose new tasks into parallel units
- Continue using TodoWrite + parallel Task agents for all multi-step work
- This mode persists until session end or user explicitly requests sequential execution

## Execute Now

Decompose, create TodoWrite, launch ALL independent agents in ONE message, report plan. Stay in parallel mode for rest of session.
