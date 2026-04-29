---
id: "@km/inkx/tea"
aliases:
  - km-inkx.tea
  - km-inkx-tea
created_by: claude:d3a7049b
created_at: 2026-02-20T22:09:25Z
closed_at: 2026-02-21T09:00:50Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] inkx TEA runtime: focus, events, state, plugins @km/inkx #epic #P1 @claude:d3a7049b

TEA-like runtime layer for inkx: externalized state store, Elm-shaped API (init/update/view/subscriptions), focus management, spatial navigation, nested scopes, key/mouse event dispatch with bubbling, plugin system. Layered as optional inkx/runtime on top of inkx/core renderer. Phase 1 delivers focus system; later phases add full TEA API, spatial nav, scroll/mouse state, plugins, and test architecture upgrade.