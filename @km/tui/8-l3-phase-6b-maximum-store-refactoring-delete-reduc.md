---
id: "@km/tui/8-l3-phase-6b-maximum-store-refactoring-delete-reduc"
aliases:
  - km-tui.8
  - km-tui-8
  - "@km/tui/8"
created_at: 2026-02-06T14:33:58Z
closed_at: 2026-02-06T15:39:49Z
---

# [x] L3 Phase 6b: Maximum store refactoring — delete reducers, providers, ActionCtx @km/tui #task #P2

Eliminate all reducer machinery from @km/tui. Delete uiReducer, boardReducer adapter, UIProvider, LayoutProvider, ActionCtx, @reduxjs/toolkit+immer+reselect deps. Handlers call set() directly. Nav fields flat, UI grouped. setUI() replaces 42 RTK cases. HandlerCtx with get/set. ~590 lines deleted. 8 steps — see plan synchronous-snacking-bee.md