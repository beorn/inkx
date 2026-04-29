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

## Isolation: claim a pool slot, don't create a new branch

**Use the worktree pool. Don't spawn `Agent({isolation: "worktree"})` for write work.**

The repo has a persistent pool: `.claude/worktrees/wt1`..`wt9`, each on a stable branch `wtN`. Lease beads `km-wt1`..`km-wt9` (parented under `km-wt`) are the locks. Slots are recycled in place — never destroyed, never per-task.

Per CLAUDE.md "Branches and worktrees — the standing rule": ephemeral per-task branches caused branch-namespace pollution and silent HEAD-hops in the main repo. Pool slots use stable named branches (`wtN`) and bounded concurrency.

### How to spawn a write-agent in /max

For each independent unit of write work:

1. **Claim a pool slot:**
   ```bash
   km bd update km-wtN --claim   # pick the lowest-numbered open slot
   ```
2. **Refresh the slot:**
   ```bash
   cd .claude/worktrees/wtN && git fetch origin && git rebase origin/main && git submodule update --recursive
   ```
3. **Spawn the agent into the slot.** Pass the slot path in the prompt; do NOT pass `isolation: "worktree"`. The agent works in the existing pool slot, commits to branch `wtN`.
4. **On agent finish:** lead cherry-picks `wtN` tip onto `main`, pushes, resets `wtN` back to `origin/main`, runs `git submodule update --recursive`, then `km bd close km-wtN`. The slot is now free for the next claim.

### When to use `isolation: "worktree"` (rare)

Only when: (a) the pool is full (all 9 slots claimed), (b) the agent is read-only and write isolation isn't needed (use Explore subagent in main instead — even better), or (c) the work is so short-lived that pool churn isn't worth it (sub-second one-shots — but those usually don't need isolation at all).

**Default: pool slot. Fallback only if pool is full.**

### HARD RULE: 2+ write-agents on the same submodule

When ≥ 2 agents will write to `vendor/<pkg>/` (silvery, bearly, flexily, loggily, termless, etc.), **each agent MUST be in its own pool slot** (or fallback worktree). Never let two write-agents share a working tree on the same submodule.

**Why:** silent corruption — orphaned commits, lying bead closure, format-reflow commits sweeping up half-staged work from the other agent. The 2026-04-20 backdrop+themedetect incident, the 2026-04-22 hook-router run, and the 2026-04-29 branch-hop on the bug/@km/bearly/worktree-merge-origin-race-preflight branch — all variants of the same root cause.

### Blast-radius classification

| Blast Radius | Examples | Isolation |
|---|---|---|
| **Foundational** — changes to core libraries, rendering engines, test infrastructure, storage layer | silvery output phase, flexily layout, km-storage schema, vitest config | **Pool slot** (always). Foundational breakage cascades; isolation is mandatory. |
| **Cross-cutting migrations** — type changes touching 50+ files across packages | item-as-object, field renames, API restructuring | **NO isolation** — use `/refactor migrate` on main. Migration is mechanical, not agentic. |
| **Cross-cutting additive** — touches multiple packages but additive-only | New shared utility, package.json scripts | Pool slot if any chance of conflict; main if read-only |
| **Leaf** — isolated to one app/component | km-tui view component, single test file | Pool slot still preferred; main acceptable for truly localized changes per the standing rule |

### Pool agent protocol (append to every /max write-agent prompt)

When the lead spawns an agent into a pool slot, include this in the prompt:

> CRITICAL: You are in pool slot `.claude/worktrees/wtN/` on branch `wtN`. The slot was rebased on `origin/main` before you started.
> - Commit incrementally to branch `wtN` with conventional commits. **Do NOT** create a new feature branch — that's exactly what the pool model replaces.
> - **Do NOT push to origin** — the local branch is the deliverable; the lead session integrates via cherry-pick.
> - When you finish, send a final message with: `wtN`, the worktree path, local SHA from `git rev-parse HEAD`, files changed (absolute paths), tests added/updated (paths + counts), and self-verify output (actual `tsc --noEmit | grep "error TS" | wc -l` count, vitest pass/skip/fail breakdown — not assertions).
> - Do NOT close the bead `km-wtN` yourself — that's the lead's job after integration.

**Integration is the lead's job.** After the agent reports done:
```bash
cd /Users/beorn/Code/pim/km   # main repo
git cherry-pick <wtN-tip-sha>   # or git merge --ff-only wtN
git push origin main
cd .claude/worktrees/wtN && git fetch origin && git reset --hard origin/main && git submodule update --recursive
km bd close km-wtN --reason "shipped <main-tip-sha>"
```

**If pool fallback is needed** (`Agent({isolation: "worktree"})` because pool is full): the auto-clone uses APFS `cp -c -R` (~20-25s). Verify with `ls .claude/worktrees/` after spawn. Fallback agents commit to `wip/<bead-id>` branches; lead integrates via `git fetch <worktree-path> wip/<bead-id>:wip/<bead-id>` then cherry-pick. Branch gets garbage-collected when the clone is removed.

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
- Mandate `git push origin` from worktree agents (legacy: this was scar tissue from lost-work incidents; replaced by the eventual-consistency model + `/sop infra wip-triage`)

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
