---
mentions:
  - km
id: "@km/silvery/selection-clipboard"
aliases:
  - km-silvery.selection-clipboard
  - km-silvery-selection-clipboard
created_by: Bjørn Stabell
created_at: 2026-04-02T16:58:13Z
closed_at: 2026-04-03T00:10:04Z
close_reason: Already implemented (state machine + renderer + OSC 52 + React
  hooks). Fixed Proxy bug blocking e2e tests. 27 tests pass. Commit e22bc3d.
owner: bjorn@stabell.org
---

# [x] Wire selection state machine to OSC 52 clipboard — auto-copy on mouse release @km/silvery #task #P1

Selection SM emits {type:'copy', text} effect. OSC 52 clipboard.copy() exists. Wire them together: on SelectionEffect.copy, call clipboard.copy(text). Add tmux paste buffer detection. This completes the copy-on-select flow.

