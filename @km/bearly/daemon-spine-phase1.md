---
id: "@km/bearly/daemon-spine-phase1"
aliases:
  - km-bearly.daemon-spine-phase1
  - km-bearly-daemon-spine-phase1
created_by: claude:2405c72e
created_at: 2026-04-26T22:14:07Z
started_at: 2026-04-26T22:14:46Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.daemon-spine-phase1
    depends_on_id: km-bearly.daemon-spine
    type: parent-child
    created_at: 2026-04-26T15:14:15Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [/] Phase 1: extract @bearly/daemon-spine package, rewrite lore/socket.ts as adapter (~250 LOC delete) @km/bearly #task #P2

blocks:: [[@km/bearly/daemon-spine]]

Extract @bearly/daemon-spine package at vendor/bearly/packages/daemon-spine/ with src/{rpc,parser,client,paths,util}.ts. Rewrite plugins/tribe/lore/lib/socket.ts as a thin adapter (~100 LOC from 364).

Surface:
- JSON-RPC types + makers (makeRequest/makeResponse/makeError/makeNotification)
- createLineParser
- DaemonClient interface + connectToDaemon, connectOrStart, createReconnectingClient
- withDaemonCall (deadline-bounded structured-error wrapper)
- resolveSocketPath / resolvePeerSocketPath

Phases 1+2 may ship together since Phase 2 is just an import swap. Bead-d may close both.

Design doc: hub/bearly/design/daemon-spine-consolidation.md