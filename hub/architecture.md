# Architecture

A **project root** runs at most one **tribe-daemon** — a per-project coordination process that loads plugins, hosts a tool registry, and brokers messages between the agents and apps working in that root. Apps (km, silvercode) and agent sessions (Claude Code, codex, gemini-cli) consume tribe; tribe doesn't depend on any of them.

The factories that produce this runtime live in [hub/composition.md](./composition.md). This doc describes the runtime they produce.

## The 30-second picture

```
project root
└── tribe-daemon (singleton per root, Unix socket IPC, idle-quit, hot-reload)
    │
    ├── tools (registered via withTool(); protocol-agnostic)
    │   ├── messaging   ← send, broadcast, members, history, leadership
    │   ├── lore        ← memory + recall (ask, brief, plan, session, workspace, …)
    │   ├── tty         ← headless terminal sessions
    │   ├── github      ← GitHub notifications
    │   └── recall      ← session-history search
    │
    ├── plugins (general-purpose loadable units; not tools)
    │   ├── git         ← observe commits, broadcast on the wire
    │   ├── beads       ← observe bead state, broadcast on the wire
    │   ├── github obs  ← poll GitHub, broadcast on the wire
    │   ├── health      ← system pressure monitor
    │   └── accountly   ← Claude Max account rotation
    │
    └── surfaces (expose tools over a wire; consume the registry)
        └── MCP server  ← one per daemon; serves all registered tools
                          ↳ direct: Unix-socket HTTP+SSE
                          ↳ stdio adapter: thin per-agent stdio↔socket bridge
                                           (for clients that only speak stdio MCP)

clients of the daemon's MCP server:
    ├── standalone Claude Code   ← stdio adapter, one per session
    ├── silvercode-hosted agents ← same adapter pattern, scoped per pane
    └── ad-hoc CLIs              ← bun tribe …, bun recall … (direct)

agent sessions (LLM-bearing subprocesses, hosted by apps):
    ├── silvercode panes  ← claude / codex / gemini, ACP or stream-json
    ├── standalone agents ← claude / codex CLI in a terminal
    └── future            ← scheduler-spawned, provider-hosted, …
```

Three moves shape the rest of the design:

1. **One daemon, many plugins, one tool registry.** Lore was a separate daemon until April; absorbing it into tribe means each new capability gets JSON-RPC, hot-reload, idle-quit, and registration for free.
2. **Tools are protocol-agnostic; surfaces consume the registry.** `withTool(tools)` registers; `withMCPServer()` exposes all registered tools over MCP. A future `withRESTServer()` would expose the same registry over HTTP — no per-protocol re-implementation.
3. **Connection-as-lease.** The daemon's idle-quit timer is driven by client connection count. SSE drop = lease release; new connect = cancel timer. No `lease()` API to mismanage.

## Vocabulary

| Term | Meaning |
|---|---|
| **project** | The work scope — what a human calls "the job." Conceptual; usually correlates with one project root. |
| **project root** | Local filesystem root: a git checkout, worktree, or non-git directory. One project root → at most one tribe instance. |
| **tribe** | The coordination system: daemon + plugins + tools + MCP server + Unix socket. A category, not a running thing. |
| **tribe instance** | One running tribe for one project root. Two worktrees → two instances. |
| **tribe-daemon** | The long-running process realizing a tribe instance. Auto-starts on first MCP call, idle-quits after 30 min, SIGHUP-reloadable. |
| **plugin** | A general-purpose loadable unit inside tribe-daemon. Plugins observe external signals (git, beads, GitHub, system health) and push messages onto the wire. Plugins do not, themselves, expose tools. |
| **tool** | A protocol-agnostic callable: `{name, schema, handler}`. Registered via `withTool()` into a single tribe-wide registry. Examples: `tribe.send`, `tribe.ask`, `tty.start`. |
| **surface** | An adapter that exposes the tool registry over a wire protocol. Today the only surface is the MCP server; future surfaces (raw JSON-RPC, REST) would consume the same registry. |
| **MCP server** | One per tribe-daemon. Serves every registered tool. Reachable over Unix socket directly, or via the stdio adapter for clients that only speak stdio MCP. |
| **stdio adapter** | Per-agent process that translates an agent's stdio MCP wire to the daemon's MCP-server-over-Unix-socket. A transport bridge, not a separate server. *(Currently the file `tribe-proxy.ts`; rename pending.)* |
| **tribe-client** | Library for connecting to and reconnecting against tribe-daemon. *(Currently published as `@bearly/daemon-spine`; rename pending.)* |
| **host app** | A user-facing program that may connect to tribe and may host zero or more agent sessions. |
| **agent session** | An LLM-backed runtime participant — today a local subprocess speaking ACP or stream-json. |
| **agent protocol** | Wire protocol between host app and agent session: ACP (Zed) or stream-json (Claude Code legacy). |

