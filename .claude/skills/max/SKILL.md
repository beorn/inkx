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

## Step 3: Launch Agents (MANDATORY)

**In a SINGLE message**, launch all independent Task agents. Do NOT launch sequentially.

Example for "add logging to storage, cli, and tui":

```
→ Task 1: subagent_type="general-purpose", prompt="Add logging to @km/storage. Follow @km/core logger patterns."
→ Task 2: subagent_type="general-purpose", prompt="Add logging to km-cli. Follow @km/core logger patterns."
→ Task 3: subagent_type="general-purpose", prompt="Add logging to km-tui. Follow @km/core logger patterns."
```

**For research-first tasks**, launch Explore in background:

```
→ Task: subagent_type="Explore", run_in_background=true, prompt="Find all X patterns..."
→ Continue with known work while research runs
→ TaskOutput to retrieve results
```

## Step 4: Synthesize & Verify

After agents complete:

1. Review results for conflicts or integration issues
2. Run parallel verification: `bun fix` + `bun run test:fast` (if code changed)
3. Update todos as completed

## Anti-Patterns (NEVER DO)

- ❌ Launch agents one at a time, waiting for each
- ❌ Do research yourself when an Explore agent could do it in background
- ❌ Edit files one at a time when pattern is clear
- ❌ Run verification steps sequentially
- ❌ Skip TodoWrite (user can't see your parallel progress)

## Sticky Mode

Once `/max` is invoked or user requests parallelization:

- **All subsequent work in this session should maximize parallelization**
- Proactively decompose new tasks into parallel units
- Continue using TodoWrite + parallel Task agents for all multi-step work
- This mode persists until session end or user explicitly requests sequential execution

## Execute Now

1. **Decompose** the user's request into work units
2. **Create TodoWrite** with all identified work units
3. **Launch ALL independent Task agents in ONE message**
4. **Report** the parallel execution plan to the user
5. **Remember**: Stay in parallel mode for rest of session
