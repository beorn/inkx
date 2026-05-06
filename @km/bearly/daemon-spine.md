---
mentions:
  - bearly
  - km
id: "@km/bearly/daemon-spine"
aliases:
  - km-bearly.daemon-spine
  - km-bearly-daemon-spine
created_by: claude:2405c72e
created_at: 2026-04-26T22:13:46Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.daemon-spine
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-26T15:13:56Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [ ] [epic] Daemon-spine consolidation — extract @bearly/daemon-spine, delete ~750 LOC duplicate IPC across vendor/bearly @km/bearly #epic #P2

blocks:: [[@km/bearly]]

Consolidate Unix socket IPC plumbing duplicated across vendor/bearly. Extract @bearly/daemon-spine package, then rewrite call sites as thin re-exports.

Design doc: hub/bearly/design/daemon-spine-consolidation.md

Pro plateau-distance review's third pillar after spawn-close-hardening + MCP-as-tribe-plugin.

Total target: ~750-900 LOC delete across 4 phases:

- Phase 1: extract @bearly/daemon-spine + rewrite lore/socket.ts (~250 LOC)
- Phase 2: reduce tools/lib/tribe/socket.ts to re-exports (~320 LOC)
- Phase 3: consolidate hot-reload pattern (~60 LOC)
- Phase 4: consolidate idle-quit + socket cleanup (~60 LOC)

