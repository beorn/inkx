---
id: "@km/silvery/ag-canvas/incremental-sync"
aliases:
  - km-silvery.ag-canvas.incremental-sync
  - km-silvery-ag-canvas-incremental-sync
created_by: Bjørn Stabell
created_at: 2026-03-31T07:07:56Z
closed_at: 2026-03-31T07:32:36Z
close_reason: "Implemented in c4e7e807 + 312abd8: tests, delta sync, editing, mouse, scroll"
owner: bjorn@stabell.org
---

# [x] Incremental WebSocket sync (delta updates) @km/silvery #feature #P3

Replace full snapshot re-send on every mutation with delta updates. Currently serveRepo() re-collects all nodes via BFS and sends the entire tree on every repo.subscribe() callback. For large vaults (10k+ nodes) this is O(n) per mutation. Implement incremental protocol: server tracks which nodes changed, sends only deltas. Client applies patches to NodeCache instead of full re-hydrate.