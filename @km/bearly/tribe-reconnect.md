---
mentions:
  - km
  - claude
id: "@km/bearly/tribe-reconnect"
aliases:
  - km-bearly.tribe-reconnect
  - km-bearly-tribe-reconnect
created_by: claude:19080504
created_at: 2026-03-30T22:19:28Z
closed_at: 2026-03-30T22:22:25Z
close_reason: "Fixed: (1) proxy auto-reconnects with exponential backoff on
  daemon disconnect, (2) watch TUI uses unique connId as React key instead of
  session name, (3) daemon deduplicates session names on register, (4) all tribe
  tools migrated from process.stderr.write to loggily, (5) added socket to
  TribeArgs type"
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Tribe: proxy auto-reconnect + duplicate name/key bugs @km/bearly #bug #P2 @claude:19080504

Three related bugs when daemon restarts or reloads:

1. Proxy exits on daemon disconnect instead of auto-reconnecting (process.exit(1))
2. Watch TUI uses session name as React key — duplicate names cause React warnings
3. Daemon allows duplicate session names (two sessions both named 'chief')

Fixes:

- Proxy: exponential backoff reconnect (500ms-10s, 15 attempts max), re-register + re-subscribe
- Watch: use daemon connId as unique key instead of session name
- Daemon: deduplicate names on register (suffix -2, -3 etc if taken)
- All: migrate process.stderr.write to loggily structured logging

