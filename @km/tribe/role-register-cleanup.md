---
id: "@km/tribe/role-register-cleanup"
aliases:
  - km-tribe.role-register-cleanup
  - km-tribe-role-register-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-19T17:55:27Z
closed_at: 2026-04-20T18:46:26Z
close_reason: Dissolved. Roles are km-beads tasks with assigned_to + due_at
  (hub/km/design/tribe-matrix.md). No separate role/register split.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.role-register-cleanup
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-19T10:55:26Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] tribe: split overloaded role; unify register and tribe.join @km/tribe #feature #P3

blocks:: [[@km/tribe]]

Pro review 2026-04-19 grouped three related cleanups:

- P1.2: role currently conflates three concepts: (1) connection state (pending/connected), (2) participant kind (daemon/watch/member), (3) current leadership (chief). Split into three separate fields: connection_state, participant_kind, is_chief (or use deriveChiefId as truth for #3).
- P1.4: register RPC and tribe.join MCP tool both do 'become a session with these props' but via different code paths. Consolidate: tribe.join is the MCP entry point, register is the internal RPC. They should share one apply-registration function.
- P2.4: TribeContext has overlapping get/set APIs (getName/setName/name/initialName). Pick one shape.

Design: introduce ParticipantKind enum (daemon|member|watch), keep connection state in the clients Map (connected or not), derive chief via deriveChiefId. TribeContext becomes the participant record; one factory function.

Effort: ~1 day. Blast radius is bounded (6-8 files).