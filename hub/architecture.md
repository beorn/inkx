# Architecture

How the daemon, plugins, agents, and apps fit together. Cross-cutting topology — spans `vendor/bearly/`, `apps/silvercode/`, `apps/km-tui/`, and the third-party agent CLIs (Claude Code, codex, gemini-cli, opencode) that participate in our coordination system.

Status: as of 2026-04-26. Snapshot of current state. Some components are prototype-only and explicitly flagged.

**See also: [hub/composition.md](./composition.md)** — the layered `pipe + with*` composition strategy that produces the runtime topology described here. The factory functions for tribe, silvery, and km should read top-to-bottom as the architecture; this doc describes the runtime that those factories produce.

---

## Vocabulary

Read this first. The rest of the doc uses these terms precisely.

| Term | Meaning |
|---|---|
| **project** | The work scope. Conceptual — what a human calls "the job." Usually correlates with a single project root, but doesn't have to (multi-repo work, monorepo subscopes). |
| **project root** | The local filesystem root for a project. Usually a git checkout or worktree, sometimes a non-git directory (vault). One project root → at most one tribe instance. |
| **tribe** | The coordination system: daemon + plugins + `tribe.*` namespace + Unix socket protocol. A category of software, not a specific running thing. |
| **tribe instance** | One running tribe for one project root. Two worktrees of the same repo run two tribe instances. Same repo on two machines runs two tribe instances. |
| **tribe-daemon** | The actual long-running process that *is* a tribe instance at runtime. Auto-starts on first MCP call, idle-quits after 30 min with no clients. Hot-reloadable via SIGHUP. |
| **tribe plugin** | A loadable implementation unit inside tribe-daemon. Lives in the daemon's address space. Examples: `lore`, `mcp`, `tty`, `github`, `recall`. |
| **tribe service** | A capability tribe provides (memory, messaging, MCP serving). Implemented by one or more plugins. |
| **tribe MCP bridge** | Per-agent stdio MCP adapter that translates Claude Code's stdio MCP wire to the tribe-daemon's Unix socket. Currently `tribe-proxy.ts`; file rename pending. |
| **tribe-client** | Library for connecting to and reconnecting against tribe-daemon over its Unix-socket JSON-RPC wire. Currently published as `@bearly/daemon-spine`; rename pending. |
| **shared-mcp** | Tribe plugin that serves multiple MCP tools to multiple agent sessions over a single long-running connection (HTTP+SSE on Unix socket). The "shared MCP server" lifetime, contrasted with stdio MCP (per-session) and tribe MCP bridge (per-agent adapter). Currently `plugins/mcp/`; rename pending. |
| **tool** | An individual MCP-callable method exposed by a tribe service. Example: `tribe.ask`, `tribe.send`, `tribe.broadcast`. |
| **host app** | A user-facing program that may connect to tribe and may host zero or more agent sessions. Examples: silvercode (hosts many), km (hosts none), Claude Code CLI (one). |
| **agent session** | An LLM-backed runtime participant. Today, always a local subprocess speaking ACP or stream-json. Survives a future scheduler/provider that runs them remotely. |
| **agent protocol** | The wire protocol between a host app and an agent session. Today: ACP (Zed's Agent Client Protocol) or stream-json (Claude Code's legacy format). |
| **transport** | How bytes flow underneath the agent protocol: stdio, Unix socket, etc. Orthogonal to agent protocol. |

### What the vocabulary is *not* doing

- **`project ≠ tribe ≠ repo`.** They correlate, but they're not the same thing. `project` is conceptual scope; `repo` is filesystem scope; `tribe` is coordination scope. In the common case all three line up, but worktrees, multi-machine, and monorepo subscopes break the equality.
- **Tribe is not an app.** Calling it an "app" alongside silvercode/km inverts the dependency graph: silvercode and km *consume* tribe; tribe is infrastructure. For the shipping/product lens, see "Shipped components" below.
- **`session-MCP / shared-MCP`** are MCP **serving lifetimes**, not service categories. A given service (tty, github) could be served either way.
- **Plugin / service / tool / bridge / daemon are different layers.** A plugin is a loadable unit; a service is a capability; a tool is an MCP method; a bridge is a protocol adapter; a daemon is a process. They're not synonyms.

