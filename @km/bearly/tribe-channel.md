---
mentions:
  - km
  - claude
id: "@km/bearly/tribe-channel"
aliases:
  - km-bearly.tribe-channel
  - km-bearly-tribe-channel
created_by: claude:19080504
created_at: 2026-03-23T06:44:51Z
closed_at: 2026-03-23T06:54:26Z
close_reason: "Phase 1 complete: tribe channel plugin
  (vendor/tools/tools/tribe.ts) with SQLite bus, session registration,
  heartbeat, 6 MCP tools (send/broadcast/sessions/history/rename/health),
  per-session read tracking, priority ordering, alias-based rename support. 12
  tests passing."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Phase 1: Tribe MCP channel plugin @km/bearly #feature #P1 @claude:19080504

Build tribe-channel.ts — the MCP channel server that each Claude Code session loads. Session registration + heartbeat, message send/broadcast/history/rename tools, poll loop + channel notifications, SQLite schema creation (sessions, aliases, messages, cursors, events, retros tables). Deliverable: two Claude Code sessions can exchange messages.

