---
mentions:
  - km
id: "@km/silvery/caps-demo-input"
aliases:
  - km-silvery.caps-demo-input
  - km-silvery-caps-demo-input
created_by: Bjørn Stabell
created_at: 2026-04-06T10:01:43Z
closed_at: 2026-04-06T10:05:13Z
close_reason: "Fixed: removed explicit createTerm() — render() auto-wires TTY.
  Added isTTY guard for kitty detection."
owner: bjorn@stabell.org
---

# [x] terminal-caps-demo: can't quit — text input echoed to terminal instead of captured @km/silvery #bug #P2

terminal-caps-demo.tsx doesn't enter raw mode properly. Typing 'q' echoes to terminal instead of triggering quit. Likely the demo uses render() instead of run() and stdin isn't set to raw mode. Same class as withfocus-press-crash — composition vs runtime timing.