**Things this vocabulary deliberately doesn't carry:**

- **Project ≠ tribe ≠ repo.** They correlate but aren't equal — worktrees, monorepo subscopes, multi-machine, and multi-repo work all break the equality.
- **No "tribe MCP server" vs "shared MCP server" vs "session MCP server".** There's *one* MCP server per tribe-daemon. Different transports (direct Unix socket vs stdio adapter) are not different servers.
- **Plugins are not tools.** Plugins observe and push messages. Tools are protocol-agnostic callables. The two roles compose orthogonally — a plugin can choose to register tools, but most don't.
- **MCP is not the architecture.** MCP is one surface. Tools live in a registry that any future surface can serve.

## What ships

Three components, three different *kinds* of thing at runtime:

| Component | Where | Kind | What it is |
|---|---|---|---|
| **km** | `apps/km-tui/`, `apps/km-cli/` | Host app (UI) | TypeScript Bun TUI — notes, tasks, calendar, bidirectional markdown sync. |
| **silvercode** | `apps/silvercode/` | Host app (UI) | TUI workspace that spawns claude/codex/gemini sessions in panes. |
| **tribe** | `vendor/bearly/plugins/tribe/` | System (daemon) | Per-project coordination — daemon, plugin loader, tool registry, MCP server. Headless. |

Third-party host apps participate when launched in a tribe-aware project root: **Claude Code CLI**, **codex**, **gemini-cli**, **opencode** — all reach the tribe MCP server through the stdio adapter spawned as their MCP child.

## Component reference

| Component | Path | Process model | Owns |
|---|---|---|---|
| tribe-daemon | `plugins/tribe/tribe-daemon.ts` | One per project root. Auto-starts, idle-quits after 30 min, SIGHUP-reloadable. | Client registry, chief lease, plugin loader, tool registry, MCP server, activity log, broadcast coalescer. |
| stdio adapter | `plugins/tribe/tribe-proxy.ts` *(file rename pending)* | One per agent session, spawned as the agent's MCP child via stdio. | Translation only: stdio MCP wire ↔ daemon's Unix-socket MCP server. |
| messaging tools | inside tribe-daemon | Registered via `withTool(messagingTools())`. | `tribe.send` / `broadcast` / `members` / `history` / `leadership` / etc. |
| lore tools | `plugins/tribe/lore/` | Registered via `withTool(loreTools())`. | Memory + recall: `tribe.ask` / `brief` / `plan` / `session` / `workspace` / `inject_delta`. |
| tty tools | `plugins/tty/` | Stdio MCP server today; migrating to in-daemon tool registration. | Headless terminal sessions for testing TUIs. |
| github tools | `plugins/github/` | Stdio MCP server today; migrating to in-daemon tool registration. | GitHub notification surfacing. |
| recall tools | `plugins/recall/` | Stdio MCP wrapper today; most traffic already goes direct to the daemon's lore tools. | Session-history search. |
| git/beads/health/accountly plugins | `tools/lib/tribe/*-plugin.ts` | In-process observer plugins. | Watch external signals, push messages onto the wire. Do not register tools. |
| tribe-client | `packages/daemon-spine/` *(rename pending)* | Shared library. | JSON-RPC framing, line parser, `connectToDaemon`, `createReconnectingClient`, socket path resolution. |
| silvercode | `apps/silvercode/` | Host app. | Multi-pane workspace; spawns agent sessions per pane; AsyncDisposable + sentTerm + 10s SIGKILL fallback. |
| agent-harness | `apps/silvercode/packages/agent-harness/` | Library. | `AgentSession` interface; spawn + connect across ACP and stream-json. |
| claude-acp | `apps/silvercode/packages/claude-acp/` | Subprocess. | Wraps the `claude` binary so it speaks ACP. |

