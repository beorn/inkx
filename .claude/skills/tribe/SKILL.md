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
Sync check: ensure ALL your work is tracked in beads.

For each piece of work you did this session:
1. If no bead exists, create one: bd create --title="<what>" --type=task|bug|feature --priority=2
2. If bead exists but is open, update status: bd update <id> --claim (if not claimed)
3. If work is done, close it: bd close <id> --reason="<what was done>"
4. If you created new beads, parent them: bd update <id> --parent <epic>

Also report:
- Your Claude session ID: run `echo $CLAUDE_SESSION_ID` in bash
- Your /rename session name (if set)
- Beads summary: created/updated/closed counts
- BLOCKERS: any open beads you're blocked on, what's blocking you, and what would unblock you
- NEEDS: anything another member could help with (review, info, shared file access)
- INFRASTRUCTURE: any active worktrees, in-flight refactors, running test suites, unpublished npm packages, or shared config changes

After syncing, reply to chief with your summary.
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

## Notes

- If tribe tools are not available (MCP server not loaded), tell the user to run `claude-tribe` instead of `claude`
- The tribe DB is at `.beads/tribe.db`
- `/tribe whoami` reads from the MCP server instructions (check if "chief" or "member" appears)
