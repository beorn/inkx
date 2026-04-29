---
id: "@km/silvery/terminal-protocol-owner"
aliases:
  - km-silvery.terminal-protocol-owner
  - km-silvery-terminal-protocol-owner
created_by: claude:019d032d
created_at: 2026-04-22T20:41:15Z
---

# [ ] Single owner for terminal protocols (bracketed paste, mouse, focus reporting) @km/silvery #task #P2

blocks:: [[@km/silvery]], [[@km/silvery/term-sub-owners]]

Audit finding (2026-04-22, /tmp/shared-global-audit.md) — same META-pattern as @km/silvery/input-owner. Multiple sites currently enable/disable bracketed paste (mode 2004), mouse tracking (modes 1000-1007), and focus reporting (mode 1004) without a single owner. Concurrent enable/disable can race during SIGWINCH or async startup, leaving the terminal in an inconsistent protocol state.

Same fix shape as InputOwner: a TerminalProtocolOwner sets each protocol exactly ONCE per session (at startup) and tears down ONCE on dispose. Components that need to observe protocol state subscribe to the owner; nothing else writes the enable/disable sequences directly.

Filed alongside @km/silvery/input-owner — same root cause class, same structural fix pattern, can share infrastructure (the InputOwner could be extended into a TerminalSession owner that holds InputOwner + OutputGuard + protocol state).

Audit report: /tmp/shared-global-audit.md (Suspect #3).