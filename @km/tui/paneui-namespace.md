---
id: "@km/tui/paneui-namespace"
aliases:
  - km-tui.paneui-namespace
  - km-tui-paneui-namespace
created_by: Bjørn Stabell
created_at: 2026-04-02T23:19:38Z
closed_at: 2026-04-02T23:25:54Z
---

# [x] Extract PaneUI namespace — editMode, isInDialog, isBusy, isTextInputFocused @km/tui #task #P2 @Bjørn Stabell

Bare functions getEditMode(), isDialogInput checks duplicated in command-bridge.ts and board-app.ts. Extract PaneUI namespace with discoverable methods. ~30 min.