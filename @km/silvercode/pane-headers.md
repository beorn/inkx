---
id: "@km/silvercode/pane-headers"
aliases:
  - km-silvercode.pane-headers
  - km-silvercode-pane-headers
created_by: claude:2405c72e
created_at: 2026-04-25T07:45:11Z
closed_at: 2026-04-26T08:00:31Z
close_reason: "Shipped: 77f2d26c6 + 32b2c9622. PaneHeader component +
  --pane-headers CLI flag opt-in (default off preserves v1 chrome-minimal). 4
  buttons: ⇄ (placeholder), + (split), _ (minimize), ×. 5 tests + regression
  guard for default off. Session: km-session.0425-evening"
---

# [x] Per-pane header strip with add/close/minimize buttons @km/silvercode #feature #P3 @claude:2405c72e

blocks:: [[@km/silvercode]]

Add a 1-2 row header strip per pane with: title (session id), `+` (spawn split right), `×` (close), `_` (minimize / collapse to single-row strip, Zellij-style), `⇄` (move/drag-move). Deferred from @km/silvercode/pane-management v1 per the chrome constraint — the user explicitly opted out of header chrome for v1. v2 adds it as opt-in via a config flag or always-on once the header design is polished.