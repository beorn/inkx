# Supervision hierarchy + stdlog/stdapi — the Unix foundation the rest should sit on

**Status**: ideation and concepts, not decisions. Same discipline as the rest of this folder — we're cataloguing what's *possible*, not picking what to build. Which of these ideas (if any) are useful for us is a separate question we haven't answered; business value / adoption / validation all sit downstream of this doc.

**Added 2026-04-23** after user pointed to prior thinking in the legion project. This isn't an additional track — *if* we pursue any of this, it's the lower-level abstraction that tidies up sessions (L4), CAP (L2), commander (L3), and multiplex (L1).

**Origin**: legion (`~/Code/legion/`) has been thinking about Unix-native supervision trees + Warp-style terminal-as-process-manager since well before this brainstorm. The AI-terminal docs independently rediscovered pieces of the same idea (sessions as typed job control, CAP blocks, bus-coordination) without the unifying OTP-style frame. Folding legion's frame in makes everything cleaner.

## The two directions

### 1. Strict supervision hierarchy for every app

Every app runs under a supervisor. Supervisors form a tree. Inspired by Erlang/OTP, Akka, s6/s6-overlay, runit, supervisord, systemd — but generalized across process/container/cluster and tightly integrated with the terminal UI (commander).

legion's hierarchy (Roman-legion-named) — **one unified tree, not separate local/cloud trees**:

- **centurion** — in-process task / structured concurrency (fibers, async tasks)
- **legate** — app-level supervisor (the app runs under a legate)
- **prefect** — container / node supervisor (coordinates legates on a machine)
- **tribune** — cluster supervisor (coordinates prefects across machines)
- **emperor** — business / organization (top of tree)

**Key property (2026-04-23 addition from user)**: there is **exactly one supervision tree** that spans from the management node down to individual fibers inside a worker process. No process/cloud boundary — just different levels of the same tree. A fiber in a JS process on a k8s pod in a cluster in a datacenter is addressed, supervised, monitored, restarted, routed with the same API as a local child process. Operations at any level of the tree compose: stop-subtree applies whether the subtree is a fiber or a whole region.

This is what makes "the terminal IS the dashboard" real: commander walks the tree from the local worktree all the way to production, without switching tools.

Properties:

- **Addresses persist across restart** — a session has a stable ULID; when it crashes and gets restarted, its address doesn't change. Consumers of its events don't need to re-subscribe.
- **Mailboxes persist outside the actor instance** — messages arrive and survive restart.
- **Restart policies** — one-for-one, one-for-all, rest-for-one (OTP terminology). Failures escalate up the tree when the local supervisor can't handle them.
- **Discovery** — register-by-name, look up by pattern. No service-discovery bolt-on; the supervision tree IS discovery.
- **Lifecycle uniformity** — start / stop / restart / health-check are the same operations whether the child is a local thread, a subprocess, a container, or a remote VM.

Prior art we'd align with:
- Erlang/OTP (the reference model)
- Akka (JVM port)
- s6 / s6-overlay, runit, supervisord, daemontools (Unix supervision trees)
- systemd / launchd (OS-level supervision)
- Docker Compose / Kubernetes (container supervision)
- pm2 (Node-specific)

### 2. stdlog (fd3) — structured JSONL log channel

Convention: apps that opt in write JSONL log events to **file descriptor 3**. Parent (supervisor / commander) reads fd3 and gets structured logs for free — no per-app log-config dances, no log-rotation reinvention, no "how do I get this app's output into my log aggregator."

Suggested line shape:

```jsonl
{"ts":"2026-04-23T06:30:12.043Z","level":"info","event":"started","pid":12345}
{"ts":"2026-04-23T06:30:12.201Z","level":"info","event":"fetching-prs","repo":"km"}
{"ts":"2026-04-23T06:30:13.444Z","level":"warn","event":"api-slow","latency_ms":1200}
{"ts":"2026-04-23T06:30:14.001Z","level":"info","event":"finished","exit_code":0,"duration_ms":1958}
```

Why fd3:
- **stdout (fd1)** stays for humans — prompts, tables, REPL output, piping-to-other-tools
- **stderr (fd2)** stays for errors that should be surfaced immediately
- **stdlog (fd3)** is for the program's view of itself — every event, decision, state transition
- No overloading; no `$LOG_FORMAT=json` env-var switch; no "is this stdout text or JSON?" mode-guessing

