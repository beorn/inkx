---
mentions:
  - km
id: "@km/silvercode/mcp-daemon"
aliases:
  - km-silvercode.mcp-daemon
  - km-silvercode-mcp-daemon
created_by: claude:0940ca20
created_at: 2026-04-24T20:48:58Z
closed_at: 2026-04-27T07:20:45Z
close_reason: Superseded by km-silvercode.mcp-as-tribe-plugin. Standalone-binary
  direction (this bead, 2026-04-24) was rejected in favor of plugin-on-tribe
  direction (mcp-as-tribe-plugin, 2026-04-26) per /pro elegance review
  (/tmp/llm-2405c72e-elegance-review-of-the-wrw1.txt). The plugin approach
  reuses tribe's existing JSON-RPC, hot-reload, idle-quit, and registration; no
  parallel daemon to maintain.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.mcp-daemon
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T13:49:19Z
    created_by: claude:0940ca20
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] Shared on-demand MCP daemon: eliminate per-session km-mcp + tribe-mcp subprocesses @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Replace per-session grandchild MCP subprocesses with a single shared user-level daemon serving both km_* and tribe_* tool namespaces over localhost HTTP.

## Current state

Each silvercode session spawns Claude CLI, which spawns its own @km/_orphan/mcp-server + tribe-mcp grandchildren over stdio. With N sessions: 2N grandchildren.

Shutdown slow because SIGTERM cascades through the tree: silvercode → Claude CLI → MCP grandchildren → pipe drain → exit → bubble up.

## Design

One `silvercode-mcp-daemon` binary, one running instance per user:

- Listens on `http://127.0.0.1:<random-port>/` (Claude CLI `--mcp-config` supports type=http; verified in apps/silvercode/docs/in-process-mcp.md).
- Serves both tool namespaces: km_search / km_get_node / km_get_board / km_render_path + tribe_send / tribe_history / tribe_members.
- PID + port written to ~/.silvercode/mcp.{pid,port}.
- Silvercode app checks on startup; spawns one if missing, reuses if healthy.
- Auto-quit after idle timeout (5 min with zero connected clients).
- Tribe bus lives in daemon memory — no more JSONL file-bus hack; all sessions speak to the same process natively.

## Wins

- 2N subprocesses → 1 shared daemon
- Faster session start (daemon is warm; MCP handshake doesn't re-run per session)
- Faster session shutdown (HTTP client disconnect; no subprocess to wait on)
- Tribe is naturally shared (in-memory bus in daemon process)
- Follows bearly's lore + tribe daemon playbook exactly
- Preserves subscription OAuth (we still use bare Claude CLI, just with http mcp-config instead of stdio)

## Open questions

- Port negotiation: random ephemeral vs fixed? Ephemeral avoids conflicts with user's other services.
- Daemon auth: localhost-only + port file is enough for single-user; consider a token for multi-user machines later.
- Health check protocol: does Claude CLI retry if daemon rejects a request during auto-shutdown grace window?

