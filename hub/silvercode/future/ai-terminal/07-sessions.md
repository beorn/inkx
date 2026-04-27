# Sessions — typed job control for humans + agents

**Goal**: generalize Unix job control two axes at once — from processes to sessions, from signals to typed events. Sessions are the unit of work (pane, agent, shell, sub-agent, watcher). The bus is the coordination mechanism. Humans and agents are interchangeable peers.

## Verbs (classic + extended)

### Classic job control, generalized

| Verb | Classic meaning | Generalized meaning |
|---|---|---|
| `&` | Spawn in background | Spawn a detached session |
| `fg` | Foreground | Attach — focus pane, pop to front |
| `bg` | Background | Detach — session keeps running |
| `jobs` | List jobs | List sessions with status (running / idle / awaiting-input / done) |
| `wait` | Wait on exit | Block until exit OR specified typed event |
| `kill` | Send signal | Send typed control (cancel, pause, respond-to-prompt) |

### Extended for the session era

| Verb | What |
|---|---|
| `tee A B` | Mirror A's block stream into B |
| `link A B` | Typed pipe: A's output blocks → B's input |
| `subscribe S event` | Register handler that fires on typed event |
| `compose A B C` | Aggregator session: merges streams from multiple upstream |
| `bus [name]` | Tail events on named bus |
| `handoff S to P` | Transfer ownership of session S to user/pane P |

## Who spawns

- **Humans** via commander palette or shell verbs
- **Agents** via CAP tool: `session.spawn({command, cwd, bus, policy})`, gated by permissions
- **Sessions recursively** — any session can spawn child sessions; visible tree

## Communication channels

| Channel | Use |
|---|---|
| **Direct link** | Cross-session typed pipe, 1:1, ordered, backpressured |
| **Tribe bus** | Broadcast typed events; extends bearly/tribe from session-coord to in-session |
| **Shared state** | Typed, named value store — semaphores / flags / counters |
| **Request / reply** | RPC over CAP-as-MCP interface |

## What this unlocks

### Transparent sub-agents

Claude Code spawns sub-agents opaquely (Agent tool). Ours show up in `jobs`, are steerable mid-flight, cancellable independently. You can `fg` into a sub-agent to observe, inject guidance, then `bg` it and let it continue.

### Orchestrated multi-agent pipelines

Declarative via bus subscriptions:

```
planner --writes-to--> coding-bus
coder   --subscribes-to--> coding-bus
coder   --writes-to--> review-bus  
reviewer --subscribes-to--> review-bus
tester  --subscribes-to--> review-bus
```

Each is a peer session, independently spawnable, inspectable, cancelable. Not a bespoke orchestrator framework (Autogen, CrewAI, LangGraph) — just sessions + typed buses.

### Parallel exploration

"Try 3 approaches" spawns sibling sessions in worktrees:

```
silvery-coder try-approach-a &
silvery-coder try-approach-b &
silvery-coder try-approach-c &
compose winner-picker <(jobs)
```

coordinator-session compares, picks winner, kills losers, merges result.

### Long-running watchers

```
silvery-watch build --on-change='bun run test:fast' &
# Any other session subscribes:
subscribe build-session on:build-failed --notify=me
```

### Multi-human handoff

```
handoff session-42 to @alice
# alice gets notification; can attach; takes over; session keeps running throughout
```

### Replayable multi-agent runs

Every session is tape-recordable. Every cross-session event is typed. The **whole orchestration tree is deterministically replayable**. "Re-run yesterday's planner session with these edits to step 3" is a concrete, executable operation.

## Distinctly silvery's to do

The prerequisites coexist only in our stack:

| Prereq | Ours |
|---|---|
| Typed blocks | CAP (see [05-cap-protocol.md](05-cap-protocol.md)) |
| Structured bus | bearly/tribe (extend from session-coord inward) |
| Replayable sessions | mdtest .tape |
| PTY multiplex | @silvery/multiplex (see [04-multiplex.md](04-multiplex.md)) |
| CAP-as-MCP | session.spawn is an agent-callable typed tool |

Alternatives each miss something:

- **Claude Code Agent tool** — opaque sub-agents, no bus, no inspection
- **tmux + shell** — byte streams, no typed events, no agent-native spawn
- **Autogen / CrewAI / LangGraph** — multi-agent but not shell-composable, not inspectable, humans can't join as peers
- **bearly/tribe** — right bus shape but at coord level; we'd extend deeper

## Reframing implication

Once session job control is first-class:

- **agent-harness** = curated jobs UI for agent sessions (not a separate product)
- **multiplex** = substrate where sessions physically live
- **commander** = UI where you type the job-control verbs
- **collaboration / handoff / replay / orchestration** = natural behaviors, not separate features

## Design hooks

### Typed events vs signals

Classic signals are numeric codes with overloaded meanings (SIGTERM = "please stop," SIGHUP = "reload," SIGWINCH = "resize," but in practice it's context-dependent). Our events are typed:

```typescript
type SessionEvent =
  | { kind: 'output-block', block: CapBlock }
  | { kind: 'started' }
  | { kind: 'asks-user', prompt: string, schema: JsonSchema }
  | { kind: 'wants-permission', intent: string, scope: Scope }
  | { kind: 'progress', current: number, total?: number }
  | { kind: 'finished', exit_code: number, duration_ms: number }
  | { kind: 'error', message: string, cause?: Error }
  | { kind: 'cancel-requested', reason: string }
  | { kind: 'paused' }
  | { kind: 'resumed' }
```

Commander subscribes and renders; agents subscribe and react; watchers filter.

### Session identity

Stable ULID per session. Addressable via:
- Short prefix (`jobs 4a3f`)
- Name (if given: `jobs @planner`)
- Pane ID (`jobs pane-3`)
- PID (only for debug; PIDs reused)

### Policy

Parent session sets policy at spawn; child inherits with tightening-only:

```
session.spawn({
  command: 'silvery-coder',
  cwd: '/Users/beorn/Code/pim/km',
  policy: {
    fs: { read: ['**'], write: ['packages/km-core/**'] },
    network: 'deny',
    spawn: { max_depth: 2, max_children: 5 },
    budget: { wall_time: '30m', tokens: 200_000 }
  }
})
```

Child can't escalate. Policy violations fire typed events (`wants-permission`) — parent or human decides.

### Audit trail

Every session event, every cross-session message, typed-logged. Replayable. Attributed. Searchable via recall.

## Phases

1. **Core spawn / attach / detach** — session lifecycle with typed events. Depends on @silvery/pty + multiplex daemon.
2. **jobs / fg / bg / wait / kill** — commander verbs over sessions.
3. **Tribe bus in-session** — extend bearly/tribe daemon to route in-session messages.
4. **Direct links (tee, link, compose)** — typed pipes between sessions.
5. **Handoff, multi-client** — session ownership transfer.
6. **Policy enforcement + audit** — budget contracts, permission gates.
7. **Replay** — tape recording of whole session trees; replay with edits.

## Related

- [04-multiplex.md](04-multiplex.md) — panes are where sessions physically live
- [06-commander.md](06-commander.md) — UI where you type the job-control verbs
- [05-cap-protocol.md](05-cap-protocol.md) — session.spawn + session lifecycle are CAP apps
- [02-agent-integration.md](02-agent-integration.md) — wrapped agents become sessions
- [03-agent-authoring.md](03-agent-authoring.md) — silvery-native agents are native sessions

## Origin

2026-04-23 discussion — user's framing: "humans/agents can spin up sessions and sessions can be hooked together or communicate on a bus/tribe." Generalizes Unix job control to the agent era; bearly/tribe extended inward from session-coord.