Consumers:
- Commander's `<BlockList>` renders stdlog events as typed blocks (tables for rows, progress bars for progress events, charts for series)
- Supervisors audit-log to disk
- Tracing systems correlate spans across apps
- Agents introspect what a wrapped app has done without parsing text

This is **strictly cleaner than `CAP_OUTPUT=blocks` env var switching** (which is how 05-cap-protocol.md originally proposed it). Replacing.

### 3. stdapi (fd4) — bidirectional JSON-RPC control channel

Convention: apps that opt in expose a JSON-RPC channel on **file descriptor 4**. Bidirectional: parent sends requests, child responds; child sends notifications, parent consumes.

Sample calls:

```jsonrpc
// child → parent (ask for user input)
{"jsonrpc":"2.0","method":"ask_user","params":{"prompt":"Overwrite foo.txt?","schema":{"type":"boolean"}},"id":1}

// parent → child (response)
{"jsonrpc":"2.0","id":1,"result":true}

// parent → child (request)
{"jsonrpc":"2.0","method":"cancel","params":{"reason":"user-requested"},"id":2}

// child → parent (notification — no id)
{"jsonrpc":"2.0","method":"wants_permission","params":{"intent":"network","scope":"github.com"}}
```

Surface:
- `ask_user(prompt, schema)` — child asks parent to resolve a user interaction
- `wants_permission(intent, scope)` — child requests capability grant (ties to CAP permissions; see 05)
- `progress(current, total, label)` — child reports progress (alternative: stdlog event)
- `cancel(reason)` — parent asks child to stop (soft); SIGTERM is escalation
- `query(name, args)` — RPC to child

Why separate from stdlog:
- stdlog is one-way (child → parent), unordered events
- stdapi is bidirectional, request-response with correlation IDs
- stdlog = "what happened"; stdapi = "what should happen next"

Relationship to MCP:
- **MCP uses stdin/stdout for JSON-RPC** → occupies fd0/fd1 → can't coexist with human IO in the same process.
- **stdapi on fd4** → stdin/stdout stay for humans → coexists trivially.
- stdapi is effectively a Unix-native MCP flavor: same JSON-RPC shape, different FDs.
- An app can speak stdapi *and* MCP — the wire format is the same; just different transports.

## Alignment-as-deployment-principle (the unifying frame)

This is the sharpest frame for why the above matters. It's `docs/principles.md § Principle: Alignment` applied to application deployment rather than code structure.

### Alignment in code (recap from principles.md)

- **Aligned names** enable shorthand and spread: `const path = ...; return { path }` not `{ path: rootPath }`
- **Family prefixes** enable pattern-matching: `getNode, getChildren` not `getNode, fetchChildren`
- **Equal weight** — all one-liners or all extracted, not mixed
- **Spread over prop-drilling** — `<Child {...props} />` instead of mapping field-by-field
- **Why**: aligned code enables generic wrappers, spread syntax, and visual scanning

### Alignment in deployment (the gap today)

Application deployment is a pile of **misaligned** abstractions. Same concepts, different names at every layer:

| Concept | Dev | Docker | Compose | k8s | Helm | systemd | Lambda |
|---|---|---|---|---|---|---|---|
| Where the code lives | `src/` | `COPY` | `build.context` | `image` | `image.repository` | `ExecStart` | `CodeUri` |
| Port it listens on | `PORT` | `EXPOSE` | `ports` | `containerPort` / `servicePort` / `targetPort` | templatized | `ListenStream` | `Events.Api.Properties.Port` |
| Env configuration | `.env` | `ENV` | `environment` | `envFrom` / `env.valueFrom` | `values.yaml` | `Environment=` | `Environment.Variables` |
| Restart policy | (none) | `--restart` | `restart` | `restartPolicy` | values | `Restart=` | (implicit) |
| Logs | `console.log` | `docker logs` | `compose logs` | `kubectl logs` | helm-k8s-same | `journalctl` | CloudWatch |
| Health check | (ad-hoc) | `HEALTHCHECK` | `healthcheck` | `livenessProbe` / `readinessProbe` | values | `ExecStart+Watchdog` | (implicit) |
| Scale out | (none) | (none) | `deploy.replicas` | `replicas` / HPA | values | `templates` instances | auto |

Every level renames. Every level requires a fresh config file with a fresh schema. Every level is a leaky abstraction over the one below. The `{ ...props }` equivalent doesn't exist.

### Alignment applied to deployment

Pick one set of names for concepts and hold them **at every level of the tree** — fiber, worker, container, pod, cluster, region. Supervision tree addresses are the concatenation. Operations compose:

