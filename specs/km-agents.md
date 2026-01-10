# Agents Specification

> **Status: Future** — Not yet implemented.

AI agent orchestration for km.

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
├── events.jsonl      # Source of truth (includes session logs)
├── events.sock       # Unix socket for IPC (runtime only)
└── state.db          # SQLite snapshot (gitignored)
```

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Runtime                                              │
│                                                             │
│  Agent ──► claim task ──► emit() ──► events.jsonl           │
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
  parent_id: "agents", // Folder containing all agents
  data: {
    name: "Auth Agent",
    model: "claude-sonnet-4",
    harness: "code-reviewer", // Reference to harness config
    workdir: ".agents/agent-1",
  },
};

// Kimmi - the default agent
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
};
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

Agents claim tasks by setting `assigned_to` when starting work, and clear it when done.

```typescript
function getAgentQueue(db: Database, agentId: string): Node[] {
  // Get direct children
  const children = db.all(
    `
    SELECT * FROM nodes
    WHERE parent_id = ?
    ORDER BY parent_idx
  `,
    [agentId],
  );

  const queue: Node[] = [];

  for (const child of children) {
    if (child.symlink_to) {
      // Resolve symlink
      const target = db.get("SELECT * FROM nodes WHERE id = ?", [
        child.symlink_to,
      ]);

      if (target.type === "board") {
        // Expand board into tasks
        const boardTasks = db.all(
          `
          SELECT * FROM nodes
          WHERE parent_id = ? AND type = 'task' AND status != 'done'
          ORDER BY parent_idx
        `,
          [target.id],
        );
        queue.push(...boardTasks);
      } else if (target.type === "task" && target.status !== "done") {
        queue.push(target);
      }
    } else if (child.type === "task" && child.status !== "done") {
      queue.push(child);
    }
  }

  // Filter out tasks claimed by other agents
  return queue.filter((t) => !t.assigned_to || t.assigned_to === agentId);
}
```

---

## Session Events

### Session Lifecycle

```typescript
// Session start
{ type: 'session_started', actor: 'agent-1', target: 'task-123', data: {
    session_id: 'sess-abc',
    model: 'claude-sonnet-4',
    system_prompt_hash: 'sha256:...'
}}

// Each conversation turn (full content)
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
    files_modified: ['src/auth.ts', 'tests/auth.test.ts'],
    summary: 'Implemented OAuth login flow'
}}
```

---

## IPC: Unix Socket Event Bus

### Socket Protocol

Path: `.km/events.sock`

Messages are newline-delimited JSON events (same format as events.jsonl).

### Hub (Main Process)

```typescript
import { createServer, Socket } from "net";
import { unlinkSync } from "fs";

const SOCKET_PATH = ".km/events.sock";

class EventHub {
  private clients: Set<Socket> = new Set();

  start() {
    // Clean up stale socket
    try {
      unlinkSync(SOCKET_PATH);
    } catch {}

    const server = createServer((client) => {
      this.clients.add(client);

      client.on("close", () => this.clients.delete(client));
      client.on("error", () => this.clients.delete(client));
    });

    server.listen(SOCKET_PATH);
  }

  broadcast(event: Event) {
    const line = JSON.stringify(event) + "\n";
    for (const client of this.clients) {
      client.write(line);
    }
  }
}
```

### Agent (Subscriber)

```typescript
import { createConnection } from "net";
import { createInterface } from "readline";

class EventSubscriber {
  private handlers: ((event: Event) => void)[] = [];

  connect(agentId: string) {
    const socket = createConnection(".km/events.sock");

    const rl = createInterface({ input: socket });

    rl.on("line", (line) => {
      const event: Event = JSON.parse(line);

      // Filter: only events targeting this agent or broadcast
      if (!event.target || event.target === agentId) {
        for (const handler of this.handlers) {
          handler(event);
        }
      }
    });

    socket.on("error", () => {
      // Fall back to polling if socket unavailable
      this.startPolling(agentId);
    });
  }

  on(handler: (event: Event) => void) {
    this.handlers.push(handler);
  }

