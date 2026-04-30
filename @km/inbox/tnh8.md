---
id: "@km/inbox/tnh8"
aliases:
  - km-tnh8
  - "@km/_orphan/tnh8"
created_at: 2026-01-20T00:31:59Z
closed_at: 2026-01-20T00:35:14Z
---

# [x] inkx testing: renderer columns must match component testWidth @km/_orphan #bug #P2

The test 'ink board columns show side by side' fails because createTestRenderer() defaults to 80 columns but InkBoardTestable uses testWidth: 120. Either the renderer needs to support per-render column overrides, or tests need to create custom renderers with matching columns.