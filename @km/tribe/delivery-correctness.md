---
id: "@km/tribe/delivery-correctness"
aliases:
  - km-tribe.delivery-correctness
  - km-tribe-delivery-correctness
created_by: Bjørn Stabell
created_at: 2026-04-19T17:54:51Z
closed_at: 2026-04-19T18:16:44Z
close_reason: "Fixed in bearly a12dc91 (P0.5/P0.6/P1.7) + afb35e7 (P1.3).
  Regression tests: Test I (250-msg backlog drained fully on reconnect) + Test J
  (journal untouched by disconnect) in tribe-durability.slow.test.ts. 340 vendor
  tests + 37 slow tests all pass. P2.1 notification-machinery cleanup deferred —
  the polling-era remnants in tribe-daemon.ts are pure comments now, no dead
  code. bearly commits pushed. km submodule bumped and pushed: eb2814608."
---

# [x] tribe: fix message-loss + cursor-advance bugs in replay/disconnect paths @km/tribe #bug #P0 @Bjørn Stabell

blocks:: [[@km/tribe]]

Pro review 2026-04-19 uncovered 5 delivery defects — at least two are real message loss.

- P0.5 (BUG): Replay on reconnect selects LIMIT 200 messages AND unconditionally advances cursor to the latest rowid. If >200 messages accumulated during disconnect, the 201st..Nth are silently dropped AND the cursor moves past them. User never sees them.
- P0.6 (BUG): On disconnect, the daemon DELETEs queued directs for that sessionId blindly. Fights the durability story: messages that were committed to journal but not yet delivered vanish if the recipient disconnects before fanout.
- P1.3: Old poll-era state (cursors table, reads table, pollMessages prepared statement) still exists alongside new push-era state (sessions.last_delivered_*). Delete the old or consolidate.
- P1.7: Replay LIMIT 200 silently truncates even on in-range reconnects. Make it page or stream.
- P2.1: Half-deleted notification machinery from the pre-event-bus world — comments, variables, unreachable code. Finish the deletion.

Design: no cursor advancement without client ack. Use continuation token for paged replay. Never delete undelivered journal rows on disconnect. Delete the cursors + reads tables + pollMessages.

Effort: 1 day. MUST have regression tests (kill-and-recover + queue-builds-during-down-time).