- **Logs**: `stdlog` is `stdlog` whether emitted by a fiber, a worker, a container, or a pod. Consumer walks the tree.
- **Config**: env-var conventions (12-factor) at every level; no renaming between layers.
- **Restart**: the same policy grammar applies to a fiber, a worker, a container.
- **Health**: stdapi `ping` call means the same thing to a fiber and a whole pod.
- **Scaling**: "replicate this subtree N times" is the same verb whether the subtree is a fiber, a worker, or a region.
- **Addressing**: `emperor.tribune.prefect.legate.centurion.fiber` is the full path. Truncate at any level for aggregate ops.
- **Discovery**: tree-walk; no separate service-discovery system.

The "spread" analogue: **a local dev commander view IS the prod dashboard.** Same tools, same verbs, same names. Going from `bun dev` to staging to prod is walking the same tree, not switching tools.

This is what "12-factor++" means concretely: take 12-factor's aligned conventions (env for config, stateless processes, disposability, dev/prod parity) and **extend them with stdlog + stdapi + unified supervision tree + structured concurrency**. Any app that follows the extended conventions drops into any supervisor at any level of the tree with no adapter.

### Structured concurrency + fibers (built-in, not bolted)

**First-class structured concurrency at every level.** Not "centurion is an optional library"; structured concurrency is a property of being a supervised actor. Every actor — fiber, worker, container, pod — has:

- Scoped task groups (tasks tied to supervisor lifetime; orphans impossible)
- Deadlines that propagate up the tree (cancel a parent → cancel every descendant fiber)
- Exception propagation across scope boundaries
- Cancellation is uniform from fiber to region

**Fibers-per-connection multiplexing**: one worker process multiplexes many logical agents via fibers. Each fiber is a supervised actor under the worker's centurion. One TCP connection, one WebSocket, one PTY can host dozens of logical actors — each with its own stdlog stream, its own stdapi channel, its own address in the tree. No process-per-agent overhead; no "spawn a container for each task" waste.

Concretely: `silvery-team` with 4 peer agents (planner/coder/reviewer/tester) runs as 4 fibers in 1 worker process under 1 legate. Token usage, memory, CPU are visible per-fiber through stdlog. Supervisor restarts a single misbehaving fiber without disturbing its siblings. If the whole worker crashes, all 4 fibers restart together under the same addresses.

This is how you get agent density: one laptop can host a supervision tree with hundreds of fibers, each a useful agent, coordinated through structured concurrency + mailbox pipes + stdlog observability — without per-process overhead.

### 12-factor++ — the compatibility story

