---
description: "Tribe coordination — check sessions, send messages, view health/history. Use when user says /tribe."
argument-hint: [sessions|send|health|history|retro|rename]
allowed-tools: mcp__plugin_tribe_tribe__tribe_members, mcp__plugin_tribe_tribe__tribe_send, mcp__plugin_tribe_tribe__tribe_broadcast, mcp__plugin_tribe_tribe__tribe_history, mcp__plugin_tribe_tribe__tribe_rename, mcp__plugin_tribe_tribe__tribe_health, Bash(sqlite3:*)
---

# Tribe

Cross-session coordination. Parse the subcommand from ARGUMENTS.

> **Namespace** (@bearly/tribe 0.10.0): every MCP tool lives under the unified `tribe.*` namespace. The old `tribe_*` underscored names were removed in 0.10.0 — calling them now returns "unknown tool". See `vendor/bearly/plugins/tribe/CHANGELOG.md` for the full purge scope.

## Command Mapping

| User Says | Action |
|-----------|--------|
| `/tribe` | Consult the tribe — broadcast the current question/topic to all members for input |
| `/tribe sessions` or `/tribe who` | `tribe.members()` — show who's online |
| `/tribe status` | `tribe.members()` + `tribe.health()` — full dashboard |
| `/tribe health` | `tribe.health()` — warnings, silent members, unread counts |
| `/tribe sessions` | (same as above) |
| `/tribe sessions --all` | `tribe.members(all=true)` — include dead sessions |
| `/tribe send <to> <message>` | `tribe.send(to, message)` — send notify message |
| `/tribe assign <to> <message>` | `tribe.send(to, message, type="assign")` — assign work |
| `/tribe query <to> <message>` | `tribe.send(to, message, type="query")` — ask a question |
| `/tribe broadcast <message>` | `tribe.broadcast(message)` — message everyone |
| `/tribe history` | `tribe.history(limit=20)` — recent messages |
| `/tribe history <name>` | `tribe.history(with=name, limit=20)` — messages with specific session |
| `/tribe rename <new_name>` | `tribe.rename(new_name)` — rename this session |
| `/tribe whoami` | Show this session's name, role, and domains |
| `/tribe db <sql>` | `sqlite3 ~/.local/share/tribe/tribe.db "<sql>"` — raw query |
| `/tribe log` | `sqlite3 ~/.local/share/tribe/tribe.db "SELECT sender, recipient, type, substr(content,1,80), datetime(ts/1000,'unixepoch','localtime') FROM messages ORDER BY ts DESC LIMIT 20"` |
| `/tribe events` | `sqlite3 ~/.local/share/tribe/tribe.db "SELECT type, session, datetime(ts/1000,'unixepoch','localtime') FROM events ORDER BY ts DESC LIMIT 20"` |
| `/tribe sync` | Broadcast asking all members to ensure their work is tracked in beads (see below) |
| `/tribe rollcall` | Broadcast asking all members to report name, status, and current work |

## Output Format

Keep output concise. For `tribe.members`, format as a table. For `tribe.health`, highlight warnings. For `tribe.history`, show as a chat log with timestamps.

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
2. **Cross-match blockers**: if member A is blocked on something member B could unblock, proactively suggest the assignment or send a `tribe.send` to coordinate
3. **Infrastructure conflicts**: check for overlapping worktrees, concurrent test runs, half-migrated code, unpublished package dependencies
4. **Suggest renames**: if a member has a generic name (member-N) but clear domain focus, suggest they `/tribe rename` to a domain name
5. Flag any beads that have been in_progress too long without updates

## `/tribe rollcall` Protocol

Broadcast this message:

```
Roll call: please report your current session name (/rename), what you're working on, and your status (idle/busy/blocked). Reply with tribe.send to chief.
```

Collect responses and present as a table.

## MCP Tools Available

| Tool | Purpose |
|------|---------|
| `tribe.send` | Send message to a specific member |
| `tribe.broadcast` | Message all members |
| `tribe.members` | List active sessions |
| `tribe.health` | Diagnostics: stale members, unread messages |
| `tribe.history` | Recent message log |
| `tribe.rename` | Rename this session |
| `tribe.join` | Re-register name/role/domains (after compaction) |
| `tribe.retro` | Generate retrospective report (metrics, timeline) |
| `tribe.reload` | Hot-reload MCP server with latest code from disk |
| `tribe.leadership` | Query / claim / release the chief lease |
| `tribe.ask` / `tribe.brief` / `tribe.plan` / `tribe.session` / `tribe.workspace` / `tribe.inject_delta` | Lore (session history / memory) tools — see `.claude/skills/recall/` |

As of 0.10.0, the old names (`tribe_send`, `lore.ask`, etc.) have been removed entirely. Always use the dotted form.

## CLI Tools (no MCP needed)

```bash
bun tribe status           # Active sessions
bun tribe send <to> <msg>  # Send message
bun tribe log              # Recent messages
bun tribe health           # Diagnostics
bun tools/tribe-retro.ts   # Retrospective report
bun tribe start            # Start daemon foreground
bun tribe stop             # Stop daemon
bun tribe reload           # Hot-reload daemon
bun tribe watch            # Live event dashboard
bun tribe install          # Install Claude Code hooks (SessionStart/SessionEnd)
bun tribe uninstall        # Remove installed hooks
bun tribe doctor           # Verify daemon + MCP + hooks + env
```

## Notes

- If tribe tools are not available (MCP server not loaded), tell the user to run `claude-tribe` instead of `claude`
- The tribe DB is at `~/.local/share/tribe/tribe.db` (user-global default since 2026-04-18; legacy `.beads/tribe.db` is auto-migrated on first start)
- `/tribe whoami` reads from the MCP server instructions (check if "chief" or "member" appears)
- After updating tribe.ts, use `tribe.reload` to pick up changes without restarting the session
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
- **Proxy** (`tribe-proxy.ts`): Thin MCP server forwarding to daemon. ~230 lines, no DB access.
- **Auto-start**: Proxy spawns daemon if not running. Auto-quit after 30s with no clients.
- **Hot-reload**: SIGHUP re-execs daemon with socket fd transfer. No connection loss.
- **Socket**: `~/.local/share/tribe/tribe.sock` (user-global, auto-discovered; `TRIBE_SOCKET` env var overrides)
