# Agents Specification

> **Status: Future** — Not yet implemented.

AI agent orchestration for km.

---

## Overview

Agents are nodes in the km data model (see [km-data-model](km-data-model.md)) that can claim tasks, execute sessions, and communicate with each other.

### Design Principles

1. **Agents are nodes**: Agent identity and config stored in the node tree
2. **Work queues via hierarchy**: Agent's children (or symlinks) define its queue
3. **Session logging**: Full conversation transcripts recorded as events
4. **Simple IPC**: Unix socket for real-time notifications

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

## Agent Data Model

### Agent Node Structure

```typescript
const agent: Node = {
  id: 'agent-1',
  type: 'agent',
  parent_id: 'agents',  // Folder containing all agents
  data: {
    name: 'Auth Agent',
    model: 'claude-sonnet-4',
    workdir: '.agents/agent-1',
    capabilities: ['code', 'test', 'review']
  }
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

Agents claim tasks by setting `assigned_to` when starting work, and clear it when done.

```typescript
function getAgentQueue(db: Database, agentId: string): Node[] {
  // Get direct children
  const children = db.all(`
    SELECT * FROM nodes
    WHERE parent_id = ?
    ORDER BY sort_order
  `, [agentId])

  const queue: Node[] = []

  for (const child of children) {
    if (child.symlink_to) {
      // Resolve symlink
      const target = db.get('SELECT * FROM nodes WHERE id = ?', [child.symlink_to])

      if (target.type === 'board') {
        // Expand board into tasks
        const boardTasks = db.all(`
          SELECT * FROM nodes
          WHERE parent_id = ? AND type = 'task' AND status != 'done'
          ORDER BY sort_order
        `, [target.id])
        queue.push(...boardTasks)
      } else if (target.type === 'task' && target.status !== 'done') {
        queue.push(target)
      }
    } else if (child.type === 'task' && child.status !== 'done') {
      queue.push(child)
    }
  }

  // Filter out tasks claimed by other agents
  return queue.filter(t => !t.assigned_to || t.assigned_to === agentId)
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
import { createServer, Socket } from 'net'
import { unlinkSync } from 'fs'

const SOCKET_PATH = '.km/events.sock'

class EventHub {
  private clients: Set<Socket> = new Set()

  start() {
    // Clean up stale socket
    try { unlinkSync(SOCKET_PATH) } catch {}

    const server = createServer((client) => {
      this.clients.add(client)

      client.on('close', () => this.clients.delete(client))
      client.on('error', () => this.clients.delete(client))
    })

    server.listen(SOCKET_PATH)
  }

  broadcast(event: Event) {
    const line = JSON.stringify(event) + '\n'
    for (const client of this.clients) {
      client.write(line)
    }
  }
}
```

### Agent (Subscriber)

```typescript
import { createConnection } from 'net'
import { createInterface } from 'readline'

class EventSubscriber {
  private handlers: ((event: Event) => void)[] = []

  connect(agentId: string) {
    const socket = createConnection('.km/events.sock')

    const rl = createInterface({ input: socket })

    rl.on('line', (line) => {
      const event: Event = JSON.parse(line)

      // Filter: only events targeting this agent or broadcast
      if (!event.target || event.target === agentId) {
        for (const handler of this.handlers) {
          handler(event)
        }
      }
    })

    socket.on('error', () => {
      // Fall back to polling if socket unavailable
      this.startPolling(agentId)
    })
  }

  on(handler: (event: Event) => void) {
    this.handlers.push(handler)
  }

  private startPolling(agentId: string) {
    // Fallback: poll events.jsonl every 500ms
    let lastSeen = ''
    setInterval(() => {
      const events = readEventsSync('.km/events.jsonl')
        .filter(e => e.id > lastSeen)
        .filter(e => !e.target || e.target === agentId)

      for (const event of events) {
        lastSeen = event.id
        for (const handler of this.handlers) {
          handler(event)
        }
      }
    }, 500)
  }
}
```

### Unified Emit Function (with IPC)

```typescript
import { appendFileSync } from 'fs'
import { ulid } from 'ulid'

let hub: EventHub | null = null

function setHub(h: EventHub) {
  hub = h
}

function emit(event: Omit<Event, 'id' | 'ts'>): Event {
  const full: Event = {
    id: ulid(),
    ts: Date.now(),
    ...event
  }

  // 1. Append to events file (persistent)
  appendFileSync('.km/events.jsonl', JSON.stringify(full) + '\n')

  // 2. Broadcast via socket (real-time)
  if (hub) {
    hub.broadcast(full)
  }

  return full
}
```

---

## Agent Lifecycle

### Agent Loop

```typescript
async function agentMain(agentId: string) {
  const db = await rebuildState()

  // Connect to event bus
  const subscriber = new EventSubscriber()
  subscriber.connect(agentId)

  // Handle incoming messages
  subscriber.on((event) => {
    if (event.type === 'message') {
      handleMessage(event)
    }
  })

  // Main work loop
  while (true) {
    // Sync state
    await syncState(db)

    // Get work queue
    const queue = getAgentQueue(db, agentId)

    // Find unclaimed task
    const task = queue.find(t => !t.assigned_to)

    if (task) {
      // Claim it
      emit({ type: 'task_claimed', actor: agentId, target: task.id })

      // Execute
      await executeTask(agentId, task)

      // Complete
      emit({
        type: 'task_completed',
        actor: agentId,
        target: task.id,
        data: { summary: '...' }
      })
    } else {
      // No work, wait for events
      await sleep(1000)
    }
  }
}
```

### Session Recording

```typescript
async function executeTask(agentId: string, task: Node) {
  const sessionId = ulid()

  // Start session
  emit({
    type: 'session_started',
    actor: agentId,
    target: task.id,
    data: { session_id: sessionId, model: 'claude-sonnet-4' }
  })

  try {
    // Run Claude Code
    const session = spawnClaudeCode(task)

    session.on('message', (role, content, tokens) => {
      emit({
        type: 'session_message',
        actor: agentId,
        data: { session_id: sessionId, role, content, tokens }
      })
    })

    session.on('tool_call', (tool, args, result, tokens) => {
      emit({
        type: 'session_tool_call',
        actor: agentId,
        data: { session_id: sessionId, tool, args, result, tokens }
      })
    })

    await session.complete()

    emit({
      type: 'session_ended',
      actor: agentId,
      target: task.id,
      data: {
        session_id: sessionId,
        status: 'success',
        total_tokens: session.totalTokens,
        summary: session.summary
      }
    })

  } catch (error) {
    emit({
      type: 'session_ended',
      actor: agentId,
      target: task.id,
      data: {
        session_id: sessionId,
        status: 'error',
        error: error.message
      }
    })
    throw error
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

```bash
# Start event hub (background)
km hub start

# List agents
km agents

# Start an agent
km agent start <agent-id>

# Assign task to agent
km task assign <task-id> <agent-id>

# View agent's queue
km queue <agent-id>

# Send message
km message <target-agent> "Hello"

# View session transcript
km session <session-id>
```

---

## File Size Estimates (Session Data)

| Content | Size per Unit | Daily (10 agents) | Monthly |
|---------|---------------|-------------------|---------|
| Session message | ~2KB | 2000 turns = 4MB | 120MB |
| Session tool call | ~1KB | 1000 calls = 1MB | 30MB |

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

---

## References

- [km-node-spec](km-node-spec.md) - Data model and storage
- [Gas Town](https://github.com/steveyegge/gastown) - Multi-agent orchestrator
