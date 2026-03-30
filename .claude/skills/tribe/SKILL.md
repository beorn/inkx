---
description: "Tribe coordination — check sessions, send messages, view health/history. Use when user says /tribe."
allowed-tools: mcp__tribe__tribe_sessions, mcp__tribe__tribe_send, mcp__tribe__tribe_broadcast, mcp__tribe__tribe_history, mcp__tribe__tribe_rename, mcp__tribe__tribe_health, Bash(sqlite3:*)
---

# Tribe

Cross-session coordination. Parse the subcommand from ARGUMENTS.

## Command Mapping

| User Says | Action |
|-----------|--------|
| `/tribe` | `tribe_sessions()` — show who's online |
| `/tribe status` | `tribe_sessions()` + `tribe_health()` — full dashboard |
| `/tribe health` | `tribe_health()` — warnings, silent members, unread counts |
| `/tribe sessions` | `tribe_sessions()` — list active sessions |
| `/tribe sessions --all` | `tribe_sessions(all=true)` — include dead sessions |
| `/tribe send <to> <message>` | `tribe_send(to, message)` — send notify message |
| `/tribe assign <to> <message>` | `tribe_send(to, message, type="assign")` — assign work |
| `/tribe query <to> <message>` | `tribe_send(to, message, type="query")` — ask a question |
| `/tribe broadcast <message>` | `tribe_broadcast(message)` — message everyone |
| `/tribe history` | `tribe_history(limit=20)` — recent messages |
| `/tribe history <name>` | `tribe_history(with=name, limit=20)` — messages with specific session |
| `/tribe rename <new_name>` | `tribe_rename(new_name)` — rename this session |
| `/tribe whoami` | Show this session's name, role, and domains |
| `/tribe db <sql>` | `sqlite3 .beads/tribe.db "<sql>"` — raw query |
| `/tribe log` | `sqlite3 .beads/tribe.db "SELECT sender, recipient, type, substr(content,1,80), datetime(ts/1000,'unixepoch','localtime') FROM messages ORDER BY ts DESC LIMIT 20"` |
| `/tribe events` | `sqlite3 .beads/tribe.db "SELECT type, session, datetime(ts/1000,'unixepoch','localtime') FROM events ORDER BY ts DESC LIMIT 20"` |
| `/tribe sync` | Broadcast asking all members to ensure their work is tracked in beads (see below) |
| `/tribe rollcall` | Broadcast asking all members to report name, status, and current work |

## Output Format

Keep output concise. For `tribe_sessions`, format as a table. For `tribe_health`, highlight warnings. For `tribe_history`, show as a chat log with timestamps.

## `/tribe sync` Protocol

Broadcast this message to all members:

```
Sync: ensure work is tracked in beads (bd create/update/close as needed).

Reply in ONE short message, plain text, no markdown:
"Name | Idle: Xm | Created: N, Closed: N | Blockers: none | Status: idle/busy"

If you received multiple old messages, batch-acknowledge: "Ack N old messages" — don't respond individually.
```

After responses come in:
1. Summarize the results as a table for the user
2. **Cross-match blockers**: if member A is blocked on something member B could unblock, proactively suggest the assignment or send a tribe_send to coordinate
3. **Infrastructure conflicts**: check for overlapping worktrees, concurrent test runs, half-migrated code, unpublished package dependencies
4. **Suggest renames**: if a member has a generic name (member-N) but clear domain focus, suggest they `/tribe rename` to a domain name
5. Flag any beads that have been in_progress too long without updates

## `/tribe rollcall` Protocol

Broadcast this message:

```
Roll call: please report your current session name (/rename), what you're working on, and your status (idle/busy/blocked). Reply with tribe_send to chief.
```

Collect responses and present as a table.

## MCP Tools Available

| Tool | Purpose |
|------|---------|
| `tribe_send` | Send message to a specific member |
| `tribe_broadcast` | Message all members |
| `tribe_sessions` | List active sessions |
| `tribe_health` | Diagnostics: stale members, unread messages |
| `tribe_history` | Recent message log |
| `tribe_rename` | Rename this session |
| `tribe_join` | Re-register name/role/domains (after compaction) |
| `tribe_retro` | Generate retrospective report (metrics, timeline) |
| `tribe_reload` | Hot-reload MCP server with latest code from disk |

## CLI Tools (no MCP needed)

```bash
bun tribe status           # Active sessions
bun tribe send <to> <msg>  # Send message
bun tribe log              # Recent messages
bun tribe health           # Diagnostics
bun tribe-retro            # Retrospective report
bun tribe start            # Start daemon foreground
bun tribe stop             # Stop daemon
bun tribe reload           # Hot-reload daemon
bun tribe watch            # Live event dashboard
```

## Notes

- If tribe tools are not available (MCP server not loaded), tell the user to run `claude-tribe` instead of `claude`
- The tribe DB is at `.beads/tribe.db`
- `/tribe whoami` reads from the MCP server instructions (check if "chief" or "member" appears)
- After updating tribe.ts, use `tribe_reload` to pick up changes without restarting the session
- **Chief runbook**: See [runbook.md](runbook.md) for operational procedures (health checks, version sync, troubleshooting)
- **Message format**: Plain text only, 1-3 lines max. No markdown — it renders as ugly escaped text in MCP tool call display
- **Naming**: Use "runbook" (not "playbook") for operational procedures

## Daemon Mode

Tribe can run as a single daemon process per project. Sessions connect via Unix socket instead of each embedding the full tribe server.

### Daemon CLI
| Command | Action |
|---------|--------|
| `bun tribe start` | Start daemon in foreground (for debugging) |
| `bun tribe stop` | Stop daemon (SIGTERM) |
| `bun tribe reload` | Hot-reload daemon code (SIGHUP) |
| `bun tribe watch` | Live event stream dashboard |

### Architecture
- **Daemon** (`tribe-daemon.ts`): Single process, owns DB, plugins, session registry. Unix socket IPC.
- **Proxy** (`tribe-proxy.ts`): Thin MCP server forwarding to daemon. ~186 lines, no DB access.
- **Auto-start**: Proxy spawns daemon if not running. Auto-quit after 30s with no clients.
- **Hot-reload**: SIGHUP re-execs daemon with socket fd transfer. No connection loss.
- **Socket**: `.beads/tribe.sock` (per-project, auto-discovered)
