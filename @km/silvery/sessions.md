---
id: "@km/silvery/sessions"
aliases:
  - km-silvery.sessions
  - km-silvery-sessions
created_by: claude:6443387f
created_at: 2026-04-24T05:47:26Z
closed_at: 2026-04-24T06:15:37Z
close_reason: Moved out of beads (2026-04-23). Speculative brainstorming, not
  roadmap — docs at hub/silvery/future/ai-terminal/. Revisit after km + silvery
  1.0 ship, or when a concrete trigger emerges (showcase demo needs panes,
  CAP-adjacent opportunity, etc.).
---

# [x] Session job control: typed multi-agent orchestration across humans/sessions/sub-agents @km/silvery #feature #P4

blocks:: [[@km/silvery]], [[@km/silvery/commander-protocol]], [[@km/silvery/multiplex]]

Generalize Unix job control two axes at once: from processes to sessions, from signals to typed events. Sessions are the unit of work (pane / agent / shell / sub-agent / watcher); the bus is the coordination mechanism. Humans and agents are interchangeable peers.

## Verbs (classic + extended)

Classic job control, generalized:
- `&` — spawn a detached session
- `fg` — attach (focus pane, pop to front)
- `bg` — detach; session keeps running
- `jobs` — list sessions with status (running / idle / awaiting-input / done)
- `wait` — block until exit or specified typed event
- `kill` — send typed control (cancel, pause, respond-to-prompt)

Extended for the session era:
- `tee A B` — mirror A's block stream into B
- `link A B` — typed pipe: A's output blocks → B's input
- `subscribe S event` — handler fires on typed event
- `compose A B C` — aggregator session
- `bus [name]` — tail events on named bus
- `handoff S to P` — transfer ownership to user/pane

## Who spawns

- Humans via commander palette
- Agents via CAP tool: `session.spawn({command, cwd, bus, policy})`, gated by permissions
- Sessions recursively — any session can spawn child sessions; visible tree

## Communication channels

- Direct link (cross-session typed pipe)
- Tribe bus (broadcast typed events; extend bearly/tribe from session-coord to in-session)
- Shared state (typed, named value store — semaphores++)
- Request/reply (RPC over CAP-as-MCP interface)

## What it unlocks

- Transparent sub-agents — visible in `jobs`, steerable mid-flight, cancellable independently (unlike Claude Code Agent tool's opaque black boxes)
- Orchestrated multi-agent pipelines — planner → coder → tester → reviewer, declarative via bus subscriptions
- Parallel exploration — "try 3 approaches" spawns sibling sessions in worktrees, coordinator compares
- Long-running watchers — `&` a build-watcher; other sessions subscribe to build-failed events
- Multi-human handoff — transfer session ownership across humans/machines
- Replayable multi-agent runs — every session .tape-recordable, every cross-session event typed → whole orchestration tree is deterministically replayable

## Distinctly silvery's to do

Prerequisites coexist only in our stack:
- Typed blocks (CAP) — cross-session pipes carry structure, not bytes
- Structured bus (tribe) — extend from session-coord inward
- Replayable sessions (.tape)
- PTY multiplex (mux) — sessions have real terminals
- CAP-as-MCP — session.spawn is an agent-callable typed tool

Alternatives miss something each:
- Claude Code Agent tool: opaque sub-agents, no bus, no inspection
- tmux + shell: byte streams, no typed events, no agent-native spawn
- Autogen/CrewAI/LangGraph: multi-agent but not shell-composable, not inspectable, humans can't join as peers
- bearly/tribe: right bus shape but at coord level; extend deeper

## Relation to other beads

- @km/silvery/multiplex — panes are where sessions physically live
- @km/silvery/shell (@silvery/commander) — UI where you type the job-control verbs
- @km/silvery/commander-protocol (CAP) — session.spawn + session lifecycle are CAP apps
- @km/silvery/agent-harness — collapses to "commander with curated jobs view for agent sessions"

## Reframing implication

Once session job control is first-class:
- agent-harness = curated jobs UI for agent sessions
- multiplex = substrate where sessions live
- commander = UI for job-control verbs
- collaboration / handoff / replay / orchestration = natural behaviors, not separate features

## Origin

2026-04-23 — user's "humans/agents can spin up sessions and sessions can be hooked together or communicate on a bus/tribe" framing. Generalizes Unix job control to the agent era; bearly/tribe extended inward.