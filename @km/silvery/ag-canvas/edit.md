---
id: "@km/silvery/ag-canvas/edit"
aliases:
  - km-silvery.ag-canvas.edit
  - km-silvery-ag-canvas-edit
created_by: Bjørn Stabell
created_at: 2026-03-31T07:08:24Z
closed_at: 2026-03-31T07:32:37Z
close_reason: "Implemented in c4e7e807 + 312abd8: tests, delta sync, editing, mouse, scroll"
owner: bjorn@stabell.org
---

# [x] Inline editing in canvas (updateNode via WebSocket) @km/silvery #feature #P3

Enable editing card content in the canvas client. The RPC mutation path already exists (updateNode fires over WebSocket). Needs: TextInput component in canvas mode, Enter to start editing, Escape to cancel, save sends updateNode RPC. Server applies mutation → watcher syncs to .md file → snapshot pushed back.