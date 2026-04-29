---
id: "@km/tui/save-rerender"
aliases:
  - km-tui.save-rerender
  - km-tui-save-rerender
created_at: 2026-02-06T16:32:00Z
closed_at: 2026-02-07T09:14:48Z
---

# [x] Board doesn't re-render after inline edit save @km/tui #bug #P2

After saving an inline edit (confirming a card title change), the board doesn't re-render to show the updated text. The repo mutation should trigger useColumns (via useSyncExternalStore → repo.subscribe) to re-derive columns. Possible causes: (1) blockEditTargetRef.confirm() not calling repo.updateNode, (2) repo.notify() not firing, (3) useSyncExternalStore subscription not triggering React re-render in L3 createApp context.