---

## The 30-second runtime picture

At most one **tribe-daemon** is live per project root. Everything else either loads into it as a plugin, or connects to it as a client — directly, or through the **tribe MCP bridge**.

```
project root
└── tribe-daemon (singleton per root, Unix socket IPC, idle-quit)
    │
    ├── plugins (loaded into the daemon's address space)
    │   ├── lore       ← memory + recall (absorbed 2026-04-17)
    │   ├── mcp        ← shared MCP server over HTTP+SSE on Unix socket [PROTOTYPE]
    │   ├── tty        ← terminal session tools
    │   ├── github     ← GitHub notification poller
    │   └── recall     ← session-history search (consumes lore namespace)
    │
    └── shared library
        └── @bearly/tribe-client  ← JSON-RPC + parser + reconnect (Phase 1 extracted; currently published as @bearly/daemon-spine, rename pending)

clients (connect to tribe-daemon over Unix socket):
    ├── tribe MCP bridge (per-agent stdio adapter; one per Claude Code session)
    ├── silvercode (host app)
    └── ad-hoc CLI tools (bun tribe …, bun recall …)

agent sessions (LLM-bearing subprocesses, hosted by apps or run standalone):
    ├── standalone Claude Code  ← runs in a terminal, talks to tribe via tribe MCP bridge
    ├── silvercode-hosted Claude / codex / gemini  ← spawned per pane via ACP or stream-json
    └── future: scheduler-spawned, provider-hosted, …
```

Two architectural moves shape this:

1. **One daemon per project root, many plugins.** Lore was a separate daemon until 2026-04-17 when it was absorbed into tribe — its RPC namespace (`ask`, `brief`, `plan`, `session`, `workspace`, `inject_delta`) is now methods on tribe. Adding the 6th, 7th, Nth plugin shouldn't mean re-implementing JSON-RPC, hot-reload, idle-quit, plugin loading every time.
2. **Connection-as-lease.** Daemon idle-quit timer is driven by client connection count. SSE drop = lease release; new connect = cancel timer. No explicit `lease()` API to mismanage.

---

## Shipped components

The repo ships three things, but they're different *kinds* of things at runtime:

| Component | Where | Kind | What it is |
|---|---|---|---|
| **km** | `apps/km-tui/`, `apps/km-cli/`, etc. | Host app (UI) | TypeScript Bun TUI for knowledge management — notes, tasks, calendar. Bidirectional markdown sync. May host zero agent sessions today; may host more later. |
| **silvercode** | `apps/silvercode/` | Host app (UI) | TUI workspace that spawns claude/codex/gemini agent sessions in panes. Uses ACP or stream-json. Has its own controller, agent-harness library, session store. |
| **tribe** | `vendor/bearly/plugins/tribe/` (+ daemon-spine package) | System (daemon) | Per-project coordination. Daemon process + plugin loader + Unix socket + JSON-RPC + idle-quit + hot-reload. Headless. Other components consume it. |

Third-party host apps that participate in tribe (when launched in a tribe-aware project root):

- **Claude Code CLI** (Anthropic) — connects via tribe MCP bridge spawned as its MCP child
- **codex** — same pattern
- **gemini-cli** — same pattern
- **opencode** — same pattern

These aren't ours but the architecture has to accommodate them.

---

## Components — roles and boundaries

