# Tribe v2: Discovery Broker + Direct Peer Connections

## Problem

The tribe daemon hardcodes beads coupling, acts as both message router and coordination service, and becomes a bottleneck for all communication. This prevents cross-project resource access and ties the daemon to one project system.

## Design Principles

1. **Daemon is a discovery broker, not a message router.** It knows who's alive and who has what. It never touches data, never routes messages, never reads the filesystem.

2. **One proxy socket, multiplexed resources.** Logical resource granularity per plugin. Physical: one socket per proxy. Per-plugin sockets add complexity without isolation (same process).

3. **Socket bind is the lock.** Resource ownership is decided by who successfully binds the deterministic resource socket. No distributed locking protocol needed.

4. **Messages are best-effort direct.** Durable coordination belongs in project state (beads, git), not in tribe. The daemon stores coordination _state_, not message history.

## Architecture

```
DAEMON (discovery broker, ~200 lines)
│  - Session registry (who's alive, what project)
│  - Resource directory (who provides what, at which socket)
│  - Leadership leases (per project, with epoch/fencing)
│  - Coordination state (pause, compact — queryable, not just broadcast)
│  - Event log (observability, fire-and-forget from proxies)
│
│  Does NOT: route messages, forward tool calls, read filesystem, host plugins
│
└─── $XDG_RUNTIME_DIR/tribe/daemon.sock

PROXY (one per Claude session, runs in project cwd)
│  - MCP server (stdio ↔ Claude Code)
│  - Daemon client (register, discover)
│  - Plugin host (detect, load, expose)
│  - Peer socket (one socket, multiplexed resources)
│  - Direct connections to other proxies/resource providers
│
├─── plugins (loaded based on cwd detection):
│    ├── tribe   (always: sessions, send, leadership)
│    ├── beads   (if .beads/: bd list, create, close)
│    ├── git     (if .git/: commit notifications)
│    └── linear  (if .linear/config: query API)
│
└─── $XDG_RUNTIME_DIR/tribe/s-{session_id}.sock  (peer socket)
```

## Identity Model

### Project Identity

Display names (`"km"`, `"decker"`) are labels only. Canonical identity is a hash:

```ts
project_id = hash(realpath(project_root)) // deterministic, unique, stable across renames
project_name = basename(project_root) // display only
```

This avoids collisions (two repos both named `api`) and handles symlinks/worktrees.

### Session Identity

Each proxy gets an opaque `session_id` (UUID). Socket names use the session ID, not human names:

```
$XDG_RUNTIME_DIR/tribe/s-{session_id}.sock     // peer socket
$XDG_RUNTIME_DIR/tribe/r-{hash}.sock           // resource socket (see below)
```

### Peer Handshake

Every direct connection starts with a handshake returning:

```json
{ "session_id": "...", "project_id": "...", "generation": 1, "protocol_version": 1 }
```

Callers verify identity after discovery — "connect here, then verify who answered."

## Resource Ownership via Socket Locking

The key insight: **the socket bind is the lock.** No coordination protocol needed for resource ownership.

```ts
// Deterministic resource socket path
const resourcePath = `${RUNTIME_DIR}/r-${hash(realpath + resource_name)}.sock`

// Try to become the provider
try {
  server.listen(resourcePath)
  // Success — I'm the provider. Register with daemon.
  daemon.call("register_resource", { name: "beads", socket: resourcePath })
} catch (e) {
  if (e.code === "EADDRINUSE") {
    // Someone else is already providing. Connect as client.
    const provider = await daemon.call("discover", { project: projectId, resource: "beads" })
    connect(provider.socket)
  }
}
```

Why this works:

- **Atomic**: `bind()` is atomic at the OS level. No race conditions.
- **Self-cleaning**: when the provider process dies, the socket file becomes stale. Next proxy detects `ECONNREFUSED`, unlinks, and claims.
- **Deterministic**: any proxy can compute the path without asking the daemon.
- **No election**: first proxy to bind wins. If it dies, next one takes over.
- **Singleton per resource**: exactly one provider per `(project, resource)`.

The daemon uses the same pattern — `bind(daemon.sock)` is the singleton lock. A second daemon attempt gets `EADDRINUSE`, connects as client instead of spawning. No PID files needed.

### One Proxy Socket for Everything Else

