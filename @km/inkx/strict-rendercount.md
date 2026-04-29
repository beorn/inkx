---
id: "@km/inkx/strict-rendercount"
aliases:
  - km-inkx.strict-rendercount
  - km-inkx-strict-rendercount
created_by: claude:23485adf
created_at: 2026-02-24T14:07:00Z
closed_at: 2026-02-24T14:07:06Z
---

# [x] INKX_STRICT verification gap: navigation renders never verified in createApp @km/inkx #bug #P1 @claude:23485adf

processEventBatch() resets _renderCount=0, doRender increments to 1, check requires >1. Single-doRender navigation events are NEVER verified by INKX_CHECK_INCREMENTAL. Fix: replace _renderCount>1 with wasIncremental flag based on _prevTermBuffer presence. Fixed in this session.