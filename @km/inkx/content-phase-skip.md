---
id: "@km/inkx/content-phase-skip"
aliases:
  - km-inkx.content-phase-skip
  - km-inkx-content-phase-skip
created_by: claude:23485adf
created_at: 2026-02-24T14:26:09Z
closed_at: 2026-02-26T22:13:19Z
---

# [x] Fix dirty flag bugs to enable layoutChangedThisFrame skip optimization @km/inkx #task #P2

The layoutChangedThisFrame + syncPrevLayout optimization from 6e35fe2 correctly identifies no-layout-change frames for O(1) content-phase skipping. But it exposed latent dirty flag propagation bugs that were masked by the old catch-all (layoutChanged=true forever due to stale prevLayout). Reverted to catch-all in this session. To re-enable: fix dirty flag bugs (INKX_STRICT=1 with layoutChangedThisFrame catches them), then switch back to node.layoutChangedThisFrame.