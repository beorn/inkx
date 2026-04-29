---
id: "@km/silvercode/ctrl-d-quit"
aliases:
  - km-silvercode.ctrl-d-quit
  - km-silvercode-ctrl-d-quit
created_by: claude:2405c72e
created_at: 2026-04-26T06:05:58Z
closed_at: 2026-04-26T06:39:01Z
close_reason: "Shipped: 0d2fab393. Ctrl+D×2 chord at App-level useInput. 3
  tests. Session: km-session.0425-evening"
---

# [x] Ctrl+D twice quits the app @km/silvercode #feature #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

Help text says 'ctrl-d ctrl-d' exits silvercode, but the actual implementation in CommandBox.tsx fires on EMPTY ENTER twice within 1500ms (armedAt ref). Wire actual Ctrl+D detection: track ctrlD-armed-at; second Ctrl+D within 1500ms → onExit(). Files: apps/silvercode/src/components/CommandBox.tsx (TextArea handler — needs explicit Ctrl+D capture; silvery TextArea may already pass it through) OR apps/silvercode/src/App.tsx (useInput for ctrl+d at app level). Probably easier at App.tsx since TextArea may consume Ctrl+D internally as 'delete forward'. Test: press Ctrl+D once, no exit; press again within 1500ms, exit fires.