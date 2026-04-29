---
id: "@km/silvery/focus-in-out-reporting"
aliases:
  - km-silvery.focus-in-out-reporting
  - km-silvery-focus-in-out-reporting
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:21Z
---

# [ ] Protocol: terminal focus in/out events (mode 1004) @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Enable DEC mode 1004 to receive focus gain/loss events from terminal. Expose useTerminalFocus() hook. Enables dim-on-blur, pause-animations, notify-on-focus patterns.