Each proxy exposes one peer socket for session-to-session communication. Resources are namespaced methods on this socket:

```
s-{session_id}.sock
  → tribe.send(to, message)     // session messages
  → beads.list(filter)          // if this proxy is the beads provider
  → git.status()                // if this proxy is the git provider
```

Resource-specific sockets (`r-{hash}.sock`) are only for the provider lock. Actual resource requests can go through either:

- the resource socket directly (cross-project access), or
- the provider's peer socket (same-project, already connected).

## Message Semantics

Three classes of communication, each with different durability:

### Ephemeral (best-effort direct)

"I'm looking at X", "can you check Y?"

- Direct peer connection
- If target offline → return `{ status: "offline" }`
- No retry, no queue. Caller decides what to do.

### Coordination state (daemon-stored, queryable)

"Project is paused", "chief changed", "compacting"

- Stored in daemon as **state**, not messages
- Proxies query current state on connect/reconnect
- No need to "catch up" on missed broadcasts

```sql
CREATE TABLE coordination (
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,            -- "paused", "chief", "compacting"
  value TEXT,                   -- JSON
  updated_by TEXT,              -- session_id
  updated_at INTEGER,
  PRIMARY KEY (project_id, key)
);
```

### Durable handoff

"You own this follow-up", "pick up bead X"

- Not tribe's job. Use beads/task system.
- Tribe is coordination, not task management.

## Daemon API

```ts
// Session lifecycle
register(session: SessionInfo): { id, coordination_state }
heartbeat(id: string): void
unregister(id: string): void

// Discovery
discover(query: { project_id?, resource?, name? }): DiscoveryResult[]

// Resources
register_resource(resource: { name, socket, capabilities }): void
unregister_resource(name: string): void

// Coordination state
set_state(project_id: string, key: string, value: unknown): void
get_state(project_id: string, key?: string): CoordinationState

// Leadership (per project, with fencing)
acquire_lease(project_id: string): { granted, epoch }
renew_lease(project_id: string, epoch: number): void

// Coordination
broadcast(scope: string, message: CoordMessage): void

// Observability (fire-and-forget)
log(event: { type, project_id?, meta? }): void
```

## Daemon DB Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_name TEXT,             -- display only
  project_root TEXT,
  role TEXT DEFAULT 'member',
  pid INTEGER,
  socket TEXT,                   -- peer socket path
  heartbeat INTEGER,
  registered_at INTEGER
);

CREATE TABLE resources (
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,             -- "beads", "git"
  provider_session_id TEXT REFERENCES sessions(id),
  socket TEXT NOT NULL,           -- resource socket path
  capabilities TEXT,              -- JSON: ["list","read","write"]
  PRIMARY KEY (project_id, name)
);

CREATE TABLE leadership (
  project_id TEXT PRIMARY KEY,
  holder_session_id TEXT REFERENCES sessions(id),
  holder_name TEXT,
  epoch INTEGER DEFAULT 1,       -- fencing token
  lease_until INTEGER
);

CREATE TABLE coordination (
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_by TEXT,
  updated_at INTEGER,
  PRIMARY KEY (project_id, key)
);

CREATE TABLE event_log (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  session_id TEXT,
  project_id TEXT,
  type TEXT,
  meta TEXT                       -- JSON
);
```

No messages table. Messages go directly between peers.

## Plugin Interface

```ts
interface ResourcePlugin {
  name: string

  /** Can this plugin activate in the given project? */
  detect(projectRoot: string): boolean

  /** MCP tool definitions to expose to Claude */
  tools(): ToolDefinition[]

  /** Handle a tool call (from local Claude or remote peer) */
  handle(tool: string, args: Record<string, unknown>): ToolResult

  /** Resources this plugin can provide (for ownership bidding) */
  resources?(): ResourceDescriptor[]

  /** Watch for changes and push notifications */
  watch?(onChange: (event: ResourceEvent) => void): Disposable
}

interface ResourceDescriptor {
  name: string // "beads", "git"
  capabilities: string[] // ["list", "read", "write", "watch"]
  singleton: boolean // true = one provider per project (socket lock)
}
```

Plugins are pure software — no LLM, no MCP protocol awareness. The proxy wraps them in MCP for Claude and JSON-RPC for peer connections.

## What Lives Where

```
LLM LAND (reasoning)              SOFTWARE LAND (data, I/O)

