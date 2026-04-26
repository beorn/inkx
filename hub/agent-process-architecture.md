# Agent process architecture

How the agent / daemon / MCP / coordination plumbing fits together across `vendor/bearly/`, `apps/silvercode/`, and the Claude Code clients that consume both.

This is the cross-cutting topology — it spans multiple packages, so it lives at `hub/` rather than under any single project's directory.

Status: as of 2026-04-26 (post-plateau session). Snapshot of the current state, not aspirational. Some components are prototype-only and explicitly flagged.

---

## The 30-second picture

There is exactly one long-running coordination daemon per project: **tribe-daemon**. Everything else either lives inside it as a plugin, or talks to it as a client.

```
project root
└── tribe-daemon (singleton, Unix socket IPC, idle-quit)
    ├── plugin: lore       ← memory + recall (absorbed 2026-04-17, was a separate daemon)
    ├── plugin: mcp        ← shared MCP server (NEW prototype, not yet wired into Claude Code)
    ├── plugin: tty        ← terminal session tools (MCP server)
    ├── plugin: github     ← GitHub notification poller
    └── plugin: recall     ← session-history search (consumes lore namespace)

clients (talk to tribe over Unix socket):
    ├── Claude Code session A    (one per terminal window)
    ├── Claude Code session B
    └── silvercode              (separate TUI app; spawns claude per-session)

shared library used by tribe + plugins:
    @bearly/daemon-spine        ← JSON-RPC + parser + client + reconnect (NEW Phase 1)
```

Two architectural moves shaped this:

1. **One daemon, many plugins.** Lore was a separate daemon until 2026-04-17 when it was absorbed into tribe — its RPC namespace (ask, brief, plan, session, workspace, inject_delta) is now methods on tribe. Adding the 6th, 7th, Nth plugin shouldn't mean re-implementing JSON-RPC, hot-reload, idle-quit, plugin loading every time.
2. **Connection-as-lease.** Daemon idle-quit timer is driven by client connection count. SSE drop = lease release; new connect = cancel timer. No explicit `lease()` API to mismanage.

---

## Components — roles and boundaries

| Component | Where | Process model | Owns |
|---|---|---|---|
| **tribe-daemon** | `vendor/bearly/plugins/tribe/tribe-daemon.ts` | One per project. Auto-starts on first MCP call, idle-quits after 30 min if no clients. Hot-reloadable via SIGHUP. | Client registry, chief lease, plugin loader, activity log, broadcast coalescer, lore RPC, MCP RPC. |
| **tribe-proxy** | `vendor/bearly/plugins/tribe/tribe-proxy.ts` | One per Claude Code session. Spawned as the session's MCP child via stdio. | Bridges Claude's stdio MCP wire to the per-project tribe-daemon's Unix socket. |
| **lore** (plugin) | `vendor/bearly/plugins/tribe/lore/` | Plugin inside tribe-daemon (no separate process). | Memory + recall: session indexing, context recall, workspace digest, delta injection. |
| **mcp** (plugin) | `vendor/bearly/plugins/mcp/` | Plugin inside tribe-daemon. **PROTOTYPE only**, not yet wired into any Claude Code config. | Long-running shared MCP server over HTTP+SSE on a Unix socket. Connection-as-lease lifecycle. |
| **tty** (MCP) | `vendor/bearly/plugins/tty/` | Stdio MCP server, spawned per-session by Claude Code. | Headless terminal sessions for testing TUIs (`mcp__tty__start`, etc.). |
| **github** (MCP) | `vendor/bearly/plugins/github/` | Stdio MCP server, spawned per-session. | GitHub notification polling + cursor persistence. |
| **recall** (MCP) | `vendor/bearly/plugins/recall/` | Stdio MCP server. Most session-recall traffic now bypasses this and goes direct to tribe daemon's lore namespace; the MCP-shaped wrapper still exists for Claude Code's MCP discovery. | Search interface over the recall index. |
| **@bearly/daemon-spine** | `vendor/bearly/packages/daemon-spine/` | Shared library. Phase 1 of consolidation (extracted 2026-04-26). | JSON-RPC framing, line parser, `connectToDaemon`, `connectOrStart`, `createReconnectingClient`, `withDaemonCall`, socket path resolution. Replaces the 95% duplicate `tools/lib/tribe/socket.ts` and `plugins/tribe/lore/lib/socket.ts`. |
| **silvercode** | `apps/silvercode/` | TUI app (separate from Claude Code). Spawns `claude` per pane via ACP or stream-json. | Multi-pane workspace; agent-harness controller; subprocess lifecycle (hardened with AsyncDisposable + sentTerm + 10s SIGKILL fallback in commit 08a0989b9). |
| **agent-harness** | `apps/silvercode/packages/agent-harness/` | Library used by silvercode. | The `AgentSession` interface; `spawnClaude`, `spawnCodex`, `spawnSdk`, `connectAcp`, `connectAcpRegistry`. Bridges between Claude Code's stream-json and ACP's `SessionUpdate`. |
| **claude-acp** | `apps/silvercode/packages/claude-acp/` | Standalone subprocess spawned by silvercode for ACP-track Claude sessions. | Wraps the `claude` binary so it speaks ACP. Subscription-compatible (Pro/Max OAuth + ANTHROPIC_API_KEY). Resolved via workspace path because the package is private (commit d17afaa82). |

