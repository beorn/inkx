---
id: "@km/terminfo/thin-probe-server"
aliases:
  - km-terminfo.thin-probe-server
  - km-terminfo-thin-probe-server
created_by: claude:4929065a
created_at: 2026-03-25T21:47:25Z
closed_at: 2026-03-25T22:09:06Z
close_reason: "Done: serve.ts dynamically loads probes on each /probe request
  via require.cache invalidation. Server never needs restarting when probes
  change."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Thin probe server — auto-updates when probes change, no re-launch needed @km/terminfo #feature #P2 @claude:4929065a

Currently probe server embeds all probe logic at startup. When probes are added/changed, the server must be restarted in each terminal. 

Design: Make the probe server a thin TTY client that receives probe sequences from the orchestrator at probe time, rather than bundling probe definitions:

1. Server starts in a terminal, opens a port, advertises terminal identity
2. When probed, the orchestrator sends the escape sequence to write + what response to expect
3. Server writes to stdout, reads from stdin, returns raw result
4. Probe logic lives entirely in the orchestrator — server never needs updating

This means:
- Adding new probes = just change the orchestrator, probe all servers immediately
- Server is ~50 lines: listen on port, receive {write, expect}, do TTY I/O, return result
- No probe version skew between terminals
- User starts server once, it stays running indefinitely

Alternative: file-watch the probe definitions and hot-reload on change (simpler but still bundles logic).