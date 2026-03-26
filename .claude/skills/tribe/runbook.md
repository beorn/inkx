# Chief Runbook

Operational runbook for the tribe chief session. Execute these checks proactively.

## On Session Start

1. `tribe_join(name: "chief", role: "chief", domains: [...])`
2. `tribe_sessions()` — verify all expected sessions are connected
3. `bd ready` — check available work for assignment

## Periodic Health Check (every ~15 min)

Run these checks proactively. Don't wait to be asked.

### 1. Version Check
```
Broadcast: "Reload tribe MCP to pick up latest code: tribe_reload(reason: 'latest')"
```
After ANY tribe.ts or plugins.ts change, immediately broadcast reload instruction. If reload won't fix it (schema change, new tool), tell user: "Sessions need restart — run /mcp to reload tribe server."

### 2. Name Check
```bash
tribe_sessions()
```
Any `member-*` names? Send them: `tribe_rename(new_name: "your-domain")`. Suggest domain names based on their work.

### 3. Blocker Check
```bash
bd blocked
```
Cross-match: if member A is blocked on something member B could unblock, coordinate immediately.

### 4. Connection Check
```bash
tribe_health()
```
- Heartbeat timeout? Session may be dead — prune it, reassign beads
- Never sent a message? May not have tribe MCP loaded — tell user
- Silent >30min? Send a query to check

### 5. Orphan Cleanup
```bash
# Check for dead PIDs in active sessions
sqlite3 .beads/tribe.db "SELECT name, pid FROM sessions WHERE pruned_at IS NULL"
```
For each PID, verify it's alive: `kill -0 <pid>`. Prune dead ones.

### 6. SQLite Health
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

- **Tribe calls hanging**: Check `ps aux | grep tribe.ts | wc -l` — too many processes = SQLite contention
- **Duplicate messages**: Check if auto-report is broadcasting vs sending to chief only
- **Orphan processes**: After tribe_reload, old process may survive. Check PIDs.
- **git index.lock**: Multiple sessions doing git ops. Wait, retry, or coordinate access.
- **Message replay**: After compaction, sessions re-deliver old messages. Use last_delivered_ts tracking.

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
