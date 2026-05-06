---
mentions:
  - km
id: "@km/inbox/zoom-derive"
aliases:
  - km-zoom-derive
  - "@km/_orphan/zoom-derive"
created_at: 2026-01-24T23:00:14Z
closed_at: 2026-01-24T23:08:29Z
---

# [x] Remove zoomStack from BoardState (derive from tree) @km/_orphan #task #P2

zoomStack duplicates information already in tree structure. Each node has parent_id, so we can derive zoom-out target on the fly. Zoom in: rootId = cursorNodeId. Zoom out: rootId = vault.getNode(rootId).parent_id, cursorNodeId = old rootId.

