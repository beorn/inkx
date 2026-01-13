---
description: Maximize parallelization through sub-agents for research, analysis, and implementation
---

# Maximum Parallelization Mode

Work with **maximum parallelization**. Follow CLAUDE.md parallelization guidelines aggressively.

## Beyond the Basics

The CLAUDE.md section covers tool-level parallelization. This command enables **aggressive** patterns:

### Sub-Agent Parallelization

Launch multiple Task agents in a SINGLE message:

```
User: "Add logging to mail, tasks, and agent packages"
→ Task 1: Add logging to packages/mail/
→ Task 2: Add logging to packages/tasks/
→ Task 3: Add logging to packages/agent/
```

**When to use sub-agents:**

- Researching 3+ related but independent topics
- Implementing across multiple packages simultaneously
- Running different analysis types (security, performance, architecture)
- Refactoring different subsystems concurrently

### Async Sub-Agents (Background)

Launch Task agents in background, continue work, retrieve results later:

```typescript
// Launch async agent
Task(
  prompt: "Research auth patterns",
  subagent_type: "Explore",
  run_in_background: true  // ← Non-blocking!
)
// Returns agentId: "abc123"

// Continue other work...

// Retrieve results later:
AgentOutputTool(agentId: "abc123", block: true)
```

**When to use async agents:**

- Research while implementing other features
- Deploy monitoring while doing other work
- Long investigations that shouldn't block you

### MCP Zen Parallel Tools

- `consensus`: Consult multiple models simultaneously
- `codereview`: Multi-model code review
- `thinkdeep`: Multi-stage investigation

### Often Overlooked Opportunities

- **Type checking + linting + tests**: Three parallel Bash calls
- **Documentation**: README, CHANGELOG, inline docs simultaneously
- **Schema updates**: Update Zod schemas across multiple files at once
- **Error handling**: Add try/catch to multiple functions in one message
- **Import updates**: Add imports to 10+ files in one message

### Patterns

**Refactoring:**

```
→ Grep for pattern (one search)
→ Read all matching files (parallel reads)
→ Edit ALL files in ONE message (parallel edits)
→ Run type-check + lint + test (parallel bash)
```

**Multi-Package Work:**

```
→ Launch N parallel Task agents, one per package
→ Each agent batches its own operations internally
→ Synthesize results after all complete
```

**Research + Fix:**

```
→ Grep for TODOs across packages
→ Read all TODO files (parallel)
→ Fix independent TODOs (parallel edits)
```

## Current Task

Apply maximum parallelization to the user's request. Identify ALL opportunities. Default to batching. Use sub-agents for multi-area work.
