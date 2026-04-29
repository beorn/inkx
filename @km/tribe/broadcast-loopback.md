---
id: "@km/tribe/broadcast-loopback"
aliases:
  - km-tribe.broadcast-loopback
  - km-tribe-broadcast-loopback
created_by: Bjørn Stabell
created_at: 2026-04-09T15:08:03Z
closed_at: 2026-04-18T17:57:58Z
close_reason: "Shipped in bearly a77d619 (km bump 8641be2c9). Tribe daemon
  reloaded and migration verified: legacy .beads/tribe.db moved to
  ~/.local/share/tribe/tribe.db, breadcrumb .beads/tribe.db.moved left in place.
  Git lock messages now include session+PID. Broadcast self-filter verified
  already in place at DB query level, added verbatim-query regression tests (317
  bearly tests pass)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.broadcast-loopback
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T11:01:34Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Tribe broadcast echoes back to sender — should be filtered @km/tribe #bug #P2

blocks:: [[@km/tribe]]

## Symptom

When a session calls tribe_broadcast(message), the daemon delivers the message to ALL members including the sender. The sender then receives a notification of their own message as a tribe channel event, with from=<self>.

This causes:
1. Confusion in agents — they have to recognize "this is from myself" and ignore
2. Wasted context tokens — every broadcast adds N+1 messages to N receivers' contexts
3. Double-handling: an agent that sends a status message gets a notification back as if from another session

## Repro

1. tribe_broadcast(message="test") from session A
2. Session A receives its own message back as a channel event

## Root cause

The fan-out logic in the tribe daemon iterates all members and delivers, without excluding the sender's session name.

## Fix

In the daemon's broadcast handler, filter out the sender from the recipient list:

```python
for member in members:
    if member.name == sender.name: continue
    deliver(member, message)
```

Same fix needed wherever else fan-out happens (e.g., session-leave notifications — verify those don't echo too).

## Acceptance Criteria

- [ ] tribe_broadcast does not deliver to the sending session
- [ ] tribe_send to=* (wildcard) does not deliver to sender
- [ ] Test: A broadcasts, A's incoming queue is empty (no self-echo)
- [ ] No regression: B receives A's broadcast normally