Claude session                     Daemon (~200 lines)
├─ "claim bead km-tui.foo"        ├─ session registry
├─ "coordinate with flexily"      ├─ resource directory
├─ "this bug is because…"         ├─ leadership + coordination state
│                                  └─ event log
│  ── MCP boundary ──
│                                  Proxy (one process)
│  tribe_send(to, msg)             ├─ daemon client
│  bd_list(status: open)           ├─ plugin host
│  bd_create(title)                ├─ peer socket (multiplexed)
│                                  └─ resource socket (if provider)
│  Claude makes decisions.
│  Plugins execute them.           Plugins (in proxy process)
│                                  ├─ beads: readFileSync + jsonl parse
│                                  ├─ git: execSync("git log")
│                                  └─ linear: fetch() API calls
```

## Socket Layout

```
$XDG_RUNTIME_DIR/tribe/
├── daemon.sock                   # discovery broker
├── daemon.db                     # registry + coordination state
├── s-a1b2c3d4.sock              # proxy A peer socket (km chief)
├── s-e5f6g7h8.sock              # proxy B peer socket (km member)
├── s-i9j0k1l2.sock              # proxy C peer socket (decker chief)
├── r-f7c8a2.sock                # km beads resource (locked by proxy A)
├── r-3d9e1b.sock                # km git resource (locked by proxy B)
└── r-b4a6c0.sock                # decker git resource (locked by proxy C)
```

Opaque IDs. No project names in socket paths. Daemon directory maps IDs to metadata.

## Plugin Loading

Core plugins (tribe, beads, git) ship with bearly — pinned to the proxy version. Custom plugins load from `~/.config/tribe/plugins/` with manifest metadata:

```yaml
# ~/.config/tribe/plugins/linear/manifest.yaml
name: linear
version: 0.1.0
apiVersion: 1
detect: .linear/config
capabilities: [list, read, write]
```

Project-level overrides via `.tribe/plugins.yaml` for pinning or disabling specific plugins.

## Migration

### Phase 0: Contracts

- Canonical `project_id` (hash of realpath)
- Opaque `session_id` / endpoint identity
- Peer handshake with `protocol_version` + `generation`
- Define message classes (ephemeral, coordination state, durable handoff)
- Resource ownership model (socket lock)

### Phase 1: Decouple daemon from project I/O

- Remove `findBeadsDir()` from daemon
- Daemon takes resolved `--socket` and `--db`
- Plugins move into proxy (self-detect from cwd)
- Daemon still routes messages as fallback
- CLI connects via daemon socket

### Phase 2: Direct peer connections

- Proxies expose peer sockets at registration
- Session-to-session messages go direct (discover + connect)
- Coordination state in daemon (queryable, not just broadcasts)
- Observability via fire-and-forget event log
- Keep daemon routing as fallback during transition

### Phase 3: Resource sockets

- Plugins bid for resource ownership via socket lock
- Resource directory in daemon DB
- Cross-project resource access via discover + direct connect
- One provider per singleton resource per project

### Phase 4: Plugin packaging

- Plugin manifest with version/apiVersion
- `~/.config/tribe/plugins/` for custom plugins
- Project-level plugin overrides
- Compatibility checks at load time

### Phase 5: Remove legacy routing

- Only after metrics confirm direct mode is stable
- Remove message routing from daemon
- Remove messages table
- Verify observability replacement is sufficient

## What Gets Simpler

| Concern          | Before                        | After                        |
| ---------------- | ----------------------------- | ---------------------------- |
| Daemon           | 800 lines, routes everything  | ~200 lines, discovery only   |
| Cross-project    | Not possible                  | Discover + direct connect    |
| Plugin context   | Daemon cwd (wrong)            | Proxy cwd (right)            |
| Message routing  | All through daemon            | Direct peer sockets          |
| Resource access  | All through daemon            | Direct resource sockets      |
| Resource locking | None (duplicated providers)   | Socket bind = atomic lock    |
| Plugin crash     | Kills daemon                  | Kills one proxy              |
| Scaling          | Daemon bottleneck             | Peer-to-peer                 |
| Project identity | Directory basename (collides) | Hash of realpath (canonical) |