| Component | Path | Process model | Owns |
|---|---|---|---|
| **tribe-daemon** | `vendor/bearly/plugins/tribe/tribe-daemon.ts` | One per project root. Auto-starts on first MCP call, idle-quits after 30 min with no clients. Hot-reloadable via SIGHUP. | Client registry, chief lease, plugin loader, activity log, broadcast coalescer, lore RPC, MCP plugin RPC. |
| **tribe MCP bridge** | `vendor/bearly/plugins/tribe/tribe-proxy.ts` | One per Claude Code session. Spawned as the session's MCP child via stdio. | Bridges Claude's stdio MCP wire to the per-project tribe-daemon's Unix socket. |
| **lore** (plugin) | `vendor/bearly/plugins/tribe/lore/` | Plugin inside tribe-daemon (no separate process). | Memory + recall: session indexing, context recall, workspace digest, delta injection. |
| **shared-mcp** (plugin) | `vendor/bearly/plugins/mcp/` (rename to `plugins/shared-mcp/` pending) | Plugin inside tribe-daemon. **PROTOTYPE only**, not yet wired into any Claude Code config. | The serving mechanism for the "shared MCP server" lifetime: long-running, HTTP+SSE on a Unix socket, connection-as-lease. The MCP tools it eventually exposes (e.g., tty, github migrating from stdio) are separate plugins; this one provides the serving infrastructure. |
| **tty** (MCP server) | `vendor/bearly/plugins/tty/` | Stdio MCP server, spawned per-session by Claude Code. | Headless terminal sessions for testing TUIs (`mcp__tty__start`, etc.). |
| **github** (MCP server) | `vendor/bearly/plugins/github/` | Stdio MCP server, spawned per-session. | GitHub notification polling + cursor persistence. |
| **recall** (MCP server) | `vendor/bearly/plugins/recall/` | Stdio MCP server. Most session-recall traffic now bypasses this and goes direct to tribe daemon's lore namespace; the MCP-shaped wrapper still exists for Claude Code's MCP discovery. | Search interface over the recall index. |
| **@bearly/tribe-client** | `vendor/bearly/packages/daemon-spine/` (rename to `packages/tribe-client/` pending) | Shared library. Phase 1 of consolidation (extracted 2026-04-26). | JSON-RPC framing, line parser, `connectToDaemon`, `connectOrStart`, `createReconnectingClient`, `withDaemonCall`, socket path resolution. Replaces 95% duplicate `tools/lib/tribe/socket.ts` and `plugins/tribe/lore/lib/socket.ts`. The daemon also imports the protocol primitives (parser, paths) since both ends share the wire. |
| **silvercode** | `apps/silvercode/` | Host app. | Multi-pane workspace; spawns agent sessions per pane; subprocess lifecycle hardened with AsyncDisposable + sentTerm + 10s SIGKILL fallback (commit 08a0989b9). |
| **agent-harness** | `apps/silvercode/packages/agent-harness/` | Library used by silvercode. | The `AgentSession` interface; `spawnClaude`, `spawnCodex`, `spawnSdk`, `connectAcp`, `connectAcpRegistry`. Bridges between Claude Code's stream-json and ACP's `SessionUpdate`. |
| **claude-acp** | `apps/silvercode/packages/claude-acp/` | Standalone subprocess spawned by silvercode for ACP-track Claude sessions. | Wraps the `claude` binary so it speaks ACP. Subscription-compatible (Pro/Max OAuth + ANTHROPIC_API_KEY). Resolved via workspace path because the package is private (commit d17afaa82). |

### What's NOT in the topology

- **km-cli / km-tui** are host apps that *could* connect to tribe but don't today.
- **Cmux** is the terminal multiplexer the user runs Claude Code in. Out of scope; tribe is per-project-root, not per-cmux-window.

---

## Tribe services and their lifetimes

A **service** is a capability tribe provides. **Memory** and **MCP serving** are the two service families today.

### Memory

Two scopes, both implemented by the lore plugin:

| Scope | What | Lifetime |
|---|---|---|
| **session memory** | Cross-session recall of prior conversations and decisions. "What did I do before?" | Indexed across all sessions ever. |
| **workspace memory** | Per-checkout digest of files, structure, recent commits. "What's in this codebase right now?" | Tied to one project root. |

