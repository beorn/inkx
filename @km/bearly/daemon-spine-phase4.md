---
id: "@km/bearly/daemon-spine-phase4"
aliases:
  - km-bearly.daemon-spine-phase4
  - km-bearly-daemon-spine-phase4
created_by: claude:2405c72e
created_at: 2026-04-26T22:14:38Z
---

# [ ] Phase 4: consolidate idle-quit timer + socket cleanup patterns (~60 LOC delete) @km/bearly #task #P3

blocks:: [[@km/bearly/daemon-spine]]

Tribe daemon's idle-quit timer (QUIT_TIMEOUT logic) and socket cleanup patterns can be extracted as reusable utilities. Move to @bearly/daemon-spine (or @bearly/daemon-util) so future daemons (lore standalone, future MCPs) get them for free.

Pairs with Phase 3 — may ship together if hot-reload extraction lands the same package.

Design doc: hub/bearly/design/daemon-spine-consolidation.md