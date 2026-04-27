# Architecture

What we're building, what ships, and how the pieces fit together. This doc is the introduction to the whole system; deeper component docs live where the code does.

## What we ship

Three runtime products today, sitting on a shared foundation:

```
┌──────────────────┬──────────────────┬──────────────────┐
│       km         │    silvercode    │      tribe       │
│  knowledge-mgmt  │  agent workspace │  coordination    │
│      (TUI)       │      (TUI)       │     (daemon)     │
└──────────────────┴──────────────────┴──────────────────┘
                          │
                          │ all three compose with
                          ▼
       pipe + with*  ──  composition strategy (hub/composition.md)
                          │
                          ▼
       Foundations:  silvery (UI framework, multi-target)
                     bearly  (Claude Code tooling library)
                     storage (SQLite + bidirectional markdown sync, km only today)
```

- **km** is a knowledge-management TUI for notes, tasks, calendar with bidirectional markdown sync. The original product, the lead showcase for silvery.
- **silvercode** is a multi-pane TUI workspace that hosts agent sessions (Claude Code, codex, gemini-cli) with shared state, channels, and coordination across panes.
- **tribe** is a per-project coordination daemon that brokers messages and exposes shared tools to whichever apps and agents are working in that project root.

km and silvercode are **host apps** — user-facing, ship a UI, may host or consume agent sessions. tribe is a **system** — headless, infrastructure that the host apps and agent sessions consume.

### km ⇄ silvercode convergence (TBD)

km and silvercode are **converging into one agentic workdesk** — an integrated knowledge environment where the durable knowledge graph (km) and the live agent workspace (silvercode) share the same state, the same UI shell, and the same coordination layer. Today they're separate apps mostly because their MVPs landed on different timelines; the design assumption is that they end up tightly integrated.

What that looks like, per the [km vision](./km/design/vision.md) and the [silvercode MVP brief](./silvery/future/ai-terminal/00-agent-workspace.md):

- **km** already frames itself as *"the environment for knowledge work with AI agents"* — three first-class axes: Knowledge, Communication, Agents. The Agents axis is the silvercode shape, lifted out as a separate codebase for now.
- **silvercode**'s MVP is "agent workspace, not super-shell" — supervision/replay/memory layers around Claude Code. Naturally fed by, and feeding back into, the durable knowledge graph km already owns.
- **Tribe** is built per-project precisely because both products want it to be — coordination is a layer they share rather than each rebuilding.

**Open product question** — TBD when (if) we ship to anyone outside Bjørn's daily workflow:

- Does silvercode merge into km as the Agents axis, with one app shipping?
- Does silvercode stay standalone for users who only want agent supervision?
- Or both, with the integrated km+silvercode binary as the headline product and the standalone silvercode as a slimmer companion?

The composition pattern keeps all three options open: the same `pipe + with*` factories that build them today can be re-composed into any of those product shapes without architectural surgery. This doc updates when that decision lands.

See also: [hub/roadmap.md](./roadmap.md) (five-track roadmap with km, silvery, knowledge layer, communication, ecosystem), [hub/km/design/vision.md](./km/design/vision.md) (three-axis framing), [hub/silvery/future/ai-terminal/00-agent-workspace.md](./silvery/future/ai-terminal/00-agent-workspace.md) (silvercode MVP committed direction).

## Foundations

### Silvery — the UI framework

[silvery CLAUDE.md](../vendor/silvery/CLAUDE.md), [The Silvery Way](../vendor/silvery/docs/guide/the-silvery-way.md), [positioning brief](../docs/silvery-positioning-brief.md).

Multi-target UI framework with web ambitions. Terminal is the primary shipped target; canvas + DOM are explicit future targets. The design system (tokens, components, theming, layout) is built cross-platform-first, not as a TUI idiom. Hover/click/focus are first-class.

km and silvercode both render through silvery; their visual languages should converge as silvery's design system tightens.

### Bearly — the Claude Code tooling library

[bearly CLAUDE.md](../vendor/bearly/CLAUDE.md).

Reusable Claude Code tooling: tribe (coordination + memory), tty (headless terminal MCP), recall (session-history search), llm (multi-provider dispatch), refactor (batch refactoring), worktree, and more. Each package is independently publishable; tribe is the most complex member.

### Composition — `pipe + with*` (and three companions)

[hub/composition.md](./composition.md). Composition is one of four interlocking runtime patterns shared across silvery, km, silvercode, and tribe:

1. **Composition** (`pipe + with*`) — structure. The factory produces the system value.
2. **TEA** (`apply` / `dispatch`) — behavior. Pure `(action, state) → [state, effects]` state machines. See [docs/design/tea.md](../docs/design/tea.md).
3. **Reactive store** (alien-signals + family) — derived state, projections, subscriptions. See `vendor/bearly/packages/alien-*/`.
4. **Scope** — structured-concurrency lifecycle. See [hub/silvery/design/lifecycle-scope.md](./silvery/design/lifecycle-scope.md).

The composition pipe wires all four together: `withScope()`, `withSignalStore()`, `withMachines(…)`, plus tools, plugins, and surfaces. See composition.md → "Companion patterns" for the full picture.

The factory function is the architecture — read top-to-bottom and you understand what the system is, in what order, with what dependencies, and what cleanup is owed:

```ts
const tribe = pipe(
  createBaseTribe({ scope }),
  withProjectRoot(opts.root),
  withSocket(),
  withTools(),
  withTool(messagingTools()),
  withTool(loreTools()),
  withMCPServer(),
  withPlugin(gitPlugin),
)
await tribe.run()
```

`withTool()` populates a protocol-agnostic registry; surfaces (`withMCPServer`, future `withRESTServer`) consume it. Each `withX` registers cleanup on the passed `Scope`. Async setup happens outside the pipe; ongoing async runs in TEA-shaped event loops. See composition.md for the strategy.

## The three products

### km

Source: `apps/km-tui/`, `apps/km-cli/`, `apps/km-repl/`, `apps/km-web/`. App architecture: [docs/architecture.md](../docs/architecture.md). Vision: [hub/km/design/vision.md](./km/design/vision.md).

A bidirectional TUI ↔ markdown notes app. Layered design: APP → COMMANDS → BOARD → TREE → STORAGE → PARSER → FILESYSTEM. UI never touches filesystem; all edits flow both ways. Storage uses `bun:sqlite` with WAL + FTS5. May host agent sessions natively (the Agents axis of the vision) — currently those live in silvercode; expected to converge.

### silvercode

Source: `apps/silvercode/`. Component docs: [silvercode CLAUDE.md](../apps/silvercode/CLAUDE.md), [agent-harness CLAUDE.md](../apps/silvercode/packages/agent-harness/CLAUDE.md). Design: [hub/silvery/future/ai-terminal/](./silvery/future/ai-terminal/) — full MVP brief, agent integration, multiplex, sessions, supervision.

A multi-pane TUI workspace. Each pane spawns an agent session (claude / codex / gemini) over ACP or stream-json; the pane manages the agent's lifecycle, captures its tool calls, renders progress, and shares context across panes via channels. Subprocess lifecycle hardened with AsyncDisposable + `sentTerm` flag + 10s SIGKILL fallback. The product split with km is TBD — see [convergence](#km--silvercode-convergence-tbd) above.

### tribe

Source: `vendor/bearly/plugins/tribe/`. The bulk of this doc covers tribe because it's the most architecturally novel piece — a per-project coordination daemon that other host apps and agent sessions both consume. Detailed design: [hub/bearly/design/tribe-daemon.md](./bearly/design/tribe-daemon.md). API + user-facing docs: [vendor/bearly/plugins/tribe/README.md](../vendor/bearly/plugins/tribe/README.md), [.claude/skills/tribe/SKILL.md](../.claude/skills/tribe/SKILL.md).

What follows is the runtime topology of tribe and how the host apps + agents connect to it.

---

## Tribe — the runtime topology