Why "workspace memory" and not "repo memory": one repo can have multiple worktrees on disk, each with diverging state. The memory worth caching is per-checkout, not per-repo lineage. Sharing across worktrees is a separate decision.

### MCP serving

Three lifetimes the same MCP service can be exposed under:

| Lifetime | Pattern | Examples |
|---|---|---|
| **stdio MCP** | One process per agent session, lifetime = session. Spawned by the host app. | `tty`, `github`, `recall` (today) |
| **tribe MCP bridge** | Stdio in front of the agent, Unix socket in back to tribe-daemon. The bridge is per-session; the daemon is shared. | `tribe-proxy` exposing tribe.* methods |
| **shared MCP server** | Long-running inside tribe-daemon, served over HTTP+SSE on Unix socket. Multiple agents share. | `vendor/bearly/plugins/mcp/` [PROTOTYPE] |

Today most MCP traffic uses the stdio lifetime. The shared MCP server prototype exists but no consumer points at it yet.

---

## IPC and lifecycle patterns

### Unix socket + JSON-RPC

All daemon ↔ client traffic goes over Unix sockets, framed as line-delimited JSON-RPC 2.0. The wire is identical for tribe, lore (now tribe), and the shared MCP plugin's HTTP-on-Unix-socket. Specifics:

- Path resolution: `BEARLY_*_SOCKET` env override → `XDG_RUNTIME_DIR/bearly-*/...` → `~/.local/share/bearly-*/...` → `/tmp/bearly-*/...`
- Bind-before-publish: bind to a temp path inside a 0700 dir, then atomic `rename` to the published path. Stale-socket cleanup on startup if a previous instance crashed.
- Mode 0600 on the socket file.

This is what `@bearly/tribe-client` consolidates — see `hub/bearly/design/daemon-spine-consolidation.md` for the duplication that drove the extraction.

### Connection-as-lease

The MCP plugin (and going forward, any tribe plugin needing client-driven lifecycle) uses connection count to drive idle-quit:

```
on accept:    connections.add(socket); cancel idle-quit timer.
on disconnect: connections.delete(socket); if connections.size == 0, arm timer.
on timer fire: run quit predicates; if any returns true, request shutdown.
```

The "what kicks the timer" surface is composable: predicates are uniformly `() => boolean | Promise<boolean>`. SIGTERM is just another predicate. Multiple predicates plug in side-by-side; daemon quits when any returns true.

### Hot-reload

`SIGHUP` on tribe-daemon re-execs the process with the listening socket file descriptor preserved across `execve()`. Existing client connections drop briefly during the re-exec; the reconnecting client (`createReconnectingClient` in @bearly/tribe-client) replays its notification handlers automatically.

### silvercode session spawn

```
silvercode launch
  → resolveConnection(--agent flag, config) → ResolvedConnection { agent, model, ... }
    → controller.spawnSession()
      → if entry.agent is set:  connectAcpRegistry(scope, agent, opts)  ← ACP track
                                  → spawns the registry binary (claude-acp / codex-acp / gemini-cli / copilot)
      → else:                   spawnClaude(opts)                       ← stream-json track (legacy)
```

The ACP track speaks ACP-over-stdio between silvercode and each agent session. Only the MCP servers Claude Code spawns inside an agent session go through tribe.

---

## What's actually wired today vs. prototype

### Wired in production

- tribe-daemon as the per-project-root coordinator
- lore plugin inside tribe (memory + recall RPC)
- stdio MCP servers per Claude Code session: tribe MCP bridge, tty, github, recall
- silvercode spawns agent sessions per pane via ACP (`@km/claude-acp` workspace bin) or stream-json
- @bearly/tribe-client Phase 1 (extraction) — built, used by lore socket + tribe socket re-exports

### Prototype only — not yet wired