[12factor.net](https://12factor.net) is the modern baseline for deployable apps. It aligned a lot: env-based config, stateless processes, disposability, dev/prod parity. Our extension:

**12 classic factors** (unchanged):
1. Codebase (one codebase tracked in revision control, many deploys)
2. Dependencies (explicitly declared and isolated)
3. Config (store in the environment)
4. Backing services (treat as attached resources)
5. Build, release, run (strict separation)
6. Processes (stateless, share-nothing)
7. Port binding (export services via port binding)
8. Concurrency (scale out via process model)
9. Disposability (fast startup, graceful shutdown)
10. Dev/prod parity (keep development, staging, production as similar as possible)
11. Logs (treat as event streams)
12. Admin processes (run as one-off processes)

**++ additions (what supervision unlocks)**:

13. **stdlog on fd3** (structured event stream — extends factor 11)
14. **stdapi on fd4** (Unix-native MCP-shape RPC)
15. **Opt-in supervision** — app exposes health/status/restart via stdapi; supervisor owns lifecycle
16. **Structured concurrency** — all async work is scoped; no orphan tasks survive parent death
17. **Typed manifests** (CAP) — flags, intents, permissions, output schemas declared statically

Any app that follows 12-factor already has 90% of the shape. Adding fd3/fd4 + a manifest is days of work for any modern web service. Once done, the app is **adoptable at every level of the supervision tree**: local dev, container, pod, cluster. Same tooling. Same dashboard. Same debugger.

**This is the wedge for adoption.** You don't have to rewrite to use our stack. You just add stdlog + stdapi to a 12-factor app and gain free integration with commander, agent harness, and the supervision tree. Low buy-in, high payoff.

## How this unifies the existing tracks

### Sessions (L4) → specialization of the supervision tree

Everything in 07-sessions.md is a specialization of "supervised actor":

| Sessions doc says | Supervision view |
|---|---|
| Session ≈ pane / agent / shell / sub-agent / watcher | Each is a supervised actor with stable address |
| `jobs` lists sessions | `jobs` walks the supervision tree rooted at current workspace |
| `fg` / `bg` / `kill` | Supervisor operations: attach-focus, detach-keep-running, send-cancel |
| `tee A B`, `link A B` | Typed pipes between actors via their mailboxes |
| Tribe bus | The mailbox layer — typed broadcasts |
| Policy + budget | Supervisor config (OTP-style max-restarts + resource limits) |
| Replay | Mailbox log + supervisor audit trail → deterministic reconstruction |

The right way to read 07 after this doc lands: sessions is "the user-visible subset of the supervision tree + job-control verbs over it."

### CAP (L2) → specialization of stdlog + stdapi

CAP's five pieces map cleanly:

| CAP piece | Supervision-era form |
|---|---|
| Manifest | Unchanged — still a JSON document declaring flags, intents, permissions, outputs |
| Typed output streams (blocks) | **stdlog on fd3** — replace `CAP_OUTPUT=blocks` env var |
| Bidirectional control | **stdapi on fd4** — replace "side-channel FD" hand-wave |
| Typed completion | Unchanged — `--cap-complete` still works |
| App-as-MCP-server | stdapi-on-fd4 IS MCP with a different transport |

Revised CAP: manifest describes what the app offers; stdlog/stdapi are the wire. Drop the env-var mode-switch; just say "CAP-aware apps MAY write to fd3 and fd4 when those fds are wired."

### Commander (L3) → UI over the supervision tree

Commander's view is literally the supervision tree:
- Each pane is a supervised actor
- The tree is navigable (expand/collapse, focus, hover)
- Per-actor panels: status, stdlog live-tail, stdapi RPC form, flag-form-for-rerun
- Actions: start / stop / restart / handoff / fork are supervisor operations

This is the fullest version of legion/thoughts.md's "Terminal as process manager" — with the Warp-block model, the interleaved-logs-with-lifeline view, the dynamic log-level-setting, and the process viewer all falling out of stdlog-on-fd3 + supervisor control.

### Multiplex (L1) → PTYs are one IO surface among many

Each pane is a supervised actor. Some actors have a PTY attached (shell, vim, Claude Code TUI); others have only stdlog + stdapi (headless agents, background workers). The `<PtyPane>` is specialization: "this supervised actor also renders a PTY grid." `<HeadlessPane>` would be: "this supervised actor emits stdlog and we render it as a `<BlockList>`."

### Agent integration (track) → stdlog is the sweet spot

- Mode A (structured-output) → stdlog, perfect fit. `claude -p --output-format=stream-json` is essentially "write structured events somewhere"; pipe to fd3.
- Mode B (tail JSONL) → stdlog, shifted in time. JSONL files are post-hoc stdlog dumps.
- Mode C (PTY grid wrap) → we **synthesize stdlog** from grid parsing as a fallback. Heuristic, lossy, but uniform with native-stdlog consumers.

### Agent authoring (track) → stdlog/stdapi from day one

Silvery-native agents emit stdlog for every turn, every tool call, every decision. Every permission request goes through stdapi. No custom protocol; the infrastructure already exists.

## Revised stack

```
L∞.  EMPEROR           (business / organization — legion's top)
L5.  TRIBUNE           (cluster supervisor)
L4.  PREFECT           (container / node supervisor)
L3.  LEGATE            (app supervisor)
L2.  CENTURION         (in-process task / structured concurrency)
───── supervision tree ─────
L1.  stdlog (fd3) + stdapi (fd4)  — unix-native structured I/O
L0.  stdin/stdout/stderr          — classic Unix text I/O
```

Every track in this folder specializes this foundation:

- **Sessions** = user-visible slice of supervision tree + job-control verbs
- **CAP** = typed manifest + semantics for stdlog/stdapi events
- **Commander** = UI for the supervision tree
- **Multiplex** = subset where actors have PTYs attached
- **Agent integration/authoring** = workflow / persona conventions on top

## What this unlocks that we didn't have before

1. **"Unix-native MCP"** — stdapi-on-fd4 is MCP with a different transport; any CAP-aware app is also an MCP-callable tool when its stdapi is exposed. The path from "I wrote a small CLI" to "my CLI is an MCP tool" is zero config.

2. **Cross-language supervision** — stdlog/stdapi are byte-level conventions. Any language can emit them (3 lines of code). The supervision tree spans TypeScript + Python + Rust + Bash scripts uniformly.

3. **Fault tolerance is a commander feature, not a per-app feature** — restart-on-failure, exponential backoff, circuit breakers all live at the supervisor. Individual apps don't reimplement.

4. **The terminal IS the dashboard** — legion/thoughts.md wanted this in 2018-ish. With silvery's component model, commander can render the supervision tree with flame-graphs, Warp-style blocks, interleaved-logs-with-lifeline, clickable processes, dynamic log-level-setting. None of it is bolted on.

5. **Systemd / launchd / Docker / k8s integrate cleanly** — our local supervisor can delegate to OS-level supervisors for persistence; no reinvention. Prefect (in legion's naming) is the adapter layer.

6. **Replay across process boundaries** — a single supervisor's audit log captures every fd3/fd4 message to and from its children. Deterministic replay of the whole subtree becomes possible.

## What this does NOT solve

- **Apps that don't opt in** — bash, git, ls don't write stdlog. `cap-wrap` heuristic adapters stay relevant: watch a non-stdlog app's PTY output, synthesize stdlog events.
- **Performance** — fd3/fd4 are byte streams; serialization has a cost. For hot paths (thousands of events per second), a shared-memory ring or binary framing would be needed. That's optimization, not foundation.
- **Security / sandboxing** — fd3/fd4 are IPC; untrusted children can still lie or flood. Budget enforcement (see big-ideas.md § S) still matters.

## Prior art to survey

- **Erlang/OTP** — supervisors, mailboxes, addresses, restart strategies. The canonical reference.
- **Akka** — JVM port; richer tool ecosystem; good API lessons.
- **s6-overlay** — lightweight Unix supervision tree; worth studying for container use.
- **systemd** — unit-file format, socket activation, notify protocol. The systemd notify socket is conceptually similar to stdapi (uses `$NOTIFY_SOCKET` env var).
- **Docker Compose + Kubernetes** — distributed supervision patterns; restart policies, health checks.
- **pm2, forever, concurrently, ultra** — Node-specific precedents.
- **MCP (Model Context Protocol)** — JSON-RPC over stdio; stdapi is "what MCP would look like if it didn't steal stdin/stdout."
- **OpenTelemetry** — tracing/metrics/logs unified standard; stdlog could emit OTel-compatible lines.
- **logfmt / structured logging conventions** — Heroku-ish key=value pairs; JSONL is the modern successor.
- **Unix fd3 prior uses** — systemd notify socket, some build tools for extra output, Python process spawns passing fd3 for status. No standardized "logs" role yet.

## Questions for /pro review

- Does the supervision-tree frame actually tidy things up, or does it impose a schema that's too opinionated for real apps?
- Is fd3/fd4 convention clean enough that tool authors would actually write to it, or do we hit the same adoption wall as other Unix conventions (SIGINFO, $NOTIFY_SOCKET, etc.)?
- How does this coexist vs compete with MCP? Is "stdapi = MCP on fd4" the right framing, or does it fragment the ecosystem?
- What breaks when the supervision tree spans local + cloud? (Hint: prefect/tribune/emperor in legion; but adapter cost is real.)

## Where to take this next

1. Talk to the legion code — centurion is already a real library for JS structured concurrency. It's the L2 piece.
2. Sketch the stdlog schema rigorously. Probably align with OpenTelemetry log records.
3. Sketch stdapi schema. Probably align with MCP so "stdapi ≈ MCP on fd4" is true syntactically, not just conceptually.
4. Prototype: tiny CLI that opts into stdlog + stdapi; commander consuming it; visible UI win.
5. **Validate**: does anyone outside our own ecosystem care? This is a convention play; without adoption it's a curiosity.

## Related docs

- [05-cap-protocol.md](05-cap-protocol.md) — needs updating to use fd3/fd4 instead of `CAP_OUTPUT=blocks`
- [07-sessions.md](07-sessions.md) — sessions = user-visible supervision tree
- [06-commander.md](06-commander.md) — commander renders the supervision tree
- [big-ideas.md](big-ideas.md) — permissions (A), observability (B), contracts (S) all compose with supervision

## Outside-world references (from legion/docs)

- `~/Code/legion/docs/thoughts.md` — terminal-as-process-manager ideation + actor-system notes
- `~/Code/legion/centurion/README.md` — structured concurrency primitives
- `~/Code/legion/docs/naming-roman-legion.md` — the hierarchy naming