A **project root** runs at most one **tribe-daemon** — a per-project coordination process that loads plugins, hosts a tool registry, and brokers messages between the agents and apps working in that root.

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
    ├── plugins (general-purpose loadable units; mostly observers)
    │   ├── git           ← observe commits, broadcast on the wire
    │   ├── beads         ← observe bead state, broadcast on the wire
    │   ├── github        ← poll GitHub, broadcast on the wire
    │   ├── health        ← system pressure monitor
    │   ├── accountly     ← Claude Max account rotation
    │   └── dolt-reaper   ← clean up runaway dolt subprocesses
    │   (a plugin may also register tools; most don't)
    │
    └── surfaces (expose tools over a wire; consume the registry)
        └── MCP server  ← one per daemon; serves all registered tools
                          ↳ direct: Unix-socket HTTP+SSE
                          ↳ stdio adapter: thin per-agent stdio↔socket bridge
                                           (compatibility shim for clients
                                            that only speak stdio MCP)

clients of the daemon's MCP server:
    ├── standalone Claude Code   ← stdio adapter, one per session
    ├── silvercode-hosted agents ← same adapter pattern, scoped per pane
    └── ad-hoc CLIs              ← bun tribe …, bun recall … (direct)
                                   (clients usually use tribe-client, a
                                    convenience library — not required;
                                    direct wire access works for any client)

agent sessions (LLM-bearing subprocesses, hosted by apps):
    ├── silvercode panes  ← claude / codex / gemini, ACP or stream-json
    ├── standalone agents ← claude / codex CLI in a terminal
    └── future            ← scheduler-spawned, provider-hosted, …
```

Three architectural moves shape the rest:

1. **One daemon per project root, many plugins, one tool registry.** Lore was a separate daemon until April; absorbing it into tribe means each new capability gets JSON-RPC, hot-reload, idle-quit, and registration for free.
2. **Tools are protocol-agnostic; surfaces consume the registry.** The MCP server is one surface among many possible. Future surfaces (REST, raw JSON-RPC, gRPC) consume the same registry without re-implementing handlers.
3. **Connection-as-lease.** The daemon's idle-quit timer is driven by client connection count. SSE drop = lease release; new connect = cancel timer. No `lease()` API to mismanage.

## Vocabulary

| Term | Meaning |
|---|---|
| **project** | The work scope — what a human calls "the job." Conceptual; usually correlates with one project root. |
| **project root** | Local filesystem root: a git checkout, worktree, or non-git directory. One project root → at most one tribe instance. |
| **tribe** | The coordination system: daemon + plugins + tools + MCP server + Unix socket. A category, not a running thing. |
| **tribe instance** | One running tribe for one project root. Two worktrees → two instances. |
| **tribe-daemon** | The long-running process realizing a tribe instance. Auto-starts on first MCP call, idle-quits after 30 min, SIGHUP-reloadable. |
| **plugin** | A general-purpose loadable unit inside tribe-daemon. Most plugins are observers — they watch external signals and push messages onto the wire. A plugin *can* register tools (via `withTool()` or by writing directly to the registry data structure exposed by an earlier `withTools()`), but typically doesn't. |
| **tool** | A protocol-agnostic callable: `{name, schema, handler}`. Registered into a tribe-wide registry — established by `withTools()` and populated by `withTool()` or by direct registry writes. Tool names use the `tribe.*` prefix to disambiguate from other MCP servers an agent might connect to. |
| **surface** | An adapter that exposes the tool registry over a wire protocol. Today the only surface is the MCP server; future surfaces (raw JSON-RPC, REST) would consume the same registry. |
| **MCP server** | One per tribe-daemon. Serves every registered tool. Reachable over Unix socket directly, or via the stdio adapter for clients that only speak stdio MCP. |
| **stdio adapter** | Per-agent process translating stdio MCP ↔ daemon's Unix-socket MCP server. A transport translator, not a separate server. Compatibility shim; expected to sunset as MCP clients gain Unix-socket transport. *(Currently `tribe-proxy.ts`; rename pending.)* |
| **tribe-client** | Convenience library for connecting to and reconnecting against tribe-daemon. Not required (the wire is documented), but used everywhere we connect today. *(Currently `@bearly/daemon-spine`; rename pending.)* |
| **host app** | A user-facing program that may connect to tribe and may host agent sessions. km, silvercode, Claude Code CLI, codex, gemini-cli, opencode. |
| **agent session** | An LLM-backed runtime participant — today a local subprocess speaking ACP or stream-json. |
| **agent protocol** | Wire protocol between host app and agent session: ACP (Zed) or stream-json (Claude Code legacy). |

**Things this vocabulary deliberately doesn't carry:**

- **Project ≠ tribe ≠ repo.** They correlate but aren't equal — worktrees, monorepo subscopes, multi-machine, multi-repo work all break the equality.
- **No "tribe MCP" vs "shared MCP" vs "session MCP".** One MCP server per tribe-daemon. Different transports are not different servers.
- **Plugins are not tools.** Plugins observe and push messages. Tools are protocol-agnostic callables. The two compose orthogonally.
- **MCP is one surface, not the architecture.** The tool registry is protocol-agnostic.

## Component reference

| Component | Path | Process | Owns |
|---|---|---|---|
| tribe-daemon | `vendor/bearly/plugins/tribe/tribe-daemon.ts` | One per project root. Auto-starts, idle-quits at 30 min, SIGHUP-reloadable. | Client registry, chief lease, plugin loader, tool registry, MCP server, activity log, broadcast coalescer. |
| stdio adapter | `vendor/bearly/plugins/tribe/tribe-proxy.ts` *(rename pending)* | One per agent session, spawned as MCP child via stdio. | stdio MCP wire ↔ daemon Unix-socket MCP server. |
| messaging tools | inside tribe-daemon | `withTool(messagingTools())` | `tribe.send / broadcast / members / history / leadership`. |
| lore tools | `vendor/bearly/plugins/tribe/lore/` | `withTool(loreTools())` | Memory + recall: `tribe.ask / brief / plan / session / workspace / inject_delta`. |
| tty tools | `vendor/bearly/plugins/tty/` | Stdio MCP today; migrating in-daemon. | Headless terminal sessions for testing TUIs. |
| github tools | `vendor/bearly/plugins/github/` | Stdio MCP today; migrating in-daemon. | GitHub notification surfacing as MCP tools. |
| recall tools | `vendor/bearly/plugins/recall/` | Stdio MCP wrapper today; most traffic via lore. | Session-history search. |
| observer plugins | `vendor/bearly/tools/lib/tribe/*-plugin.ts` | In-process. | git, beads, github, health, accountly, dolt-reaper. Watch external signals; broadcast on the wire. The github observer is in-daemon and complementary to the github MCP tools above. |
| tribe-client | `vendor/bearly/packages/daemon-spine/` *(rename pending)* | Convenience library — recommended, not required. | JSON-RPC framing, parser, reconnection, socket path resolution. |
| silvercode controller | `apps/silvercode/src/controller.ts` | Host app process. | Pane lifecycle, agent spawning, channel routing, AsyncDisposable cleanup. |
| agent-harness | `apps/silvercode/packages/agent-harness/` | Library. | `AgentSession` interface; spawn + connect across ACP and stream-json. |
| claude-acp | `apps/silvercode/packages/claude-acp/` | Subprocess. | Wraps `claude` to speak ACP. |
| km storage | `apps/km-tui/`, `packages/km-storage/` | In-process. | SQLite + bidirectional markdown sync. |

## Tools and surfaces

The tool registry is plain data on the daemon value (a `Map<string, ToolDef>`). `withTools()` establishes the slot; `withTool()` is a helper that appends. Plugins can also write to the registry directly when they need to. Surfaces subscribe to the registry — today, only the MCP server.

Two transports for reaching the daemon's MCP server:

| Transport | Pattern | Used by |
|---|---|---|
| direct | HTTP+SSE on the daemon's Unix socket | silvercode, ad-hoc CLIs |
| stdio adapter | Per-agent process bridging stdio MCP ↔ daemon's Unix socket | Claude Code, codex, gemini-cli, opencode |

These are the same MCP server reached two ways. Tool names carry the `tribe.*` prefix because agents typically connect to multiple MCP servers in a session — `tribe.send` vs `fs.read` vs `browser.click` is disambiguation, not redundancy.

## Memory

Two scopes, both implemented by the lore tools:

| Scope | Question it answers | Lifetime |
|---|---|---|
| session memory | "What did I do before?" | Indexed across all sessions ever. |
| workspace memory | "What's in this codebase right now?" | Tied to one project root. |

We say *workspace* memory rather than *repo* memory because one repo can have multiple worktrees with diverging state — the cacheable unit is the checkout, not the repo lineage.

## IPC and lifecycle

**Unix socket + JSON-RPC.** All daemon ↔ client traffic is line-delimited JSON-RPC 2.0 over Unix sockets. Path resolution: `BEARLY_*_SOCKET` env override → `XDG_RUNTIME_DIR/bearly-*/...` → `~/.local/share/bearly-*/...` → `/tmp/bearly-*/...`. Bind-before-publish to a temp path in a 0700 dir, atomic rename to publish, mode 0600 on the socket file, stale-socket cleanup on startup.

**Connection-as-lease.** Active connections drive idle-quit. Quit predicates are uniformly `() => boolean | Promise<boolean>`; SIGTERM is just another predicate. Anything else (quota exhausted, parent gone, config removed) plugs in the same way.

**Hot-reload.** SIGHUP re-execs tribe-daemon with the listening socket fd preserved across `execve()`. Existing connections drop briefly; `createReconnectingClient` in tribe-client replays notification handlers automatically.

**silvercode session spawn.** `resolveConnection(--agent, config)` produces a `ResolvedConnection`; the controller spawns either via `connectAcpRegistry` (ACP — `claude-acp` / `codex-acp` / `gemini-cli` / `copilot`) or `spawnClaude` (legacy stream-json). Only MCP servers spawned *inside* an agent session reach tribe — the agent-protocol channel between silvercode and the agent is a separate stdio wire.

## Status

**Wired:** tribe-daemon as the per-root coordinator; messaging tools and lore tools live in the daemon; stdio adapter spawned per Claude Code session; tty/github/recall as separate stdio MCPs (legacy); silvercode spawning agents via ACP or stream-json; tribe-client Phase 1 used by lore + tribe socket re-exports.

**In flight:** tribe-client Phases 2–4 (`km-bearly.daemon-spine`) collapse remaining ~500 LOC of duplication. Migration of tribe-daemon to the `pipe + with*` composition pattern (`km-tribe.composition-pipe`) is the prerequisite for moving tty/github/recall from separate stdio MCPs to in-daemon `withTool(…)` registrations.

**Deferred (P4):** parent-death orphan gap (`km-silvercode.parent-death-orphan-gap`) — when silvercode is SIGKILLed/OOMed/power-off'd, spawned agents reparent to init. Pgroups don't help. Kernel-level fix (PR_SET_PDEATHSIG / kqueue NOTE_EXIT, ~100 LOC) deferred until orphan accumulation is observed.

## Edge cases

| Situation | Behavior |
|---|---|
| Git worktrees of the same repo | Two project roots → two tribe instances. |
| Same repo on two machines | Two tribe instances. Daemon is per-machine. |
| Non-git directory (vault, scratch dir) | Works. Project root is filesystem scope, not git. |
| Multi-repo work | One conceptual project, multiple project roots, multiple tribes. No cross-root coordination yet. |
| Monorepo subscope | Project root = monorepo top. One tribe. Workspace memory scoped to the whole monorepo. |

## Open questions

1. **In-daemon migration of tty/github/recall.** Once the composition pipe lands, lift these from separate stdio MCP processes to `withTool(…)` registrations inside tribe-daemon.
2. **Stream-json retirement.** Once ACP is silvercode's only Claude path, retire `accounts.ts` / `resolveAccountDir`.
3. **tribe-client beyond bearly.** Public-npm extraction waits for a third standalone consumer outside the tribe family.
4. **Cross-machine coordination.** Tribe is per-machine. Out of scope.
5. **Pending file/package renames** (blast-radius, not risky):
   - `tribe-proxy.ts` → name matching "stdio adapter" (~15 imports)
   - `packages/daemon-spine/` → `packages/tribe-client/` (~20+ imports + workspace overrides)
6. **Lore namespace internally.** Methods are `tribe.*` over MCP since 0.10.0; internal RPC may still be `lore.*`. Whether to unify is open.
7. **km adopting tribe.** km could host or consume agent sessions via tribe; doesn't today. The composition pattern makes the integration mechanical when motivated by a real need.

## Documentation map

| Topic | Where |
|---|---|
| **System overview** (this doc) | `hub/architecture.md` |
| **Composition strategy** | [hub/composition.md](./composition.md) |
| **km app internals** | [docs/architecture.md](../docs/architecture.md) — layers, dependencies, building blocks |
| **silvery framework** | [silvery CLAUDE.md](../vendor/silvery/CLAUDE.md), [The Silvery Way](../vendor/silvery/docs/guide/the-silvery-way.md), [positioning](../docs/silvery-positioning-brief.md) |
| **bearly umbrella** | [bearly CLAUDE.md](../vendor/bearly/CLAUDE.md), [bearly README](../vendor/bearly/README.md) |
| **tribe daemon detail** | [hub/bearly/design/tribe-daemon.md](./bearly/design/tribe-daemon.md), [tribe README](../vendor/bearly/plugins/tribe/README.md) |
| **tribe design rationale** | `hub/bearly/design/tribe-{decoupling,minimal}.md` |
| **daemon-spine extraction** | [hub/bearly/design/daemon-spine-consolidation.md](./bearly/design/daemon-spine-consolidation.md) |
| **silvercode** | [silvercode CLAUDE.md](../apps/silvercode/CLAUDE.md), [agent-harness CLAUDE.md](../apps/silvercode/packages/agent-harness/CLAUDE.md) |
| **silvercode internals** | `apps/silvercode/docs/{in-process-mcp,multi-agent,channels}.md` |
| **per-plugin READMEs** | `vendor/bearly/plugins/{mcp,tty,github,recall,llm,injection-envelope}/README.md` |
| **/tribe skill + ops** | `.claude/skills/tribe/{SKILL,runbook}.md` |
| **alien-* family** (reactive primitives, not part of daemon topology) | `vendor/bearly/packages/alien-{projections,resources,trees}/` |

This doc is the system overview. Component-level READMEs are authoritative for behavior; this doc is authoritative for *where things fit*. It updates when the topology shape changes.
