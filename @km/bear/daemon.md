---
id: "@km/bear/daemon"
aliases:
  - km-bear.daemon
  - km-bear-daemon
created_by: Bjørn Stabell
created_at: 2026-04-17T15:12:37Z
closed_at: 2026-04-17T15:36:17Z
close_reason: Phase 2 complete. Daemon + socket + DB + CLI + reconnecting MCP
  client + SessionStart integration all shipped. 14 tests (7 daemon integration
  + 7 plugin library-fallback). Full test:fast (6583 pass) green. /complete
  audit found no gaps.
---

# [x] Phase 2: bear-daemon + workspace-state.db @km/bear #task #P2 @Bjørn Stabell

blocks:: [[@km/bear]], [[@km/bear/mcp-wrapper]]

Phase 2 of the bear plan (epic: @km/bear). Replace Phase 1's direct library calls in `plugins/bear/server.ts` with reconnecting-client calls to a persistent `bear-daemon` process, modeled on `tools/tribe-daemon.ts`.

## Scope

1. **`tools/bear-daemon.ts`** — long-lived process. Unix socket at `\$XDG_RUNTIME_DIR/bear.sock` (fallback `~/.local/share/bear/bear.sock`). SQLite WAL at `~/.local/share/bear/bear.db`. SIGHUP hot-reload. 30min idle quit. JSON-RPC 2.0 newline-delimited (matches tribe wire protocol).

2. **`tools/lib/bear/socket.ts`** — socket path resolution + `connectOrStart` + `createReconnectingClient` adapted from `tribe-daemon/socket.ts` with bear-specific paths.

3. **`tools/lib/bear/database.ts`** — schema + repository for bear DB: `sessions` (claude_pid, session_id, transcript_path, cwd, started_at, last_seen, status), `events` (ts, session_id, type, meta), future tables for focus/summaries (Phase 3–4) as empty migrations.

4. **`tools/lib/bear/rpc.ts`** — canonical RPC surface. Methods: `bear.ask`, `bear.current_brief`, `bear.plan_only`, `bear.session_register`, `bear.session_heartbeat`. Shared param/result types used by both daemon handlers and proxy client.

5. **`plugins/bear/server.ts`** — refactor to reconnecting-client. Each MCP tool handler becomes one RPC call. Falls back to in-process recall library if daemon unreachable (non-breaking).

6. **`tools/recall/hooks.ts` `cmdSessionStart`** — routes to daemon via RPC. Keeps sentinel-file write as fallback only (pid-*.json still written if daemon unreachable).

## /complete criteria

- \`ps aux | grep bear-daemon\` shows the process after first MCP call
- \`rg "bun recall\\b" .claude/hooks/ .claude/skills/recall/\` → sentinel-fallback references only (tagged "fallback")
- \`rg "bearly-sessions/pid-" vendor/bearly/tools/\` → only in session-context.ts (read-fallback) and hooks.ts (write-fallback)
- \`bun vitest run vendor/bearly/tests/bear/\` green (daemon integration tests, socket round-trip, DB persistence)
- \`bun vitest run vendor/bearly/plugins/bear/\` green (proxy client against mocked daemon)
- Killing the daemon mid-call produces a reconnect attempt with exponential backoff (trace in stderr when BEAR_LOG=1)
- `bear status` CLI (new in bear-daemon.ts) shows alive sessions

## Design decisions

- **Reuse tribe's wire protocol** — JSON-RPC 2.0 newline-delimited. Allows future Phase 7 unification without rewriting clients.
- **Separate DB** — `bear.db` ≠ `tribe.db`. Phase 7 merges them when both stable.
- **Daemon-first, sentinel fallback** — sentinel file is never removed yet; it's the ground-truth fallback when daemon is down. Only removed in Phase 5 when dedup state makes it unsafe to have two sources.

## Risks

- **Dual path** — both daemon and library work after Phase 2. Mitigated: proxy prefers daemon; library call is marked \`mode=fallback\` in trace. Phase 5 kills the library path for hooks.
- **Socket permission on headless** — use 0600 perms on sock (tribe already does).

## Out of scope

- Pub/sub event stream (Phase 3)
- Background summarizer (Phase 4)
- Dedup/inject_delta (Phase 5)
- bear watch TUI (Phase 6)