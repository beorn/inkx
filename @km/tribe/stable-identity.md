---
mentions:
  - km
id: "@km/tribe/stable-identity"
aliases:
  - km-tribe.stable-identity
  - km-tribe-stable-identity
created_by: Bjørn Stabell
created_at: 2026-04-19T17:54:36Z
closed_at: 2026-04-20T18:46:25Z
close_reason: Dissolved. Under the new model (hub/km/design/tribe-matrix.md)
  name IS the stable identity. No separate persona_id or short_id field. Rename
  handled by km's existing link-rewriting.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.stable-identity
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-19T10:54:49Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] tribe: route/address by stable sessionId, not mutable name @km/tribe #feature #P1

blocks:: [[@km/tribe]]

Pro review 2026-04-19 found 4 related defects rooted in 'messages route by mutable name':

- P0.1: to='chief' isn't actually deliverable — broadcastToConnected filters by client.name, so only works if chief is literally named 'chief'. Route by role instead.
- P0.4: Session rows record daemon PID/CWD, not client PID/CWD (register writes happen in daemonCtx scope). Cursor-recovery-by-PID and health reports use wrong values.
- P1.1: Names are used as identity throughout: messages.sender, messages.recipient, UNIQUE constraint, dedup. A rename breaks mid-flight delivery. Must route by stable sessionId; names become labels only.
- P2.2: sessions.updated_at is touched on register, rename, and last-delivered — three semantics in one column. Split into registered_at, last_renamed_at, last_delivered_ts.

Design: introduce two concepts: 'address' (stable, sessionId-based) and 'label' (mutable name). All routing uses address. History/health/retro show the label at the time, but the join key is address.

Effort: 1-2 days. Touches messaging.ts, handlers.ts, database.ts, tribe-daemon.ts register, replay path.