  private startPolling(agentId: string) {
    // Fallback: poll events.jsonl every 500ms
    let lastSeen = "";
    setInterval(() => {
      const events = readEventsSync(".km/events.jsonl")
        .filter((e) => e.id > lastSeen)
        .filter((e) => !e.target || e.target === agentId);

      for (const event of events) {
        lastSeen = event.id;
        for (const handler of this.handlers) {
          handler(event);
        }
      }
    }, 500);
  }
}
```

### Unified Emit Function (with IPC)

```typescript
import { appendFileSync } from "fs";
import { ulid } from "ulid";

let hub: EventHub | null = null;

function setHub(h: EventHub) {
  hub = h;
}

function emit(event: Omit<Event, "id" | "ts">): Event {
  const full: Event = {
    id: ulid(),
    ts: Date.now(),
    ...event,
  };

  // 1. Append to events file (persistent)
  appendFileSync(".km/events.jsonl", JSON.stringify(full) + "\n");

  // 2. Broadcast via socket (real-time)
  if (hub) {
    hub.broadcast(full);
  }

  return full;
}
```

---

## Agent Lifecycle

### Agent Loop

```typescript
async function agentMain(agentId: string) {
  const db = await rebuildState();

  // Connect to event bus
  const subscriber = new EventSubscriber();
  subscriber.connect(agentId);

  // Handle incoming messages
  subscriber.on((event) => {
    if (event.type === "message") {
      handleMessage(event);
    }
  });

  // Main work loop
  while (true) {
    // Sync state
    await syncState(db);

    // Get work queue
    const queue = getAgentQueue(db, agentId);

    // Find unclaimed task
    const task = queue.find((t) => !t.assigned_to);

    if (task) {
      // Claim it
      emit({ type: "task_claimed", actor: agentId, target: task.id });

      // Execute
      await executeTask(agentId, task);

      // Complete
      emit({
        type: "task_completed",
        actor: agentId,
        target: task.id,
        data: { summary: "..." },
      });
    } else {
      // No work, wait for events
      await sleep(1000);
    }
  }
}
```

### Session Recording

```typescript
async function executeTask(agentId: string, task: Node) {
  const sessionId = ulid();

  // Start session
  emit({
    type: "session_started",
    actor: agentId,
    target: task.id,
    data: { session_id: sessionId, model: "claude-sonnet-4" },
  });

  try {
    // Run Claude Code
    const session = spawnClaudeCode(task);

    session.on("message", (role, content, tokens) => {
      emit({
        type: "session_message",
        actor: agentId,
        data: { session_id: sessionId, role, content, tokens },
      });
    });

    session.on("tool_call", (tool, args, result, tokens) => {
      emit({
        type: "session_tool_call",
        actor: agentId,
        data: { session_id: sessionId, tool, args, result, tokens },
      });
    });

    await session.complete();

    emit({
      type: "session_ended",
      actor: agentId,
      target: task.id,
      data: {
        session_id: sessionId,
        status: "success",
        total_tokens: session.totalTokens,
        summary: session.summary,
      },
    });
  } catch (error) {
    emit({
      type: "session_ended",
      actor: agentId,
      target: task.id,
      data: {
        session_id: sessionId,
        status: "error",
        error: error.message,
      },
    });
    throw error;
  }
}
```

---

## State Database Extensions

Agent-specific tables (in addition to base node tables):

```sql
-- Agent cursors (last event seen per agent)
CREATE TABLE cursors (
  agent_id TEXT PRIMARY KEY,
  last_event_id TEXT,
  last_ts INTEGER
);
```

---

## CLI Commands

### Agent Commands

```bash
# List agents
km agent ls

# Create a new agent
km agent create <spec.yaml>

# Run agent continuously (pulls from queue)
km agent run <agent_id>

# Run agent for a single task (one-shot)
km agent run <agent_id> "review the auth module"

# Stop a running agent
km agent stop <agent_id>

# View agent's queue
km agent queue <agent_id>
```

### Task Commands

```bash
# List tasks
km task ls

# Create a task
km task create "Review Q1 financials"

# Assign task to agent or user
km task assign <agent_id|user> <task_id>

# Unassign task
km task unassign <agent_id|user> <task_id>

# View task status
km task status <task_id>
```

### Session Commands

```bash
# View session transcript
km session <session_id>

