---
mentions:
  - km
  - Bjørn
id: "@km/tribe/message-durability"
aliases:
  - km-tribe.message-durability
  - km-tribe-message-durability
created_by: Bjørn Stabell
created_at: 2026-04-19T04:29:01Z
closed_at: 2026-04-19T04:58:13Z
close_reason: >-
  Phase 1.6 landed. Daemon now persists sessions.last_delivered_ts/seq on every
  push; on register, the in-memory cursor is seeded from the adopted identity
  row (Phase 1.5) or from max rowid for fresh sessions. Switched push-loop
  filter from ts-based to rowid-based (monotonic) — fixes a latent same-ms
  collision bug. logActivity now drains via pushNewMessages() instead of jumping
  the cursor directly.


  Test coverage: tests/tribe-durability.slow.test.ts Test E (no duplicate
  delivery after SIGKILL+reconnect) + Test F (messages queued during down-time
  delivered on reconnect). tribe-self-heal (5) and tribe-session-identity (4)
  continue to pass; full vendor suite 325 pass.


  Commits: bearly 8848a6a + dbd11de + 4650f47; km 728163c3f.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tribe.message-durability
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T21:29:01Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] tribe: message durability across daemon restart @km/tribe #feature #P3 @Bjørn Stabell

blocks:: [[@km/tribe]]

When the daemon crashes mid-conversation, messages not yet written to SQLite are lost, and messages written but not yet pushed to a disconnected client are also lost (the push cursor is per-connection in-memory, not persisted). Design: push cursor persisted per session, ack required from client for delivery, WAL for in-flight queue. SQLite WAL mode already gives us crash-safe writes; remaining gap is the push path. Scope: ~50 LOC in messaging.ts + daemon push loop. Depends on: integration test first (to assert the behavior).