Paths under `vendor/bearly/` unless noted.

## Tools and surfaces

Tools register into a single in-process registry:

```ts
withTool(messagingTools())
withTool(loreTools())
withTool(ttyTools())
withTool(githubTools())
```

A tool is `{ name, inputSchema, handler }`. The same tool definition is exposed over every surface that subscribes to the registry. Today the only surface is `withMCPServer()`; the registry has no opinion on the wire protocol.

Two transports for reaching the MCP server:

| Transport | Pattern | Used by |
|---|---|---|
| direct | HTTP+SSE on the daemon's Unix socket | silvercode, ad-hoc CLIs (`bun tribe …`) |
| stdio adapter | Per-agent process bridging stdio MCP ↔ daemon's Unix socket | Claude Code, codex, gemini-cli, opencode (and any client that speaks stdio MCP only) |

These are the same MCP server reached two ways. There is no "session MCP" vs "shared MCP" distinction; the lifetime is the daemon's, not the agent's.

## Memory

Two scopes, both implemented by the lore tools:

| Scope | Question it answers | Lifetime |
|---|---|---|
| session memory | "What did I do before?" | Indexed across all sessions ever. |
| workspace memory | "What's in this codebase right now?" | Tied to one project root. |

We say *workspace* memory rather than *repo* memory because one repo can have multiple worktrees with diverging state — the cacheable unit is the checkout, not the repo lineage.

## IPC and lifecycle

**Unix socket + JSON-RPC.** All daemon ↔ client traffic goes over Unix sockets, framed as line-delimited JSON-RPC 2.0. Path resolution: `BEARLY_*_SOCKET` env override → `XDG_RUNTIME_DIR/bearly-*/...` → `~/.local/share/bearly-*/...` → `/tmp/bearly-*/...`. Bind-before-publish to a temp path in a 0700 dir, atomic rename to publish, mode 0600 on the socket file, stale-socket cleanup on startup.

**Connection-as-lease.** Active connections drive idle-quit:

```
on accept     → connections.add(s); cancel idle-quit timer.
on disconnect → connections.delete(s); if empty, arm timer.
on timer fire → run quit predicates; quit if any returns true.
```

Quit predicates are uniformly `() => boolean | Promise<boolean>`. SIGTERM is just another predicate; anything else (quota exhausted, parent gone, config removed) plugs in the same way.

**Hot-reload.** SIGHUP re-execs tribe-daemon with the listening socket fd preserved across `execve()`. Existing connections drop briefly; `createReconnectingClient` in tribe-client replays notification handlers automatically.

**silvercode session spawn.** `resolveConnection(--agent, config)` produces a `ResolvedConnection`; the controller spawns either via `connectAcpRegistry` (ACP — registry binary like `claude-acp`, `codex-acp`, `gemini-cli`, `copilot`) or `spawnClaude` (legacy stream-json). Only MCP servers spawned *inside* an agent session reach tribe — the agent-protocol channel between silvercode and the agent is a separate stdio wire.

## Status

**Wired:** tribe-daemon as the per-root coordinator; messaging tools and lore tools live in the daemon; stdio adapter spawned per Claude Code session; tty/github/recall as separate stdio MCPs (legacy); silvercode spawning agents via ACP or stream-json; tribe-client Phase 1 used by lore + tribe socket re-exports.

**In flight:** tribe-client Phases 2–4 (`km-bearly.daemon-spine`) collapse the remaining ~500 LOC of duplication. Migration of tribe-daemon to the `pipe + with*` composition pattern (`km-tribe.composition-pipe`) is the prerequisite for moving tty/github/recall from separate stdio MCPs to in-daemon `withTool(…)` registrations.

**Deferred (P4):** parent-death orphan gap (`km-silvercode.parent-death-orphan-gap`) — when silvercode is SIGKILLed/OOMed/power-off'd, spawned agents reparent to init. Pgroups don't help (no live parent to send SIGTERM). Kernel-level fix (PR_SET_PDEATHSIG / kqueue NOTE_EXIT, ~100 LOC) deferred until orphan accumulation is observed.

## Edge cases

