# Agents

> **Status: Implemented** — Available in `@km/agent` package and `km agent` CLI.

AI agent orchestration for km.

---

## Quick Start

```bash
# List agents
km agent ls

# Spawn a new agent
km agent spawn reviewer --harness code-reviewer

# Run agent with prompt
km agent run reviewer "Review the auth module"

# Interactive chat
km agent chat reviewer

# View agent sessions
km agent sessions reviewer
```

See `km agent --help` for full command reference.

---

## Overview

Agents are AI-powered workers that can claim tasks, execute sessions, and communicate with each other. Each agent is equipped with a **harness** — a preconfigured set of tools and data connectors.

### Design Principles

1. **Agents are pure functions**: Events in → Events out. No hidden side effects.
2. **Agents are nodes**: Agent identity and config stored in the node tree
3. **Harnesses equip agents**: Tools + connectors + constraints bundled together
4. **Work queues via hierarchy**: Agent's children (or symlinks) define its queue
5. **Session logging**: Full conversation transcripts recorded as events
6. **Simple IPC**: Unix socket for real-time notifications
7. **Hub for orchestration**: `km hub` provides a TUI dashboard for coordinating multiple agents

### Pure Function Guarantee

Agents produce events, not side effects. This enables:

- **Undo** — Replay events up to a point, or emit compensating events
- **Replay** — Reproduce any agent run with the same inputs
- **Approval gates** — Effect handlers can require human approval before executing
- **Dry-run mode** — See what an agent would do without doing it
- **Audit trail** — Every action is logged with timestamp and source

Effect handlers at the edge turn events into real actions (send email, push notification, etc.).

### Kimmi: The Default Agent

**Kimmi** is the Knowledge Machine's built-in agent — the assistant you interact with by default. Kimmi comes with a general-purpose harness and can be customized or extended.

---

## Architecture

```
.km/
├── changes.jsonl      # Source of truth (includes session logs)
├── events.sock       # Unix socket for IPC (runtime only)
└── state.db          # SQLite snapshot (gitignored)
```

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Runtime                                              │
│                                                             │
│  Agent ──► claim task ──► emit() ──► changes.jsonl           │
│    │                                      │                 │
│    │                                      ▼                 │
│    │                               Unix socket              │
│    │                                      │                 │
│    ▼                                      ▼                 │
│  Execute session                    Other agents            │
│    │                               (subscribers)            │
│    ▼                                                        │
│  emit(session_message, session_tool_call, ...)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Harnesses

A **harness** is a preconfigured bundle that equips an agent with:

- **Tools**: What the agent can do (read files, write code, run tests, etc.)
- **Connectors**: External services the agent can access (GitHub, Linear, Slack, etc.)
- **Constraints**: Limits on the agent's behavior (read-only, max files, etc.)

### Harness Definition

```yaml
# .km/harnesses/code-reviewer.yaml
harness:
  name: code-reviewer
  description: "Reviews code for quality and correctness"

  tools:
    - read_file
    - write_file
    - run_tests
    - search_codebase

  connectors:
    - github:
        permissions: [read, comment]
    - linear:
        permissions: [read, update]

  constraints:
    read_only: false
    max_files_per_session: 20
    allowed_paths:
      - "src/**"
      - "tests/**"
```

### Built-in Harnesses

| Harness         | Description               | Tools               |
| --------------- | ------------------------- | ------------------- |
| `general`       | Default harness for Kimmi | All tools           |
| `code-reviewer` | Code review and feedback  | read, comment, test |
| `researcher`    | Information gathering     | read, search, web   |
| `writer`        | Documentation and content | read, write         |

---

## Agent Data Model

### Agent Node Structure

```typescript
const agent: Node = {
  id: "agent-1",
  type: "agent",
  parent_id: "agents",
  data: {
    name: "Auth Agent",
    model: "claude-sonnet-4",
    harness: "code-reviewer",
    workdir: ".agents/agent-1",
  },
}

const kimmi: Node = {
  id: "kimmi",
  type: "agent",
  parent_id: "agents",
  data: {
    name: "Kimmi",
    model: "claude-sonnet-4",
    harness: "general",
    description: "Knowledge Machine's built-in agent",
  },
}
```

### Agent Work Queue

An agent's work queue is its children (direct or symlinks):

```
Agent "agent-1" (node)
├── Task A (child)
├── Task B (symlink → /projects/auth/task-b)
└── Board X (symlink → /boards/sprint-1)
    ├── Task C
    └── Task D
```

---

## Beads Integration

Agents integrate with beads issue tracking as workers:

### Work Discovery

Agents find work the same way humans do:

```bash
bd ready                    # Shows issues ready to work on
bd agent claim agent-1      # Agent claims next ready issue
```

### Work Assignment

Issues can be assigned to agents:

```bash
bd agent assign agent-1 km-a1b2    # Assign issue to agent
bd agent queue agent-1             # View agent's assigned issues
```

### Work Completion

Agents close issues like humans:

```bash
# Agent internally runs:
bd update km-a1b2 --status wip --assignee agent-1
# ... does work ...
bd close km-a1b2 --reason "Agent: Implemented feature X"
```

### Session → Issue Linkage

Sessions are linked to issues via the `target` field:

```typescript
{ type: 'session_started', actor: 'agent-1', target: 'km-a1b2', data: {
    session_id: 'sess-abc',
    model: 'claude-sonnet-4'
}}
```

