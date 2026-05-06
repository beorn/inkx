---
mentions:
  - km
id: "@km/silvery/focus-in-out-reporting"
aliases:
  - km-silvery.focus-in-out-reporting
  - km-silvery-focus-in-out-reporting
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:21Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.focus-in-out-reporting
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Protocol: terminal focus in/out events (mode 1004) @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Enable DEC mode 1004 to receive focus gain/loss events from terminal. Expose useTerminalFocus() hook. Enables dim-on-blur, pause-animations, notify-on-focus patterns.

