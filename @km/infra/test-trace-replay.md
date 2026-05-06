---
mentions:
  - km
id: "@km/infra/test-trace-replay"
aliases:
  - "@km/all/test-trace-replay"
  - km-all.test-trace-replay
  - km-all-test-trace-replay
created_by: Bjørn Stabell
created_at: 2026-04-10T03:19:02Z
owner: bjorn@stabell.org
---

# [ ] Trace-replay testing — action traces as the test model (long-term vision) @km/all #epic #P3

## Status: DEFERRED — premature until TEA infrastructure stabilizes

This is a long-term vision, not current work. Prerequisite: @km/all/tea-machines must ship first (every action pure, serializable, deterministic). Until then, build the Phase 1-3 foundation from @km/all/test-ergonomics.

## Vision

Tests are **action traces**, not code. Recording an interactive session IS writing a test. Replaying the trace in CI IS running the test. Behavior-preserving refactors leave traces unchanged. The "test code" category disappears.

## Core insight

Tests are the biggest unchallenged code duplication in software — one implementation runs the app, a second implementation exercises it, both require maintenance. km's TEA state machine architecture (when complete) makes this duplication unnecessary: every action is `(action, state) → [state, effects]`, serializable and deterministic. A trace is just a sequence of actions with expected state snapshots. Recording = authoring. Replay = execution. Diff = assertion.

## Why this only works for km

Most apps can't replay reliably. React effects are non-deterministic (timers, DOM, network). But km is being designed for this — actions are data, reducers are pure, effects are isolated behind provider boundaries. The architectural decision already made enables trace-based testing as a natural consequence.

## What it looks like

### Recording

```
$ bun km view --record /tmp/bug.trace ~vault
(user reproduces a bug interactively)
$ bun km trace /tmp/bug.trace --assert "after action 5: bell.ringCount === 1"
Saved to tests/traces/bugs/2026-04-09-fold-boundary.trace
```

### Replay

```
$ bun test:trace tests/traces/**/*.trace
232 traces replayed, 2.1s
```

### Failure debugging

```
$ bun test:trace tests/traces/fold-boundary.trace
FAIL at action 14 (press H)
Expected cursor at task-12, got task-13
Opening interactive stepper (j/k to step, q to quit)
(shows state at each action with screen preview)
```

Authoring cost: 30 seconds. No TypeScript. No imports. No fixtures. No store access.

### Property invariants complement traces

Small set of runtime-checked invariants:

```
invariant("cursor always on visible node", ...)
invariant("undo always reversible", ...)
invariant("no orphan nodes", ...)
```

Chaos fuzzing throws random actions at the app. Invariant violations produce a trace automatically saved to `tests/traces/chaos-discoveries/`. Chaos-discovered traces become regression tests.

## Downstream benefits (not just testing)

- **Undo/redo becomes free** — replay to action N-1
- **User bug reproduction** — user sends trace, dev replays locally
- **AI debugging** — LLMs read traces, propose fixes
- **Performance regression** — time traces
- **Feature flags** — replay same trace with flag on/off, diff states
- **Collaborative editing (CRDTs)** — needs replayable logs anyway
- **Tutorials, demos, crash reports** — all derive from traces

## Why deferred

1. **TEA state machines not stabilized** — some actions still have non-pure paths. Need `km-all.tea-machines` to complete first.
2. **Determinism gaps** — real time, random IDs, file I/O, network calls aren't controlled yet. Need a deterministic runtime.
3. **Foundation work in progress** — `km-all.test-ergonomics` Phase 1-3 (typed getters, snapshots, mdspec) must ship first to validate the architectural direction.
4. **Unknown edge cases** — don't know yet which parts of km genuinely can't be replayed (real-time subscriptions? file watchers?).

## Prerequisites

- [ ] @km/all/tea-machines: all interactive subsystems migrated to pure state machines
- [ ] @km/all/test-ergonomics Phase 1: typed getters + delete testEnv
- [ ] @km/all/test-ergonomics Phase 2: screen snapshots wired in
- [ ] @km/all/test-ergonomics Phase 3: mdspec DSL built (may be superseded by trace format)
- [ ] Deterministic runtime: controllable time, seedable random, mocked I/O

## Phases (when/if this is picked up)

### Phase A — Trace format

Define the .trace file format. Consider:

- Human-readable (JSON or markdown-like) vs binary
- Action encoding (serialized TEA actions)
- State checkpoints (every N actions? every action? just initial+final?)
- Assertions (inline or in separate .assertions file)

### Phase B — Recording infrastructure

- `bun km view --record <file>` captures every action
- Include fixture reference, initial state, action sequence
- Snapshot state at each action (for diff on replay)

### Phase C — Replay runner

- `bun test:trace <file>` replays the actions
- Deterministic runtime: mock time, seed random, isolate I/O
- Compare actual vs expected state per action
- Clear failure messages with action context

### Phase D — Interactive trace viewer

- `bun trace view <file>` opens a stepper
- Step forward/back, see state + screen at each action
- Add/modify assertions inline
- Integration with /tdd workflow

### Phase E — Property invariants + chaos

- Invariant registry
- Chaos fuzzer that runs invariants on random actions
- Auto-save traces on invariant violations
- CI integration

### Phase F — Migration

- Convert canonical journey tests to traces
- Keep createTestApp for component-level tests (card layout, border rendering, visual regression)
- Policy: new behavioral tests are traces

## Related beads

- **@km/all/tea-machines** (prerequisite) — the architectural foundation
- **@km/all/test-ergonomics** (parent/predecessor) — the current incremental plan
- **@km/all/test-whitebox-api** (current work) — Phase 1 foundation

## If we don't do this

The current plan (typed getters + snapshots + mdspec) is good. It's a significant improvement over testEnv. Trace-replay is an even bigger improvement, but only if TEA machines are stable. If they never stabilize, the trace model doesn't work, and the current plan is where we stop.

## When to pick this up

After @km/all/tea-machines ships AND @km/all/test-ergonomics Phase 3 is in production AND we have 6+ months of data showing where the mdspec approach is still painful. If mdspec + snapshots + getters are good enough, we don't need this.

