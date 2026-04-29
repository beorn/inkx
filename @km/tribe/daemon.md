---
id: "@km/tribe/daemon"
aliases:
  - km-tribe.daemon
  - km-tribe-daemon
created_by: claude:19080504
created_at: 2026-03-30T19:52:54Z
closed_at: 2026-04-18T17:38:04Z
close_reason: "Fixed in bearly b53bc0a (km bump 17dc84f55): SessionStart hook
  now brings up both lore and tribe daemons via ensureAllDaemonsIfConfigured.
  New tests (22 pass) cover tribe and all-daemon paths. Runtime verified: lore
  socket spawns at ~/.local/share/lore/lore.sock, tribe socket at
  ~/.local/share/tribe/tribe.sock."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.daemon
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T11:01:33Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Tribe daemon: single process per machine, sessions connect via IPC @km/tribe #feature #P1

blocks:: [[@km/tribe]]

Full replacement: single daemon process per machine, MCP proxies connect via IPC.

Phase 1: Create tribe-daemon.ts
- Unix socket server ($XDG_RUNTIME_DIR/tribe.sock or /tmp/tribe-$UID.sock)
- Owns: SQLite DB, git poller, beads watcher, message routing, session registry
- Hot-reload: SIGHUP → re-exec with socket fd transfer (like nginx)
- Auto-quit: 30s after last client disconnects
- Protocol: JSON-RPC over unix socket (same tool names as MCP)

Phase 2: Convert tribe.ts to thin proxy
- On startup: connect to daemon socket (start daemon if not running)
- Proxy MCP tool calls → daemon JSON-RPC, forward notifications ← daemon
- No direct DB access, no polling, no plugins
- ~100 lines total

Phase 3: Delete embedded mode (break intentionally)
- Remove all direct DB code from proxy
- Remove plugins, dedup, cursor, lease from proxy
- Let tsc guide cleanup
- /complete: grep for Database import in tribe.ts → 0 hits

Phase 4: Hot-reload mechanism
- tribe_reload tool → sends SIGHUP to daemon PID
- Auto-reload: daemon watches its own source files (fs.watch)
- Source hash check on SIGHUP: skip reload if unchanged