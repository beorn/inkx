---
mentions:
  - km
id: "@km/inbox/wb8h"
aliases:
  - km-wb8h
  - "@km/_orphan/wb8h"
created_at: 2026-01-21T09:44:43Z
closed_at: 2026-01-21T09:58:10Z
---

# [x] Zoom operations only change rootId, not cursor @km/_orphan #task #P0

Phase 3: Modify ZOOM_IN/ZOOM_OUT handlers to only change rootId. The selectedNodeId stays unchanged - same node remains selected even as the view changes. Remove cursor parameter from ZOOM_IN action.

