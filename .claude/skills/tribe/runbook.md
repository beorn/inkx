# Chief Runbook

Operational runbook for the tribe chief session. Execute these checks proactively.

## Single Chief Invariant

There MUST be exactly ONE chief at any time. Multiple chiefs cause confusion (duplicate queries, conflicting assignments, members don't know who to report to).

On session start:
1. Check `tribe_sessions()` for existing chiefs
2. If another chief exists and is alive (heartbeat recent), DO NOT claim chief — become a member instead
3. If another chief exists but is dead/stale (heartbeat >30s old), prune it and take over
4. The leader lease (`tribe_leadership`) enforces this in code, but long-running sessions may predate the lease code

If you detect multiple chiefs during a health check:
1. Identify which chief is actually coordinating (sending assignments, responding to queries)
2. The other chief should `tribe_join(role: "member")` or be pruned
3. Notify the user: "Multiple chiefs detected — <name> stepping down"
4. This must be resolved within minutes, not hours

## On Session Start

1. `tribe_join(name: "chief", role: "chief", domains: [...])`
2. `tribe_sessions()` — verify all expected sessions are connected, check for duplicate chiefs
3. `bd ready` — check available work for assignment

## Periodic Health Check (every ~15 min)

Run these checks proactively. Don't wait to be asked.

### 1. Single Chief Check
```bash
tribe_sessions()
```
Count sessions with role=chief. If >1, resolve immediately (see Single Chief Invariant above).

### 2. Version Check
```
Broadcast: "Reload tribe MCP to pick up latest code: tribe_reload(reason: 'latest')"
```
After ANY tribe.ts or plugins.ts change, immediately broadcast reload instruction. If reload won't fix it (schema change, new tool), tell user: "Sessions need restart — run /mcp to reload tribe server."

### 3. Name Check
```bash
tribe_sessions()
```
Any `member-*` names? Send them: `tribe_rename(new_name: "your-domain")`. Suggest domain names based on their work.

### 4. Blocker Check
```bash
bd blocked
```
Cross-match: if member A is blocked on something member B could unblock, coordinate immediately.

### 5. Connection Check
```bash
tribe_health()
```
- Heartbeat timeout? Session may be dead — prune it, reassign beads
- Never sent a message? May not have tribe MCP loaded — tell user
- Silent >30min? Send a query to check

### 6. Orphan Cleanup
```bash
# Check for dead PIDs in active sessions
sqlite3 .beads/tribe.db "SELECT name, pid FROM sessions WHERE pruned_at IS NULL"
```
For each PID, verify it's alive: `kill -0 <pid>`. Prune dead ones.

### 7. SQLite Health
```bash
sqlite3 .beads/tribe.db "PRAGMA integrity_check; PRAGMA wal_checkpoint(TRUNCATE);"
```
If WAL file grows large, checkpoint it.

## Message Format Rules

All tribe messages (chief and members) MUST follow:
- 1-3 lines max, plain text only
- NO markdown (`**bold**`, `# headers`, `- bullets`) — renders as ugly escaped text
- Sync responses: `Name | Idle: Xm | Created: N, Closed: N | Blockers: none | Available`
- Status: `Claimed km-foo.bar` or `Committed abc1234 fix(scope): msg` or `Available`
- Batch old messages: `Ack N old messages, no action needed`

## After Code Changes to Tribe

Every time tribe.ts, plugins.ts, or related files are modified:

1. Commit and push the submodule + km
2. Broadcast: `tribe_reload(reason: "description of change")`
3. If schema changed (new columns, new tables): tell user sessions need full restart
4. Verify at least one member successfully reloaded (wait for response)

## Proactive Troubleshooting

Don't wait for reports — actively investigate when you suspect problems:

- **Multiple chiefs**: Check tribe_sessions for role=chief count. Resolve within minutes.
- **Tribe calls hanging**: Check `ps aux | grep tribe.ts | wc -l` — too many processes = SQLite contention
- **Duplicate messages**: Check if auto-report is broadcasting vs sending to chief only. Kill orphan processes.
- **Orphan processes**: After tribe_reload, old process may survive. Check PIDs.
- **git index.lock**: Multiple sessions doing git ops. Wait, retry, or coordinate access.
- **Message replay**: After compaction, sessions re-deliver old messages. Cursor recovery handles this in v0.5.2+.

## Work Assignment

When idle members are available:
1. `bd ready` — get top-priority unblocked beads
2. Match member domain expertise to bead scope
3. `tribe_send(to: member, type: "assign", message: "Take km-foo.bar (P2): brief description")`
4. Track assignment — follow up if no response in 10 min

## Session End Protocol

Before ending chief session:
1. `tribe_sync` — ensure all work is tracked
2. Verify all assigned work has beads
3. `git push` — push any uncommitted changes
4. Note any in-progress items for next chief session
