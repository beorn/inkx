---
mentions:
  - km
id: "@km/bearly/daemon-spine-phase2"
aliases:
  - km-bearly.daemon-spine-phase2
  - km-bearly-daemon-spine-phase2
created_by: claude:2405c72e
created_at: 2026-04-26T22:14:20Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.daemon-spine-phase2
    depends_on_id: km-bearly.daemon-spine
    type: parent-child
    created_at: 2026-04-26T15:14:30Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly.daemon-spine
---

# [ ] Phase 2: reduce tools/lib/tribe/socket.ts to thin re-exports (~320 LOC delete) @km/bearly #task #P3

blocks:: [[@km/bearly/daemon-spine]]

Rewrite tools/lib/tribe/socket.ts as ~80 LOC of pure re-exports from @bearly/daemon-spine (down from 402). Update tribe-proxy.ts + tribe-daemon.ts imports.

Keep tribe-specific:

- TRIBE_PROTOCOL_VERSION = 2 constant
- Any tribe-only utility wrappers (currently none)

Note: phases 1+2 may ship together since Phase 2 is mostly an import swap; bead-d may close both during the in-flight Phase 1 sweep.

Design doc: hub/bearly/design/daemon-spine-consolidation.md