### What's NOT in the topology

- **km-cli / km-tui** — separate apps, not part of this picture.
- **Cmux** — terminal multiplexer the user runs Claude Code in. Out of scope; tribe is per-project, not per-cmux-window.

---

## IPC and lifecycle patterns

### Unix socket + JSON-RPC

All daemon ↔ client traffic goes over Unix sockets, framed as line-delimited JSON-RPC 2.0. The wire is identical for tribe, lore (now tribe), and the MCP plugin's HTTP-on-Unix-socket. Specifics:

- Path resolution: `BEARLY_*_SOCKET` env override → `XDG_RUNTIME_DIR/bearly-*/...` → `~/.local/share/bearly-*/...` → `/tmp/bearly-*/...`
- Bind-before-publish: bind to a temp path inside a 0700 dir, then atomic `rename` to the published path. Stale-socket cleanup on startup if a previous instance crashed.
- Mode 0600 on the socket file.

This is what `@bearly/daemon-spine` consolidates — see `hub/bearly/design/daemon-spine-consolidation.md` for the duplication that drove the extraction.

### Connection-as-lease

The MCP plugin (and going forward, any tribe plugin needing client-driven lifecycle) uses connection count to drive idle-quit:

```
on accept:    connections.add(socket); cancel idle-quit timer.
on disconnect: connections.delete(socket); if connections.size == 0, arm timer.
on timer fire: run quit predicates; if any returns true, request shutdown.
```

The "what kicks the timer" surface is composable: predicates are uniformly `() => boolean | Promise<boolean>`. SIGTERM is just another predicate. Multiple predicates plug in side-by-side; daemon quits when any returns true.

### Hot-reload

`SIGHUP` on tribe-daemon re-execs the process with the listening socket file descriptor preserved across `execve()`. Existing client connections drop briefly during the re-exec; the reconnecting client (`createReconnectingClient` in @bearly/daemon-spine) replays its notification handlers automatically.

### silvercode session spawn

```
silvercode launch
  → resolveConnection(--agent flag, config) → ResolvedConnection { agent, model, ... }
    → controller.spawnSession()
      → if entry.agent is set:  connectAcpRegistry(scope, agent, opts)  ← ACP track
                                  → spawns the registry binary (claude-acp / codex-acp / gemini-cli / copilot)
      → else:                   spawnClaude(opts)                       ← stream-json track (legacy)
```

The ACP track uses `@bearly/daemon-spine`-shaped IPC indirectly — each ACP server is its own subprocess speaking ACP-over-stdio, not connecting to tribe. Only the MCP servers Claude Code spawns go through tribe.

---

## What's actually wired today vs. prototype

### Wired in production

- tribe-daemon as the per-project coordinator
- lore plugin inside tribe (memory + recall RPC)
- stdio MCP servers per Claude Code session: tribe-proxy, tty, github, recall
- silvercode spawns claude per-pane via ACP (`@km/claude-acp` workspace bin) or stream-json
- @bearly/daemon-spine Phase 1 (extraction) — built, used by lore socket + tribe socket re-exports

### Prototype only — not yet wired

- **MCP-as-tribe-plugin** (`vendor/bearly/plugins/mcp/`). The prototype works in tests, but no Claude Code `.mcp.json` points at the new `unix://` MCP wire yet. Migration bead pending (`km-silvercode.mcp-share-daemon` or similar — not yet created).
- **@bearly/daemon-spine Phases 2-4**. Beaded under `km-bearly.daemon-spine` — Phase 2 (tools/lib/tribe/socket.ts thin re-exports), Phase 3 (consolidate hot-reload across tribe-daemon + tribe-proxy), Phase 4 (consolidate idle-quit + cleanup patterns). ~500 LOC of remaining duplication.

