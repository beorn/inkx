# Tribe Daemon

Single daemon process per project. Claude Code sessions and CLI tools connect via Unix socket.

```
Claude Code 1 → MCP proxy ──┐
Claude Code 2 → MCP proxy ──┤
Claude Code 3 → MCP proxy ──┼──→ Unix socket → tribe-daemon
Terminal      → tribe CLI ───┤     (single process)
Manual start  → tribe start ─┘     owns everything
```

## Architecture

The daemon is the single owner of all shared state:

- **SQLite DB** — single writer, no contention
- **Git poller** — one instance, no dedup needed
- **Beads watcher** — one instance, no dedup needed
- **Session registry** — in-memory, authoritative (socket liveness = truth)
- **Leader assignment** — daemon assigns chief directly
- **Message routing** — push-based, immediate delivery
- **Source updates** — fs.watch + SIGHUP hot-reload

## MCP Proxy

Thin (~230 lines). No DB access, no polling, no state:

1. Discover daemon socket
2. Connect (auto-start daemon if not running)
3. Handshake: `{ project, pid, claudeSessionId, name, role, domains }`
4. Forward MCP tool calls → daemon (JSON-RPC over socket)
5. Receive notifications ← daemon (pushed, not polled)
6. On disconnect: daemon cleans up session automatically

## Socket Discovery

```
--socket flag > TRIBE_SOCKET env > user-level socket (~/.local/share/tribe/tribe.sock)
```

One socket per user. `$XDG_RUNTIME_DIR/tribe.sock` if available, otherwise `~/.local/share/tribe/tribe.sock`. No per-project sockets.

## Lifecycle

### Starting

1. **Auto-start** (default): MCP proxy tries `connect()`. ECONNREFUSED or ENOENT → spawn daemon as detached child, retry with backoff.
2. **Manual start**: `bun tribe start` — foreground mode for debugging, logs to stdout.
3. **System service**: launchd plist (macOS) or systemd unit (Linux) for always-on setups.

PID file at `.beads/tribe.pid` for signal targeting and stale detection.

### Stopping

1. **Auto-quit**: Tracks connected clients. Last disconnect → 30s grace timer → clean exit, remove socket + PID file. New connection cancels timer.
2. **Manual stop**: `bun tribe stop` or `kill $(cat .beads/tribe.pid)` → SIGTERM → clean shutdown.
3. **Grace period**: `--quit-timeout=30` (seconds). 0 = immediate, -1 = never auto-quit.

## Hot-Reload

Code updates without losing connections:

1. **SIGHUP handler** — re-exec with `--fd=N` passing the listening socket fd. New process inherits socket, old connections drain naturally.
2. **fs.watch trigger** — daemon watches its own source directory. File change → auto-SIGHUP after 500ms debounce.
3. **tribe_reload tool** — proxy sends reload request → daemon SIGHUPs itself.
4. **CLI** — `bun tribe reload` sends SIGHUP to PID from `.beads/tribe.pid`.
5. **Source hash guard** — skip re-exec if source unchanged.
6. **Authorized signal gate** — SIGHUP re-exec requires prior authorization call (prevents stray signals from causing unexpected restarts).
7. **Granular reload plan** — config/plugin param changes apply in-place (hot). Code changes trigger re-exec. Subsystems (git poller, beads watcher) restart independently.
8. **Restart sentinel** — new process reads sentinel file to distinguish restart from fresh start (affects reconnection behavior).

## Protocol

JSON-RPC 2.0 over Unix socket (newline-delimited JSON):

```json
// Request (proxy → daemon)
{"jsonrpc":"2.0","id":1,"method":"tribe_send","params":{"to":"member-1","message":"hello"}}

// Response (daemon → proxy)
{"jsonrpc":"2.0","id":1,"result":{"sent":true,"id":"msg-uuid"}}

// Notification (daemon → proxy, pushed)
{"jsonrpc":"2.0","method":"channel","params":{"from":"chief","type":"notify","content":"..."}}
```

### Handshake

On connect, proxy sends a `register` call:

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "register",
  "params": {
    "project": "/path/to/project",
    "pid": 12345,
    "claudeSessionId": "abc-123",
    "name": "silvery",
    "role": "member",
    "domains": ["silvery", "flexily"]
  }
}
```

Daemon responds with session assignment:

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "sessionId": "uuid",
    "name": "silvery",
    "role": "member",
    "chief": "chief"
  }
}
```

## Auth

1. **Filesystem permissions** — Unix socket file owned by user. Only same-UID processes can connect.
2. **Project binding** — per-project sockets are inherently project-scoped. Per-user sockets check `project` in handshake.
3. **No crypto** — same-machine, same-user. Filesystem perms are sufficient.

## Session Lifecycle

| Event                       | Daemon action                                                    |
| --------------------------- | ---------------------------------------------------------------- |
| Client connects + registers | Add to session map, assign name/role, notify others              |
| Client sends tool call      | Execute against DB, return result                                |
| Bead change detected        | Push notification to relevant clients (claimed_by match)         |
| Git commit detected         | Push notification to ONE client (round-robin or chief)           |
| Client disconnects          | Remove from session map, notify others, start quit timer if last |
| SIGHUP                      | Re-exec, transfer socket fd, new process re-reads DB state       |

## Message Delivery

Push-based, immediate:

1. Client A calls `tribe_send(to: "B", message: "hello")`
2. Daemon writes to DB (single writer)
3. Daemon looks up B's socket connection
4. Daemon pushes notification to B immediately
5. If B is not connected, message stays in DB for reconnection

On reconnect, daemon sends undelivered messages (since last `delivered_seq`) as a batch.

## CLI

```
bun tribe status          # Sessions with uptime, heartbeat, role, domains
bun tribe sessions [--all]# List sessions (--all includes disconnected)
bun tribe send <to> <msg> # Send message (immediate push via daemon)
bun tribe log [--limit N] # Recent messages
bun tribe health          # Diagnostics + daemon uptime
bun tribe start           # Start daemon in foreground
bun tribe stop            # Stop daemon (SIGTERM)
bun tribe reload          # Hot-reload daemon (SIGHUP)
bun tribe retro           # Retrospective report
```

CLI connects to daemon via same socket protocol. Additional JSON-RPC methods:

| Method       | Purpose                                                |
| ------------ | ------------------------------------------------------ |
| `cli_status` | Sessions + daemon info (uptime, client count, DB path) |
| `cli_log`    | Message history with limit/filter                      |
| `cli_health` | Full diagnostics                                       |
| `cli_daemon` | Daemon process info                                    |

Fallback: `--offline` flag → direct DB read when daemon is not running.

Future: `bun tribe watch` — live TUI dashboard via persistent socket connection.
