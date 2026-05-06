---
mentions:
  - km
id: "@km/tribe/v2-phase0"
aliases:
  - km-tribe.v2-phase0
  - km-tribe-v2-phase0
created_by: claude:19080504
created_at: 2026-03-31T06:15:31Z
closed_at: 2026-03-31T06:32:47Z
close_reason: "Implemented: resolveProjectId (hash of realpath),
  TRIBE_PROTOCOL_VERSION=2, coordination state table, event_log table,
  leadership epoch/fencing"
owner: bjorn@stabell.org
---

# [x] Phase 0: project_id, protocol version, coordination state table @km/tribe #task #P2

Add canonical project_id (hash of realpath), protocol_version to handshake, coordination state table to daemon DB. Foundation for all subsequent phases.