This enables queries like "Show all sessions for issue km-a1b2".

---

## Session Events

> **Terminology bridge**: Agent sessions in this document correspond to **chat logs** in [brain.md](../future/brain.md). Each session produces a chat log file (`.km/chats/`) containing the events below.

### Session Lifecycle

```typescript
// Session start
{ type: 'session_started', actor: 'agent-1', target: 'task-123', data: {
    session_id: 'sess-abc',
    model: 'claude-sonnet-4',
    system_prompt_hash: 'sha256:...'
}}

// Each conversation turn
{ type: 'session_message', actor: 'agent-1', data: {
    session_id: 'sess-abc',
    role: 'assistant',
    content: 'I will implement the auth flow by...',
    tokens: 523
}}

// Each tool invocation
{ type: 'session_tool_call', actor: 'agent-1', data: {
    session_id: 'sess-abc',
    tool: 'edit_file',
    args: { path: 'src/auth.ts', content: '...' },
    result: { success: true },
    tokens: 150
}}

// Session end
{ type: 'session_ended', actor: 'agent-1', target: 'task-123', data: {
    session_id: 'sess-abc',
    status: 'success',
    total_tokens: 15000,
    cost_usd: 0.45,
    summary: 'Implemented OAuth login flow'
}}
```

---

## CLI Commands

Agents are managed through two complementary command namespaces:

| Namespace  | Purpose                   | Focus                      |
| ---------- | ------------------------- | -------------------------- |
| `km agent` | Agent lifecycle & runtime | Spawn, run, stop, sessions |
| `bd agent` | Work queue integration    | Assign issues, view queues |

### `km agent` — Lifecycle & Runtime

```bash
# Lifecycle
km agent ls                       # List all agents
km agent spawn <name>             # Create new agent
  -m, --model <model>             #   LLM model (default: claude-sonnet-4)
  -h, --harness <name>            #   Harness (default: general)
  --id <custom>                   #   Custom short ID
km agent stop <id>                # Graceful stop
km agent kill <id>                # Force kill

# Execution
km agent run <id> [prompt]        # One-shot: run with prompt
  --task <issue-id>               #   Work on specific issue
  --continuous                    #   Process queue continuously
  --max-tasks <n>                 #   Limit in continuous mode
  --dry-run                       #   Show plan without executing
km agent chat <id>                # Interactive chat session

# Sessions
km agent sessions [agent-id]      # List sessions
km agent session <session-id>     # View transcript
km agent replay <session-id>      # Replay session (dry-run)
```

### `bd agent` — Beads Integration

Agents work on issues via the beads system:

```bash
# Work queue management
bd agent queue <agent-id>             # Show agent's assigned issues
bd agent assign <agent-id> <issue-id> # Assign issue to agent
bd agent unassign <agent-id> <issue>  # Remove assignment
bd agent claim <agent-id>             # Claim next ready issue

# Convenience aliases (delegate to km agent)
bd agent ls                           # → km agent ls
bd agent run <agent-id>               # → km agent run --continuous
```

### Why Two Namespaces?

**`km agent`** is for general agent management:

- Creating and destroying agents
- Running agents with arbitrary prompts
- Session inspection and debugging
- Interactive chat

**`bd agent`** is for issue-centric workflows:

- Assigning issues to agent work queues
- Viewing what each agent is working on
- Integration with `/pm` skill
- Treating agents as "workers" on beads

### Hub Commands

The **hub** is the central coordination point for agent orchestration:

```bash
km agent hub                # Launch interactive TUI
km hub start                # Start daemon (background IPC)
km hub stop                 # Stop daemon
km hub status               # Show status
```

---

## Hub TUI

`km hub` launches an interactive dashboard:

```
┌─ km hub ───────────────────────────────────────────────────┐
│                                                            │
│  AGENTS              WORK QUEUE         RECENT EVENTS      │
│  ───────             ──────────         ─────────────      │
│  ● claude-1          P0: Fix auth bug   12:01 claude-1     │
│    └─ km-a3f           ↳ in_progress      claimed km-a3f   │
│  ● claude-2          P1: Add tests      12:03 claude-2     │
│    └─ km-b7c         P1: Update docs      completed km-b7c │
│  ○ claude-3 (idle)   P2: Refactor DB    12:05 system       │
│                      ...                  spawned claude-3 │
│                                                            │
│  [S]pawn  [K]ill  [A]ssign  [Q]ueue  [L]ogs  [?]Help       │
└────────────────────────────────────────────────────────────┘
```

**Keybindings:**

| Key     | Action               |
| ------- | -------------------- |
| `s`     | Spawn new agent      |
| `k`     | Kill selected agent  |
| `a`     | Assign task to agent |
| `q`     | View work queue      |
| `l`     | View logs/sessions   |
| `Enter` | Expand/drill into    |
| `?`     | Help                 |
| `Esc`   | Back / Quit          |

---

## Future Considerations

- **Session compaction**: Archive full transcripts, keep summaries
- **Multi-machine**: Distributed event bus over network
- **Agent coordination**: Explicit handoff protocols
- **Resource limits**: Token budgets, concurrent task limits

---

## See Also

- [../future/brain.md](../future/brain.md) — Knowledge base: logs, statements, items, views
- [../storage.md](../design/model/storage.md) — Events and storage model
- [../guides/tasks.md](../guides/tasks.md) — Task management
- [../guides/cli.md](../guides/cli.md) — CLI commands