### Deferred

- **Parent-death orphan gap** (`km-silvercode.parent-death-orphan-gap`, P4 long-term roadmap). When silvercode is SIGKILLed / OOMed / panics / power-off, spawned `claude` + MCP grandchildren reparent to init. Standard pgroups don't help (no one alive to send `kill(-pid, SIGTERM)`). Kernel-level fix: PR_SET_PDEATHSIG (Linux) + kqueue NOTE_EXIT (macOS), ~100 LOC. Not implemented because no real-world report of orphan accumulation since the original supervisor edifice was deleted in commit 4f9e9ebb5 (898 LOC).

---

## Documentation map (where to find more detail)

### Bearly umbrella

- `vendor/bearly/CLAUDE.md` — top-level guide, plugin inventory
- `vendor/bearly/README.md` — public-facing description
- `vendor/bearly/CHANGELOG.md` — version history (e.g. 0.10.0 lore.* → tribe.* namespace migration)

### Tribe daemon

- `vendor/bearly/plugins/tribe/README.md` — tribe daemon main docs
- `vendor/bearly/plugins/tribe/CHANGELOG.md`
- `vendor/bearly/skills/tribe/chief.md` + `member.md` — usage skills
- `.claude/skills/tribe/SKILL.md` — km project's `/tribe` skill surface
- `.claude/skills/tribe/runbook.md` — operational procedures

### Design rationale

- `hub/bearly/design/tribe-daemon.md` — tribe daemon design rationale
- `hub/bearly/design/tribe-decoupling.md` — how tribe decoupled from km
- `hub/bearly/design/tribe-minimal.md` — minimal-surface design
- `hub/bearly/design/daemon-spine-consolidation.md` — daemon-spine extraction roadmap (this session)
- `hub/bearly/memory.md` — private notes on bearly direction

### Silvercode

- `apps/silvercode/CLAUDE.md` — top-level silvercode guide
- `apps/silvercode/packages/agent-harness/CLAUDE.md` — agent-harness API + ACP migration
- `apps/silvercode/packages/claude-acp/README.md` — the standalone Claude ACP wrapper
- `apps/silvercode/docs/in-process-mcp.md` — MCP migration design
- `apps/silvercode/docs/multi-agent.md` + `channels.md` — coordination + injection pipeline

### MCP plugins (per plugin)

- `vendor/bearly/plugins/mcp/README.md` — MCP-as-tribe-plugin prototype
- `vendor/bearly/plugins/tty/README.md`
- `vendor/bearly/plugins/github/README.md`
- `vendor/bearly/plugins/recall/README.md`
- `vendor/bearly/plugins/llm/README.md`
- `vendor/bearly/plugins/injection-envelope/README.md`

### Ecosystem siblings (built on alien-signals — for context)

The reactive primitives the apps use share a family with bearly's plugins but are not part of the daemon topology:

- `vendor/bearly/packages/alien-projections/` — list-of-rows reactive transforms
- `vendor/bearly/packages/alien-resources/` — async fetch with abort
- `vendor/bearly/packages/alien-trees/` — tree aggregates with sparse ancestor index

---

## Open questions / future direction

1. **MCP migration timing.** The MCP-as-tribe-plugin prototype exists but no consumer points at it. Migration probably happens incrementally — first one MCP (likely tty or github since they're stateful) flips to the shared daemon, then the rest. Bead pending.

2. **claude-code-spawn retirement.** The legacy stream-json path uses `accounts.ts` / `resolveAccountDir` (still wired in `controller.ts:878`). Once ACP is the only Claude path in silvercode, retire the legacy plumbing. Not urgent — both paths work.

3. **Daemon-spine extract beyond bearly.** The daemon-spine package could absorb daemon plumbing in any future tool. Today's scope is "consolidate within bearly"; broader extraction (e.g., a public `@bearly/daemon-spine` on npm) is a separate decision when there's a third standalone consumer outside the tribe family.

4. **Cross-machine coordination.** Tribe is per-project per-machine — a single Unix socket. Cross-machine agent coordination (e.g., a shared chief across cmux-on-laptop + ssh-to-server) is out of scope and not on the roadmap.

5. **Documentation drift.** This doc tries to be the single overview. Component-level READMEs go deep on each piece; this doc only gets updated when the topology shape changes (new plugin promoted out of prototype, daemon split, etc.). When in doubt, the in-package README is more authoritative for behavior; this doc is more authoritative for "where does this fit."
