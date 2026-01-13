# Services Specification

km runs multiple background services for sync, automation, and agents.

---

## Overview

| Service    | Purpose            | Dependencies |
| ---------- | ------------------ | ------------ |
| **sync**   | Filesystem ↔ Model | None         |
| **auto**   | Rules automation   | sync         |
| **agents** | AI orchestration   | sync, auto   |

```
┌─────────────────────────────────────────┐
│  km daemon                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │  sync   │ │  auto   │ │ agents  │    │
│  │ worker  │ │ worker  │ │ worker  │    │
│  └────┬────┘ └────┬────┘ └────┬────┘    │
│       │           │           │          │
│       └───────────┴───────────┘          │
│                   │                       │
│            Event Bus                      │
│                   │                       │
│       ┌───────────┴───────────┐          │
│       ▼                       ▼          │
│  events.jsonl            events.sock     │
└─────────────────────────────────────────┘
```

---

## Service Management

### CLI Commands

```bash
# Service management
km service ls                    # List services and status
km service start <name>          # Start a service
km service stop <name>           # Stop a service
km service restart <name>        # Restart a service
km service status <name>         # Show service status
km service logs <name>           # View service logs

# Combined management
km daemon start                  # Start all services
km daemon stop                   # Stop all services
km daemon status                 # Show all service status

# Shortcuts
km sync --watch                  # Start sync service (foreground)
km hub                           # Start all + open TUI
```

### Service Status

```bash
$ km service ls
NAME      STATUS    PID     UPTIME
sync      running   12345   2h 15m
auto      running   12346   2h 15m
agents    stopped   -       -

$ km service status sync
Service: sync
Status: running
PID: 12345
Started: 2025-01-12 10:00:00
Uptime: 2h 15m
Events processed: 1,234
Last event: 5s ago
```

---

## sync Service

Filesystem ↔ Model synchronization (see [km-watch.md](km-watch.md)).

### Responsibilities

- Watch filesystem for changes
- Parse markdown → nodes
- Reconcile with SQLite
- Write model changes → markdown

### Configuration

```yaml
# .km/config.yaml
services:
  sync:
    debounce_fs: 5000 # ms before processing FS changes
    debounce_apply: 3000 # ms before writing to FS
    ignore:
      - "node_modules/**"
      - ".git/**"
```

---

## auto Service

Rules-based automation engine.

### When Is This Service Needed?

**Most automation can be trigger-based** (event handlers in the Model layer):
- Board sync rules: task status change → move to column
- Recurring tasks: task done → create next occurrence

**The service is needed for:**
- **Startup sweep**: Catch up on missed time (recurring tasks that became due, scheduled actions that should have fired)
- **Scheduled actions**: Fire at specific times (requires timer loop)
- **Periodic checks**: Rules that need to run on a schedule

If you don't use scheduled actions or periodic rules, the auto service can be disabled.

### Responsibilities

- Evaluate board `sync=` rules
- Handle recurring tasks
- Process scheduled actions
- Trigger notifications (future)

### Trigger Detection Layer

Triggers are detected at the **Model layer** when events are emitted.

The auto service subscribes to the event bus and evaluates rules:

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (TUI)           │  Filesystem                     │
│  User toggles task        │  User edits file                │
└──────────┬────────────────┴──────────┬──────────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Model Layer                                                 │
│  store.updateNode() → emit('node_updated')                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼  Event Bus
┌─────────────────────────────────────────────────────────────┐
│  auto Service (subscriber)                                   │
│  onEvent('node_updated') → evaluateRules()                   │
│                          → maybeCreateRecurring()            │
│                          → maybeUpdateBoard()                │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** Automation logic is NOT in the UI or Parser layers. It's a separate service that reacts to model events. This keeps layers clean and testable.

### Execution Modes

The auto service operates in two modes:

#### 1. Reactive (Event-Driven)

Respond to events as they happen:

```typescript
eventBus.on("node_updated", async (event) => {
  await evaluateRulesFor(event.target);
});
```

#### 2. Sweep (Startup Catch-up)

On startup, scan all nodes to catch up on missed time:

```typescript
async function startupSweep() {
  // Check recurring tasks that may have become due
  const tasks = getAllTasksWithRecurrence();
  for (const task of tasks) {
    if (task.task_status === "done" && isDueForNextOccurrence(task)) {
      await createNextOccurrence(task);
    }
  }

  // Check scheduled actions that may have fired
  const scheduled = getAllScheduledActions();
  for (const action of scheduled) {
    if (isPast(action.scheduledAt) && !action.executed) {
      await executeAction(action);
    }
  }

  // Reconcile board sync rules
  const boards = getAllBoards();
  for (const board of boards) {
    await reconcileBoardColumns(board);
  }
}
```

#### Startup Sequence

```
auto service start
        │
        ▼
┌─────────────────┐
│  Startup Sweep  │  ← Check all rules, catch up on missed
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Subscribe to   │  ← Now listen for real-time events
│  Event Bus      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Running        │  ← Process events as they arrive
└─────────────────┘
```

### Rule Types

#### Board Sync Rules

When a node's field changes, move to matching column:

```markdown
## Done

<!-- sync=task_status:done -->
```