| Situation | Behavior |
|---|---|
| Git worktrees of the same repo | Two project roots → two tribe instances. Coordination state independent. |
| Same repo on two machines | Two tribe instances. Daemon is per-machine. |
| Non-git directory (vault, scratch dir) | Works. Project root is filesystem scope, not git scope. |
| Multi-repo work (frontend + backend + notes) | One conceptual project, multiple project roots, multiple tribe instances. No cross-root coordination yet. |
| Monorepo subscope (only `apps/silvercode/`) | Project root = monorepo top. One tribe. Workspace memory still scoped to the whole monorepo. |

## Composition

Tribe, silvercode, and km all use the same layered factory pattern:

```ts
const tribe = pipe(
  createBaseTribe({ scope }),
  withProjectRoot(opts.root),
  withSocket(),
  withDispatch(),

  // Tools — protocol-agnostic, register into the daemon's tool registry.
  withTool(messagingTools()),
  withTool(loreTools()),
  withTool(ttyTools()),
  withTool(githubTools()),

  // Surface — exposes the registry over MCP.
  withMCPServer(),

  // Plugins — observers; push messages onto the wire, don't register tools.
  withPlugin(gitPlugin),
  withPlugin(beadsPlugin),
  withPlugin(healthPlugin),
)
```

Read top-to-bottom and you get the architecture. See [hub/composition.md](./composition.md) for the full strategy. Migration tracked under `km-tribe.composition-pipe` (P2).

## Open questions

1. **In-daemon migration of tty/github/recall.** Once the composition pipe lands, lift these from separate stdio MCP processes to `withTool(…)` registrations inside tribe-daemon. Reduces process count, gives them hot-reload + connection-as-lease for free. Ordering: probably tty first (already stateful), then github, then recall.
2. **Stream-json retirement.** Once ACP is silvercode's only Claude path, retire `accounts.ts` / `resolveAccountDir`. Both paths work today.
3. **tribe-client beyond bearly.** The library could absorb daemon plumbing for any future tool. Public-npm extraction waits for a third standalone consumer outside the tribe family.
4. **Cross-machine coordination.** Tribe is per-machine. A shared chief across laptop+server is out of scope and not on the roadmap.
5. **Pending file/package renames** (blast-radius, not risky):
   - `tribe-proxy.ts` → name matching "stdio adapter" (~15 imports)
   - `packages/daemon-spine/` → `packages/tribe-client/` (~20+ imports + workspace overrides)
6. **Lore namespace internally.** Methods are `tribe.*` over MCP since 0.10.0; internal RPC may still use `lore.*`. Whether to unify is open.

## Documentation map

**Bearly & tribe**

- `vendor/bearly/CLAUDE.md` — top-level guide, plugin inventory
- `vendor/bearly/CHANGELOG.md` — version history
- `vendor/bearly/plugins/tribe/README.md` + `CHANGELOG.md` — daemon docs
- `vendor/bearly/skills/tribe/{chief,member}.md` — usage skills
- `.claude/skills/tribe/SKILL.md` + `runbook.md` — `/tribe` skill, ops procedures

**Design rationale**

- `hub/bearly/design/tribe-daemon.md` — daemon design rationale
- `hub/bearly/design/tribe-decoupling.md` — how tribe decoupled from km
- `hub/bearly/design/tribe-minimal.md` — minimal-surface design
- `hub/bearly/design/daemon-spine-consolidation.md` — extraction roadmap
- `hub/composition.md` — layered `pipe + with*` strategy

**Silvercode**

- `apps/silvercode/CLAUDE.md` — top-level guide
- `apps/silvercode/packages/agent-harness/CLAUDE.md` — agent-harness API + ACP migration
- `apps/silvercode/packages/claude-acp/README.md` — ACP wrapper
- `apps/silvercode/docs/in-process-mcp.md` — MCP migration design
- `apps/silvercode/docs/{multi-agent,channels}.md` — coordination + injection

**Per-tool / per-plugin READMEs**

- `vendor/bearly/plugins/{mcp,tty,github,recall,llm,injection-envelope}/README.md`

**Ecosystem siblings** (alien-signals family — not part of the daemon topology)

- `vendor/bearly/packages/alien-{projections,resources,trees}/`

This doc is the topology overview. In-package READMEs are authoritative for behavior; this doc is authoritative for *where things fit*. It updates when the topology shape changes.
