---
id: "@km/_orphan/kuphm"
aliases:
  - km-kuphm
created_by: claude:c9beade3
created_at: 2026-03-15T07:30:11Z
closed_at: 2026-03-15T07:45:55Z
close_reason: "STRICT_TERMINAL now accepts comma-separated backend list
  (vt100,xterm,ghostty,all,both).
  strictTerminalBackend()→strictTerminalBackends() returns array.
  isStrictOutput() maps to vt100 backend. replayAnsiWithStyles deprecated.
  Backward compat: =1→xterm, =both→xterm+ghostty. Added strict-terminal.test.tsx
  with 5 tests."
owner: bjorn@stabell.org
---

# [x] STRICT_TERMINAL: swappable backends, vt100 default, comma-separated @km/_orphan #task #P2

Unify STRICT_OUTPUT and STRICT_TERMINAL. Define VerifyBackend interface. Accept comma-separated backend list (vt100,xterm,ghostty,all,both). Add vt100 as fast pure-TS backend. Migrate STRICT_OUTPUT to STRICT_TERMINAL=vt100. Deprecate replayAnsiWithStyles. CI: vt100 in PR, xterm nightly.