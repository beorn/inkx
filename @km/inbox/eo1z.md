---
id: "@km/_orphan/eo1z"
aliases:
  - km-eo1z
created_at: 2026-01-16T08:23:51Z
closed_at: 2026-01-16T08:25:58Z
---

# [x] TUI2 SIGTRAP crash leaves terminal in broken state @km/_orphan #bug #P1

Running 'bun km view --tui2 /tmp/tst-repo/@next.md' crashes with SIGTRAP on macOS Apple Silicon.

This is caused by a known Bun v1.3.5 bug (oven-sh/bun#25666) affecting JavaScriptCore's PAC validation during process exit.

The crash happens after user code completes, during Bun's internal cleanup of Worker threads.

Issues:
1. SIGTRAP crash on exit
2. Terminal left in broken state (raw mode, no cursor, etc.)

Workarounds to investigate:
1. Shell wrapper script that saves/restores terminal state
2. Try installing handler for SIGTRAP to restore terminal
3. Downgrade Bun to pre-1.3.5 version
4. Document as known issue until Bun fixes it