# List sessions for an agent
km session ls --agent <agent_id>
```

### Hub Commands

The **hub** is the central coordination point for agent orchestration. It provides both a daemon for IPC and an interactive TUI for monitoring and controlling agents.

**Aliases**: `km command`, `km cmd`, `km hq`

```bash
# Launch interactive hub TUI (dashboard view)
km hub

# Start hub daemon (background, enables IPC)
km hub start

# Stop hub daemon
km hub stop

# Show hub status (agents, queues, recent events)
km hub status

# Send message to agent
km hub message <target-agent> "Hello"
```

#### Hub TUI

`km hub` launches an interactive dashboard for orchestration:

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
│  [S]pawn  [K]ill  [A]ssign  [Q]ueue  [L]ogs  [?]Help      │
└────────────────────────────────────────────────────────────┘
```

**Features:**

- Real-time agent status (active, idle, error)
- Work queue with priorities and assignments
- Live event stream
- Spawn/kill agents
- Reassign tasks between agents
- Drill into agent logs and session transcripts

**Keybindings:**
| Key | Action |
|-----|--------|
| `s` | Spawn new agent |
| `k` | Kill selected agent |
| `a` | Assign task to agent |
| `q` | View work queue |
| `l` | View logs/sessions |
| `Enter` | Expand/drill into selection |
| `?` | Help |
| `Esc` | Back / Quit |

---

## File Size Estimates (Session Data)

| Content           | Size per Unit | Daily (10 agents) | Monthly |
| ----------------- | ------------- | ----------------- | ------- |
| Session message   | ~2KB          | 2000 turns = 4MB  | 120MB   |
| Session tool call | ~1KB          | 1000 calls = 1MB  | 30MB    |

**Total estimate**: 150-200MB/month uncompressed, ~20-30MB compressed.

Consider periodic archival of old session data.

---

## .gitignore

```
.km/state.db
.km/state.db-journal
.km/state.db-wal
.km/events.sock
```

---

## Future Considerations

- **Session compaction**: Archive full transcripts, keep summaries
- **Multi-machine**: Distributed event bus over network
- **Agent coordination**: Explicit handoff protocols
- **Resource limits**: Token budgets, concurrent task limits
- **Convoys**: Batch work assignments (inspired by Gas Town)
- **Handoffs**: Structured agent-to-agent task transfers

---

## References

- [km-node-spec](km-node-spec.md) - Data model and storage
- [Gas Town](https://github.com/steveyegge/gastown) - Multi-agent orchestrator
- [Kimmi Vault](../../cloudi/specs/active/ADR24-kimmi-vault.md) - Prior art: unified vault architecture for PIM + memory
- [Cloudi Agent Architecture](../../cloudi/specs/active/ADR25-agent-architecture.md) - Prior art: event-sourced agent model

---

## Relationship to Kimmi Vault (Cloudi)

km is intended to eventually subsume the Kimmi Vault architecture designed in the Cloudi project. Key concepts to incorporate:

| Kimmi Vault Concept                     | km Equivalent                | Status                              |
| --------------------------------------- | ---------------------------- | ----------------------------------- |
| Markdown vault with frontmatter         | Node tree with metadata      | ✓ Core model                        |
| Entity types (contact, event, task)     | Node types                   | Partial (task done, others planned) |
| Daily notes as operation log            | events.jsonl                 | ✓ Implemented                       |
| Wikilinks and backlinks                 | Node references              | Planned                             |
| Chat storage (folder per conversation)  | Session events               | Designed                            |
| Google sync (Contacts, Calendar, Tasks) | Connectors (CalDAV, CardDAV) | Planned                             |
| AGENTS.md for agent definition          | Harnesses + agent nodes      | Designed                            |
| Mastra for semantic search              | Built-in embeddings          | Planned                             |
| CRDT for multi-device sync              | Event merging                | Future                              |

**Migration path:** As km matures, Kimmi Vault concepts will be implemented natively. The goal is a single unified system that provides:

1. **PKM/PIM** — Notes, tasks, calendar, contacts in one queryable tree
2. **Agent workspace** — Agents use km as their working memory
3. **Orchestration** — `km hub` coordinates agent teams
4. **Kimmi** — The AI assistant with full context on your life
