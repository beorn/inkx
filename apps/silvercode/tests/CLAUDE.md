# silvercode tests

Layered test system for silvercode. Tests exercise the real UI + controller +
agent-harness stack without hitting live Anthropic / OpenAI APIs.

## The five layers

```
L1 unit          — pure functions, 1-5 ms      (markdown, context-windows, claude-account, git-branch)
L2 component     — React + fakes, 5-50 ms      (createRenderer; SidePanel, message blocks, QueueEditor)
L3 controller    — full controller wiring, 50-500 ms  (ScriptedFakeSession via spawnFactory)
L4 end-to-end    — ANSI snapshot via termless, 1-5 s  (Welcome, queue, overflow, mode cycling)
L5 live smoke    — manual checklist                  (smoke-checklist.md)
```

Layer 5 lives outside vitest. Everything else runs under `bun vitest run apps/silvercode/tests/`.

## Picking a layer when adding a test

```
What is the test asserting?
├── A pure function returns X for input Y          → L1
├── A component renders the right ANSI given props → L2 (createRenderer + fakes)
├── The controller wires events to state correctly → L3 (ScriptedFakeSession)
├── The full app produces the right ANSI on a flow → L4 (termless tape)
└── A real API change broke a real user flow        → L5 (manual)
```

Default to the **lowest** layer that can express the assertion. L1 tests
run in milliseconds and never flake; L4 tests are 100x slower and depend
on terminal-emulation invariants.

If a test would naturally fit at multiple layers, write it at the lowest
one and add a thin smoke at the higher layer to confirm the wiring. The
controller's queue batching has L3 tests pinning the algorithm
(`queue-batching.test.tsx`) plus an L4 smoke (`queue-ux.test.tsx`)
showing the rendered queue editor.

## ScriptedFakeSession (L3)

`apps/silvercode/src/test/fake-session.ts` exposes `createFakeSession()`
returning an `AgentSession`-shaped fake with three superpowers:

- `emit(event)` synchronously dispatches one event to subscribers.
- `script(events, intervalMs)` replays a pre-built sequence over time.
- `injectError(msg)` / `injectSessionEnd(reason)` simulate failure paths.
- `sent` array records every `send()` and `respondToPermission()` call.

Wire via `Controller.opts.spawnFactory: () => fake`. The controller can't
tell the difference between a real subprocess and the fake — same surface,
same event stream.

### Pre-built scripts

```
apps/silvercode/src/test/scripts/
  helloWorld.ts          — init → user "hi" → assistant "Hi!" → turn-end
  bashTool.ts            — init → user → tool_use(Bash) → tool_result → text → turn-end
  longToolResult.ts      — 1KB unwrappable blob (overflow regression bait)
  multiTurn.ts           — 3 user/assistant turns with token usage
  permissionRequest.ts   — split: before-approval and after-approval halves
  sessionEnd.ts          — graceful and error variants
  welcome.ts             — empty session for Welcome card tests
  markdownRich.ts        — assistant text with code fences, lists, tables
  queuedThree.ts         — drives queue batching from the LLM side
```

### Multi-backend fakes

`fake-codex-session.ts` / `fake-sdk-session.ts` are thin wrappers that
default to OpenAI / SDK shaped session ids and provide `codexInitEvent`
/ `sdkInitEvent` helpers with backend-correct metadata (model, tools,
apiKeySource). Use these when a test exercises multi-backend logic;
otherwise prefer the canonical `createFakeSession`.

## End-to-end ANSI snapshots (L4)

L4 tests live in `apps/silvercode/tests/visual/`. They render the real
`<App/>` with fake boundaries (filesystem, git probe, accountly, version
detection) via `apps/silvercode/src/test/render-harness.tsx`. Assertions
use:

- `app.text` — printable characters (drift-detection style snapshots)
- `app.locator()` — stable selectors over the rendered tree
- `_invariants.ts` — universal invariants every visual test asserts
  (no overflow, side-panel visible, no double-render artefacts)

`mutations.test.tsx` is the canonical example of the "deliberate
regression" technique — it applies fault patches and asserts each
invariant catches its target class. Read it before writing a new
visual test, especially before relaxing or skipping an invariant.

## Test commands

```bash
# Full silvercode suite (~6-8s on a fresh worktree)
bun vitest run apps/silvercode/tests/

# A single file
bun vitest run apps/silvercode/tests/queue-batching.test.tsx

# Watch mode while iterating
bun vitest apps/silvercode/tests/<file>.test.tsx

# Just the agent-harness package tests (lower-layer pieces)
bun vitest run apps/silvercode/packages/agent-harness/tests/
```

Never run `bun test` (it bypasses vitest's project config).

## Anti-patterns

- **Hand-rolling the AgentSession surface in a test.** Use
  `createFakeSession` — it's shape-checked against the real
  `AgentSession` interface and propagates type changes for free.
- **Skipping a flaky test.** Investigate first; flakes usually point at
  real timing bugs in controller / store wiring.
- **Asserting against private controller state.** Tests should only
  observe what UI components observe — the public `Controller` API
  - `handle.store.state.get()` snapshot.
- **Hardcoding ANSI escape sequences in assertions.** Use
  `app.locator()` and the helpers in `parse-frame.ts`. ANSI codes
  drift when silvery's pipeline changes; semantic selectors don't.

## Adding a new pre-built script

1. Place the file in `apps/silvercode/src/test/scripts/<name>.ts`.
2. Export the events as a `ReadonlyArray<AgentEvent>`.
3. Use the SAME `SESSION` / `TURN_ID` constants throughout the script —
   downstream code matches on these.
4. Add a smoke test in `script-library.test.tsx` that drives the script
   through a controller and asserts the terminal state.
5. Document the script's purpose at the top with a one-paragraph
   comment — what it tests, what failure mode it's meant to catch.