- **MCP-as-tribe-plugin** (`vendor/bearly/plugins/mcp/`). The prototype works in tests, but no Claude Code `.mcp.json` points at the new `unix://` MCP wire yet. Migration bead pending.
- **@bearly/tribe-client Phases 2-4**. Beaded under `km-bearly.daemon-spine` — Phase 2 (tools/lib/tribe/socket.ts thin re-exports), Phase 3 (consolidate hot-reload across tribe-daemon + tribe MCP bridge), Phase 4 (consolidate idle-quit + cleanup patterns). ~500 LOC of remaining duplication.

### Deferred (P4 long-term roadmap)

- **Parent-death orphan gap** (`km-silvercode.parent-death-orphan-gap`). When silvercode is SIGKILLed / OOMed / panics / power-off, spawned `claude` + MCP grandchildren reparent to init. Standard pgroups don't help (no one alive to send `kill(-pid, SIGTERM)`). Kernel-level fix: PR_SET_PDEATHSIG (Linux) + kqueue NOTE_EXIT (macOS), ~100 LOC. Not implemented because no real-world report of orphan accumulation since the original supervisor edifice was deleted in commit 4f9e9ebb5 (898 LOC).

---

## Edge cases the vocabulary handles

| Situation | Behavior |
|---|---|
| **Git worktrees of the same repo** | Two project roots → two tribe instances. Coordination state (chief lease, activity log) is independent. Memory could be shared at the lore level if we wanted to (it doesn't today). |
| **Same repo on two machines** | Two project roots → two tribe instances. Daemon is per-machine; no cross-machine coordination today. |
| **Non-git directory (vault, scratch dir)** | Still works. `project root` is filesystem scope, not git scope. Tribe doesn't require git. |
| **Multi-repo work** (frontend + backend + notes) | One conceptual `project`, multiple `project root`s, multiple tribe instances. The framing accommodates this even though we don't ship cross-root coordination today. |
| **Monorepo subscope** (only working in `apps/silvercode/`) | One project root = the monorepo top. One tribe. Memory still scoped to the whole monorepo. If we want sub-scope memory later, that's a `workspace memory` feature, not a tribe split. |

---

## Documentation map

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
- `hub/bearly/design/daemon-spine-consolidation.md` — daemon-spine extraction roadmap
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

3. **Daemon-spine extract beyond bearly.** The daemon-spine package could absorb daemon plumbing in any future tool. Today's scope is "consolidate within bearly"; broader extraction (e.g., a public `@bearly/tribe-client` on npm) is a separate decision when there's a third standalone consumer outside the tribe family.

4. **Cross-machine coordination.** Tribe is per-project-root per-machine — a single Unix socket. Cross-machine agent coordination (e.g., a shared chief across cmux-on-laptop + ssh-to-server) is out of scope and not on the roadmap.

5. **Three pending renames** to align disk layout with vocabulary, all blast-radius rather than risky:
   - `vendor/bearly/plugins/tribe/tribe-proxy.ts` → file rename matching `tribe MCP bridge` (~15 import sites).
   - `vendor/bearly/packages/daemon-spine/` → `packages/tribe-client/` (~20+ import sites; package.json `name` change cascades through workspace overrides in km root `package.json`).
   - `vendor/bearly/plugins/mcp/` → `plugins/shared-mcp/` (~5 import sites; package.json `name` from `@bearly/mcp` to `@bearly/shared-mcp`).

6. **Lore namespace.** Lore methods are exposed under `tribe.*` over MCP (since 0.10.0), but internally on the daemon's RPC wire they may still be `lore.*`. Whether to rename internally is open — `tribe.ask` is the user-facing tool name, but the implementation lineage is lore.

7. **Documentation drift.** This doc tries to be the single overview. Component-level READMEs go deep on each piece; this doc only gets updated when the topology shape changes (new plugin promoted out of prototype, daemon split, etc.). When in doubt, the in-package README is more authoritative for behavior; this doc is more authoritative for "where does this fit."
