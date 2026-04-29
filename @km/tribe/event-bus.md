---
id: "@km/tribe/event-bus"
aliases:
  - km-tribe.event-bus
  - km-tribe-event-bus
created_by: Bjørn Stabell
created_at: 2026-04-19T05:51:15Z
closed_at: 2026-04-19T06:37:32Z
close_reason: "Shipped: bearly 6c17df1 (fanout refactor) + 203c93b (Tests G+H) +
  57a37e7 (bundle + CHANGELOG). pushInterval, pushNewMessages, lastDelivered Map
  all deleted. broadcastToConnected fires synchronously at sendMessage time.
  Replay on reconnect reads from sessions.last_delivered_seq. Tests G (latency
  <100ms) + H (reconnect cursor) pass. 325/325 vendor + 20/20 slow tests green."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tribe.event-bus
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T22:51:15Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] tribe: event bus with journal — eliminate 1s polling + per-connection cursor drift @km/tribe #feature #P3 @Bjørn Stabell

blocks:: [[@km/tribe]]

Reframe tribe from SQL-polling to pub/sub. Delete pushInterval (1s tick), pushNewMessages() polling, and lastDelivered Map. Instead: sendMessage() fans out synchronously to connected clients whose sessionId matches recipient AND appends to journal. Replay on reconnect reads from messages WHERE rowid > session.last_delivered_seq. Kills the 1s delivery floor, the per-connection state drift, and the fragile ts/rowid filter the Phase 1.6 durability work had to wrestle with. Depends on: @km/bear/unified-daemon (must land first; doing both concurrently is merge hell). Effort: 2-3 days in a worktree. Full design captured in /big analysis 2026-04-18.