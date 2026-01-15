# Daemon Specification

km runs a single background daemon for real-time sync and automation.

---

## Overview

Inspired by [beads](https://github.com/Dicklesworthstone/beads_viewer) architecture.

```
┌─────────────────────────────────────────┐
│  km daemon                               │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │  Event Loop                         │ │
│  │  • FS watch (chokidar)              │ │
│  │  • Rule evaluation                  │ │
│  │  • Scheduled checks                 │ │
│  └─────────────────────────────────────┘ │
│                   │                      │
│                   ▼                      │
│  ┌─────────────────────────────────────┐ │
│  │  Event Bus                          │ │
│  │  • Emit to events.jsonl             │ │
│  │  • Broadcast via socket             │ │
│  └─────────────────────────────────────┘ │
│                   │                      │
│       ┌───────────┴───────────┐          │
│       ▼                       ▼          │
│  events.jsonl            km.sock         │
└─────────────────────────────────────────┘
```

**Single process, multiple responsibilities:**

- Filesystem watching (via SyncManager)
- Rule automation (event handlers)
- Socket for CLI↔daemon communication

---

## CLI Commands

```bash
# Daemon management
km daemon start              # Start daemon (background)
km daemon stop               # Stop daemon
km daemon status             # Show daemon status

# Shortcuts
km sync --watch              # Start daemon (foreground, sync only)
km hub                       # Start daemon + todo TUI
```

---

## Daemon Lifecycle

### Startup

```
km daemon start
        │
        ▼
┌─────────────────┐
│  Check PID file │  ← Already running? Exit.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Write PID file │  ← .km/daemon.pid
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create socket  │  ← .km/km.sock
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Startup sweep  │  ← Catch up on missed time
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Start watching │  ← chokidar on vault
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Event loop     │  ← Running
└─────────────────┘
```

### Startup Sweep

On startup, check for work that may have been missed:

```typescript
async function startupSweep() {
  // 1. Reconcile filesystem with database
  await reconcileVault();

  // 2. Process recurring tasks that became due
  const tasks = getAllTasksWithRecurrence();
  for (const task of tasks) {
    if (task.task_status === "done" && isDueForNextOccurrence(task)) {
      await createNextOccurrence(task);
    }
  }

  // 3. Run board sync rules
  const boards = getAllBoards();
  for (const board of boards) {
    await reconcileBoardColumns(board);
  }
}
```

---

## Event Handlers

The daemon registers event handlers for automation:

### Board Sync Rules

When a task's status changes, move to matching column:

```typescript
eventBus.on("node_updated", async (event) => {
  if (event.data.task_status) {
    const rules = getBoardSyncRules();
    for (const rule of rules) {
      if (
        rule.field === "task_status" &&
        rule.value === event.data.task_status
      ) {
        await moveToColumn(event.target, rule.column);
      }
    }
  }
});
```

### Recurring Tasks

When a recurring task is completed, create the next occurrence:

```typescript
eventBus.on("node_updated", async (event) => {
  if (event.data.task_status === "done") {
    const node = getNode(event.target);
    if (node.data.recurrence) {
      const next = computeNextOccurrence(node);
      await createNode({ ...node, task_status: "todo", due_date: next });
    }
  }
});
```

---

## Socket Communication

CLI commands communicate with daemon via Unix socket:

```typescript
// CLI side
const socket = connect(".km/km.sock");
socket.write(JSON.stringify({ type: "status" }));
const response = await readResponse(socket);

// Daemon side
server.on("connection", (socket) => {
  socket.on("data", async (data) => {
    const msg = JSON.parse(data);
    switch (msg.type) {
      case "status":
        socket.write(JSON.stringify(getStatus()));
        break;
      case "sync":
        await forceSyncFromFs();
        socket.write(JSON.stringify({ ok: true }));
        break;
    }
  });
});
```

**Messages:**
| Type | Description |
|------------|--------------------------------|
| `status` | Get daemon status |
| `sync` | Force filesystem sync |
| `flush` | Flush pending writes |
| `subscribe`| Subscribe to events (streaming)|

---

## Files

```
.km/
├── daemon.pid      # PID of running daemon
├── daemon.log      # Daemon output log
├── km.sock         # Unix socket for IPC
├── events.jsonl    # Event log
└── state.db        # SQLite database
```

---

## Configuration

```yaml
# .km/config.yaml
daemon:
  auto_start: true # Auto-start when km commands need it
  debounce_fs: 5000 # ms before processing FS changes
  debounce_write: 3000 # ms before writing to FS
  log_level: info # debug, info, warn, error

automation:
  board_sync: true # Enable sync= rules
  recurring: true # Enable recurring tasks
```

---

## Daemon Status

```bash
$ km daemon status
km daemon
Status: running
PID: 12345
Uptime: 2h 15m
Socket: .km/km.sock

Events processed: 1,234
Last event: 5s ago
Pending writes: 0

Config:
  debounce_fs: 5000ms
  debounce_write: 3000ms
```

---

## Implementation

```typescript
// apps/km-daemon/src/index.ts
import { SyncManager } from "@km/watch";
import { createServer } from "net";

class KmDaemon {
  private sync: SyncManager;
  private server: Server;
  private eventBus: EventEmitter;

  async start() {
    // Check for existing daemon
    if (await this.isRunning()) {
      throw new Error("Daemon already running");
    }

    // Write PID file
    await this.writePidFile();

    // Create socket
    this.server = createServer(this.handleConnection.bind(this));
    this.server.listen(".km/km.sock");

    // Startup sweep
    await this.startupSweep();

    // Start file watching
    this.sync = new SyncManager({ vaultPath: getKmDir() });
    this.sync.start();

    // Register event handlers
    this.registerHandlers();

    console.log("km daemon started");
  }

  async stop() {
    await this.sync.stop();
    this.server.close();
    await this.removePidFile();
  }

  private registerHandlers() {
    // Board sync rules
    this.eventBus.on("node_updated", this.handleBoardSync.bind(this));

    // Recurring tasks
    this.eventBus.on("node_updated", this.handleRecurring.bind(this));
  }
}
```

---

## When Is the Daemon Needed?

**Required for:**

- Real-time file watching (`km sync --watch`)
- Background automation (recurring tasks, board sync)
- TUI live updates (`km hub`)

**Not required for:**

- Read-only commands (`km list`, `km show`)
- One-shot sync (`km sync`)
- Memory mode exploration

---

## Auto-Start

Like beads, the daemon can auto-start when needed:

```typescript
// Before commands that need real-time updates
async function ensureDaemon() {
  if (!isDaemonRunning()) {
    await startDaemon({ background: true });
  }
}
```

Controlled via config: `daemon.auto_start: true`

---

## See Also

- [km-watch.md](km-watch.md) — SyncManager details
- [km-cli.md](km-cli.md) — Command reference
