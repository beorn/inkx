---
id: "@km/tribe/v2-phase2"
aliases:
  - km-tribe.v2-phase2
  - km-tribe-v2-phase2
created_by: claude:19080504
created_at: 2026-03-31T06:15:32Z
closed_at: 2026-03-31T06:32:47Z
close_reason: "Implemented: peer sockets in proxy, discover handler in daemon,
  direct messaging with daemon fallback, peer socket cleanup"
---

# [x] Phase 2: peer sockets + direct messaging @km/tribe #task #P2

Proxies expose peer sockets. Session-to-session messages go direct via discover + connect. Daemon keeps legacy routing as fallback.