```typescript
// Pseudo-code
eventBus.on("node_updated", (event) => {
  if (event.data.task_status) {
    const rules = getBoardSyncRules();
    for (const rule of rules) {
      if (
        rule.field === "task_status" &&
        rule.value === event.data.task_status
      ) {
        moveToColumn(event.target, rule.column);
      }
    }
  }
});
```

#### Recurring Tasks

When a recurring task is completed, create the next occurrence:

```typescript
eventBus.on("node_updated", (event) => {
  if (event.data.task_status === "done") {
    const node = getNode(event.target);
    if (node.data.recurrence) {
      const next = computeNextOccurrence(node);
      createNode({ ...node, task_status: "open", due_date: next });
    }
  }
});
```

#### Scheduled Actions (Future)

```yaml
# In node frontmatter
---
scheduled:
  - at: "2025-01-15 09:00"
    action: notify
    message: "Task due today!"
---
```

### Configuration

```yaml
# .km/config.yaml
services:
  auto:
    rules:
      board_sync: true # Enable sync= rules
      recurring: true # Enable recurring tasks
      scheduled: true # Enable scheduled actions
    tick_interval: 60000 # ms between scheduled checks
```

---

## agents Service

AI agent orchestration (see [km-agents.md](km-agents.md)).

### Responsibilities

- Manage IPC socket (`.km/events.sock`)
- Coordinate agent work queues
- Broadcast events to subscribers
- Track agent sessions

### Configuration

```yaml
# .km/config.yaml
services:
  agents:
    socket_path: .km/events.sock
    max_concurrent: 3 # Max concurrent agent sessions
    default_model: claude-sonnet-4
```

---

## Service Interface

```typescript
interface Service {
  readonly name: string;
  readonly dependsOn: string[];

  start(): Promise<void>;
  stop(): Promise<void>;
  status(): ServiceStatus;

  // Event handlers
  onEvent(event: Event): Promise<void>;
}

interface ServiceStatus {
  name: string;
  running: boolean;
  pid?: number;
  startedAt?: number;
  eventsProcessed: number;
  lastEventAt?: number;
  error?: string;
}
```

### Implementation

```typescript
// packages/km-services/src/sync.ts
export class SyncService implements Service {
  readonly name = 'sync';
  readonly dependsOn = [];

  private watcher: FSWatcher | null = null;

  async start() {
    this.watcher = new FSWatcher({ ... });
    this.watcher.on('all', this.handleFsEvent);
  }

  async stop() {
    await this.watcher?.close();
  }

  async onEvent(event: Event) {
    // Handle model → FS writes
    if (shouldWriteToFs(event)) {
      await this.writeToFs(event);
    }
  }
}
```

---

## Daemon Process

Single process hosts all services:

```typescript
// apps/km-daemon/src/index.ts
class KmDaemon {
  private services = new Map<string, Service>();
  private eventBus: EventBus;

  constructor() {
    this.eventBus = new EventBus();

    // Register services
    this.services.set("sync", new SyncService());
    this.services.set("auto", new AutoService());
    this.services.set("agents", new AgentsService());
  }

  async start(names?: string[]) {
    const toStart = names ?? ["sync", "auto", "agents"];

    // Sort by dependencies
    const sorted = this.topologicalSort(toStart);

    for (const name of sorted) {
      const service = this.services.get(name)!;
      await service.start();
      console.log(`Started: ${name}`);
    }

    // Wire up event routing
    this.eventBus.on("*", (event) => {
      for (const service of this.services.values()) {
        service.onEvent(event);
      }
    });
  }

  async stop() {
    // Stop in reverse dependency order
    for (const service of [...this.services.values()].reverse()) {
      await service.stop();
    }
  }
}
```

---

## PID File

Track running daemon:

```
.km/daemon.pid    # Contains PID of running daemon
```

```typescript
function isDaemonRunning(): boolean {
  const pidFile = ".km/daemon.pid";
  if (!existsSync(pidFile)) return false;

  const pid = parseInt(readFileSync(pidFile, "utf-8"));
  try {
    process.kill(pid, 0); // Check if process exists
    return true;
  } catch {
    unlinkSync(pidFile); // Stale PID file
    return false;
  }
}
```

---

## Logging

Services log to `.km/logs/`:

```
.km/logs/
├── sync.log
├── auto.log
├── agents.log
└── daemon.log     # Combined output
```

```bash
km service logs sync           # View sync logs
km service logs sync --follow  # Tail logs
km service logs --all          # All services
```

---

## Future: Native Service Integration

For production robustness, integrate with system service managers:

### macOS (launchd)

```xml
<!-- ~/Library/LaunchAgents/io.km.daemon.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.km.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/km</string>
        <string>daemon</string>
        <string>start</string>
        <string>--foreground</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/bjorn/notes</string>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

### Linux (systemd)

```ini
# ~/.config/systemd/user/km-daemon.service
[Unit]
Description=km daemon
After=default.target

[Service]
ExecStart=/usr/local/bin/km daemon start --foreground
WorkingDirectory=/home/bjorn/notes
Restart=always

[Install]
WantedBy=default.target
```

---

## See Also

- [km-watch.md](km-watch.md) — sync service details
- [km-agents.md](km-agents.md) — agents service details
- [km-automation.md](km-automation.md) — auto service details (TODO)
