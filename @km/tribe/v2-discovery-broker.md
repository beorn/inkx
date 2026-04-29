---
id: "@km/tribe/v2-discovery-broker"
aliases:
  - km-tribe.v2-discovery-broker
  - km-tribe-v2-discovery-broker
created_by: claude:19080504
created_at: 2026-03-31T06:07:48Z
closed_at: 2026-04-02T20:30:10Z
close_reason: "Grooming: all 4 children closed. Discovery broker, peer sockets,
  github resource shipped."
---

# [x] Tribe v2: discovery broker + peer-to-peer + socket locking @km/tribe #epic #P3 @claude:19080504

Implement the tribe v2 architecture per docs/design/tribe-decoupling.md.

Phase 1 (DONE): Decouple daemon from beads — daemon takes resolved paths, plugins self-discover.

Remaining phases:
- Phase 0: Contracts — canonical project_id (hash of realpath), peer handshake protocol, message class definitions, resource ownership model
- Phase 2: Direct peer connections — proxies expose peer sockets, direct messaging, coordination state in daemon
- Phase 3: Resource sockets — socket bind = ownership lock, resource directory, cross-project access
- Phase 4: Plugin packaging — manifests, ~/.config/tribe/plugins/, version compatibility
- Phase 5: Remove legacy routing — only after stability confirmed

Key design decisions (from 2 rounds of GPT 5.4 Pro review):
- One proxy socket, multiplexed resources (not per-plugin sockets)
- Socket bind() as atomic ownership lock (daemon, resources)
- Daemon is discovery broker only (~200 lines), no message routing
- Three message classes: ephemeral (direct), coordination state (daemon), durable (beads)
- Leadership with epoch/fencing per project