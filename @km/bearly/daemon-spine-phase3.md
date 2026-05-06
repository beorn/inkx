---
mentions:
  - km
id: "@km/bearly/daemon-spine-phase3"
aliases:
  - km-bearly.daemon-spine-phase3
  - km-bearly-daemon-spine-phase3
created_by: claude:2405c72e
created_at: 2026-04-26T22:14:31Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.daemon-spine-phase3
    depends_on_id: km-bearly.daemon-spine
    type: parent-child
    created_at: 2026-04-26T15:14:37Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly.daemon-spine
---

# [ ] Phase 3: consolidate hot-reload pattern across tribe-daemon.ts + tribe-proxy.ts (~60 LOC delete) @km/bearly #task #P3

blocks:: [[@km/bearly/daemon-spine]]

Both tribe-daemon.ts (~lines 1680-1730) and tribe-proxy.ts (lines 414-426) import setupHotReload from ./lib/tribe/hot-reload.ts. Consolidate the hot-reload pattern (re-exec on source change, fd inheritance) into @bearly/daemon-spine or a sibling @bearly/daemon-util package.

Also covers:

- Idle-quit timer (QUIT_TIMEOUT pattern) — currently tribe-daemon only, but generic
- Peer socket setup (mkdirSync + chmod + listen, currently in tribe-proxy 72-147)

Open question: should peer-socket logic live in spine (generic) or stay tribe-specific? Lore has no peer socket today.

Design doc: hub/bearly/design/daemon-spine-consolidation.md

