---
id: "@km/_orphan/e6iu"
aliases:
  - km-e6iu
created_at: 2026-01-21T09:43:30Z
closed_at: 2026-01-21T09:55:43Z
---

# [x] Add DEBUG_LOG env var and km-debug tmux wrapper @km/_orphan #task #P2

Implement DEBUG_LOG environment variable support for the debug npm package, allowing TUI apps to redirect debug output to a file. Also create a @km/_orphan/debug tmux wrapper script that opens a split pane with the TUI in one pane and tail -f of the debug log in another. The log file should include PID and be cleaned up on exit.