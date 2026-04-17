# InkX Render API — ARCHIVED 2026-04-17

> **Ink is retired**; km uses [silvery](../../vendor/silvery/). This speculative design won't ship.

# Unified Silvery Rendering API

> **Status: Future** — Design proposal, not yet implemented.

Unify production and testing render paths via a pure generator API that separates I/O from rendering logic.

**TL;DR:** Replace `render(term, <App />)` and `createRenderer()` with a single generator-based API. Render yields frames, caller handles I/O. Testing becomes `gen.next(input)`, production wires to real terminal.

---

## Motivation

### Pain Points Today

1. **Two mental models** — Production uses `render(term, <App />)`, testing uses `createRenderer()`. Same operation, different APIs.

2. **Test-only debugging** — `getContainer()`, `debugTree()`, frame capture only exist in test renderer. Can't debug production rendering.

3. **Awkward mocking** — `stdin.write('\x1b[B')` requires ANSI codes. `press('ArrowDown')` would be clearer.

4. **Implicit I/O** — Production render couples React to terminal output. Can't intercept frames for logging, replay, or debugging.

### What We Want

- Single API for both production and testing
- Pure rendering with explicit I/O boundaries
- Ergonomic testing: `press()`, `screenshot()`
- Frame capture everywhere

---

## When to Implement

**Triggers:**

- Major Silvery feature touching both render paths
- Need production frame capture (debugging, logging)
- Test infrastructure overhaul
- Extracting Silvery as standalone library

**Skip if:**

- Current APIs working fine
- No need for unified debugging

---

## Current State

### Two Rendering Paths

**Production:**

```tsx
using term = createTerm()
await render(term, <App />)
```

**Testing:**

```tsx
const render = createRenderer({ cols: 80, rows: 24 })
const result = render(<App />)
result.stdin.write("\x1b[B")
expect(result.lastFrameText()).toContain("...")
```

### Feature Matrix

| Feature         | Testing                   | Production  |
| --------------- | ------------------------- | ----------- |
| Frame capture   | `lastFrame()`, `frames[]` | stdout only |
| Execution       | Synchronous               | Async       |
| Input           | `stdin.write()`           | Real stdin  |
| Tree inspection | `getContainer()`          | None        |
| Diffing         | Disabled                  | Enabled     |

### Shared: 5-Phase Pipeline

Both use `executeRender()`:

```
Measure → Layout → Scroll → ScrollRect → Content → (Output)
```

Tests capture buffer; production diffs and emits ANSI.

---

## Proposed Design

### Architecture

Render as pure generator. Yields frames, receives input. No I/O.

```
┌─────────────────┐     events      ┌─────────────────┐
│      Term       │ ───────────────→│     Render      │
│  (I/O adapter)  │                 │  (pure logic)   │
│                 │ ←───────────────│                 │
└─────────────────┘     frames      └─────────────────┘
```

### Types

```tsx
interface Frame {
  buffer: TerminalBuffer // Raw cells
  output: string // ANSI diff
  text: string // Plain text
  container: InkxNode // Component tree
}

interface RenderEvent {
  type: "exit" | "bell" | "title" | "cursor-move"
  payload?: unknown
  error?: Error
}

interface InputEvent {
  type: "key" | "mouse" | "resize" | "focus" | "blur"
  data?: string
  // mouse: x, y; resize: columns, rows
}
```

### API Layers

**Layer 1: Sync Generator (Core)**

```tsx
function* renderSync(element, options): Generator<{ frame, event? }, void, InputEvent?>
```

**Layer 2: Async Generator (Event Streams)**

```tsx
async function* render(element, events, options): AsyncGenerator<{ frame, event? }>
```

**Layer 3: Convenience Wrappers**

```tsx
// Production
async function run(term: Term, element: ReactElement): Promise<void>

// Testing
function createTestTerm(options): TestTerm
```

### Usage: Testing

```tsx
// Direct generator (maximum control)
const gen = renderSync(<Counter />, { cols: 80, rows: 24 })
const { frame } = gen.next().value!
expect(frame.text).toContain("Count: 0")

const { frame: next } = gen.next({
  type: "key",
  data: keyToAnsi("ArrowUp"),
}).value!
expect(next.text).toContain("Count: 1")

// Convenience wrapper (typical tests)
using term = createTestTerm({ cols: 80, rows: 24 })
term.render(<Counter />)
term.press("ArrowUp")
expect(term.screenshot()).toContain("Count: 1")
```

### Usage: Production

```tsx
// Convenience (typical)
using term = createTerm()
await run(term, <App />)

// Explicit control (advanced)
for await (const { frame, event } of render(<App />, term.events(), options)) {
  term.write(frame.output)
  if (event?.type === "exit") break
  if (event?.type === "bell") term.bell()
}
```

---

## Prior Art: Pure Functional Effect Systems

Our generator-based design follows patterns from several pure functional systems with strong effect isolation. This section surveys how they handle the core problem: separating pure computation from effectful I/O.

### The Core Pattern

All these systems share a key insight: **pure functions describe effects, an external runtime executes them.**

```
┌─────────────────┐   effect descriptions   ┌─────────────────┐
│   Pure Logic    │ ────────────────────────→│    Runtime      │
│  (your code)    │                          │  (executes I/O) │
│                 │ ←────────────────────────│                 │
└─────────────────┘   results / events       └─────────────────┘
```

### Systems Surveyed

| System                                                             | Effect Model        | How Effects Are Described        |
| ------------------------------------------------------------------ | ------------------- | -------------------------------- |
| [Elm](https://guide.elm-lang.org/architecture/)                    | Commands to runtime | `Cmd msg` returned from `update` |
| [Roc](https://www.roc-lang.org/functional)                         | Platform + Tasks    | `Task` values handed to platform |
| [Haskell](https://wiki.haskell.org/All_About_Monads)               | IO Monad            | `IO a` confined, never escapes   |
| [Koka](https://koka-lang.github.io/koka/doc/book.html)             | Algebraic effects   | Effect types + handlers          |
| [Unison](https://www.unison-lang.org/docs/fundamentals/abilities/) | Abilities           | Effect types + handlers          |
| [Cycle.js](https://cycle.js.org/)                                  | Sources/Sinks       | Streams in, streams out          |
| [Redux Saga](https://redux-saga.js.org/)                           | Generator effects   | `yield call()`, `yield put()`    |

### Elm: Model-View-Update

Elm's architecture is the most direct influence on our design:

```elm
update : Msg -> Model -> (Model, Cmd Msg)
view : Model -> Html Msg
```

- **Pure update** returns new model + commands (effect descriptions)
- **Runtime** executes commands, feeds results back as messages
- **No direct I/O** in application code

**How we're similar:** Our render generator yields frames (like `view`) and receives events (like `Msg`). The caller (runtime) handles actual I/O.

**Key insight from Elm:** "The Elm runtime shields our code from the outside world that is riddled with side effects."

### Roc: Platform-Based Purity

[Roc](https://www.roc-lang.org/) takes effect isolation further:

```roc
main : Task {} []
main = Stdout.line "Hello"  # Returns Task, doesn't execute
```

- **Platform** (runtime) defines what effects are available
- **Application code** is 100% pure—returns `Task` descriptions
- **No FFI escape hatch**—all effects go through platform

**How we're similar:** Our `run()` wrapper is like a platform—it decides how to execute effects (write to term, handle bells, etc.).

**Key insight from Roc:** "By itself, Roc cannot interact with the system. It is completely pure and has no side effects."

### Koka & Unison: Algebraic Effects

[Koka](https://koka-lang.github.io/koka/doc/book.html) and [Unison](https://www.unison-lang.org/docs/fundamentals/abilities/) track effects in the type system:

```koka
fun greet() : console ()
  println("Hello")  // console effect tracked in type
```

- **Effect types** declare what effects a function may perform
- **Handlers** provide implementations (can be swapped for testing)
- **Resumable exceptions**—handler can resume or abort

**How we're similar:** Our `RenderEvent` types (`exit`, `bell`, `title`) are like algebraic effects—the generator yields them, the caller handles them.

**Key insight from Koka:** Effects are "resumable exceptions"—yield control, let handler decide, optionally resume.

### Cycle.js: Sources and Sinks

[Cycle.js](https://cycle.js.org/) models apps as stream transformers:

```js
function main(sources) {
  const click$ = sources.DOM.select("button").events("click")
  const vtree$ = click$.map(renderView)
  return { DOM: vtree$ } // sinks
}
```

- **Sources** = input streams (events from external world)
- **Sinks** = output streams (instructions to external world)
- **Drivers** handle actual I/O (DOM, HTTP, etc.)

**How we're similar:** Our async generator consumes an event stream (sources) and yields frames (sinks). The caller (driver) handles I/O.

**Key insight from Cycle.js:** "Your application is just a pure function. All I/O effects are done by the drivers."

### Redux Saga: Generator-Based Effects

[Redux Saga](https://redux-saga.js.org/) is the closest JavaScript analog:

```js
function* fetchUser(action) {
  const user = yield call(api.fetch, action.userId) // describe effect
  yield put({ type: "USER_LOADED", user }) // describe dispatch
}
```

- **Generators** yield effect descriptions
- **Middleware** interprets and executes them
- **Pure reducers** never see side effects

**How we're similar:** Our `renderSync()` generator yields frames and receives input via `gen.next()`—same mechanical pattern.

**Key insight from Redux Saga:** "Contrary to thunks, you don't end up in callback hell, you can test your asynchronous flows easily, and your actions stay pure."

### Haskell IO Monad: The Original

[Haskell's IO monad](https://wiki.haskell.org/All_About_Monads) confines effects:

```haskell
main :: IO ()
main = do
  name <- getLine      -- IO action
  putStrLn ("Hello " ++ name)
```

- **IO monad** is "one-way"—values can enter but not escape
- **Pure code** cannot call IO directly
- **ST monad** allows isolated local mutation

**How we're similar:** Our generator boundary is like the IO boundary—effects can't leak out, only descriptions pass through.

**Key insight from Haskell:** "By separating pure code from impure actions, Haskell allows us to reason about program behavior with clarity."

### Synthesis: Our Design

Our generator-based API embodies these patterns:

| Pattern             | Our Implementation                 |
| ------------------- | ---------------------------------- |
| Pure core           | `renderSync()` has no I/O          |
| Effect descriptions | `RenderEvent` (exit, bell, title)  |
| Runtime executes    | `run()` wrapper handles actual I/O |
| Input via messages  | `gen.next(inputEvent)`             |
| Output via yields   | `yield { frame, event }`           |
| Testable            | Mock inputs, assert on outputs     |

**The key architectural insight:** Generators provide a natural "effect boundary" in JavaScript—`yield` describes what to do, the caller decides how to do it.

### References

- [The Elm Architecture](https://guide.elm-lang.org/architecture/)
- [Roc: Functional](https://www.roc-lang.org/functional)
- [Koka Language](https://koka-lang.github.io/koka/doc/book.html)
- [Unison Abilities](https://www.unison-lang.org/docs/fundamentals/abilities/)
- [Cycle.js](https://cycle.js.org/)
- [Redux Saga](https://redux-saga.js.org/)
- [Haskell IO Monad](https://wiki.haskell.org/All_About_Monads)

---

## Alternatives Considered

### A. Keep Separate APIs (Status Quo)

Keep production and test renderers separate, just improve each.

**Pros:** No breaking changes, clear separation
**Cons:** Two mental models, test-only debugging
**Verdict:** Doesn't solve core pain points

### B. Unified Factory with Mode Switch

```tsx
const renderer = createRenderer({ term }) // production
const renderer = createRenderer({ cols: 80 }) // testing (headless)
```

**Pros:** Single entry point
**Cons:** Optional `term` feels wrong, mode switching complexity
**Verdict:** Awkward API, hidden modes

### C. Term-Centric (term.render())

```tsx
term.render(<App />) // production
mockTerm.render(<App />) // testing
```

**Pros:** Natural ownership
**Cons:** Couples render to Term, mock term complexity
**Verdict:** Wrong abstraction boundary

### D. Generator (Selected)

Pure generator yields frames, receives input. Wrappers for ergonomics.

**Pros:** Pure core, testable, composable, debuggable
**Cons:** Generators less familiar, needs wrappers
**Verdict:** Best separation of concerns

---

## Benefits

| Benefit           | Description                |
| ----------------- | -------------------------- |
| **Purity**        | Render has no I/O          |
| **Testability**   | `gen.next()` deterministic |
| **Control**       | Full event loop control    |
| **Debuggability** | Frame capture everywhere   |
| **Unification**   | Same code, two interfaces  |

---

## Risks & Mitigations

| Risk                    | Mitigation                      |
| ----------------------- | ------------------------------- |
| Breaking change         | Old APIs become wrappers        |
| Generator unfamiliarity | Convenience wrappers hide it    |
| React async batching    | `act()` + `updateContainerSync` |
| Performance             | Diffing still works             |

---

## Implementation Phases

### Phase 1: term.events()

```tsx
interface Term {
  events(): AsyncIterable<InputEvent>
}
```

Add to Silvery as wrapper (avoid ansi churn).

**Done when:** Can iterate term input as structured events.

### Phase 2: renderSync()

New `vendor/silvery/src/render-gen.ts`:

```tsx
export function* renderSync(element, options): Generator<...>
```

**Done when:** One test converted and passing.

### Phase 3: render() async

Async variant consuming event stream.

**Done when:** Works with mock async iterator.

### Phase 4: Convenience Wrappers

- `run(term, element)` — production
- `createTestTerm(options)` — testing

**Done when:** Production app runs with `run()`.

### Phase 5: Migration

- Deprecate old APIs
- Convert all tests

**Done when:** No deprecation warnings, tests pass.

---

## Files

| File                            | Changes                         |
| ------------------------------- | ------------------------------- |
| `silvery/src/render-gen.ts`        | New: `renderSync()`, `render()` |
| `silvery/src/run.ts`               | New: `run()` wrapper            |
| `silvery/src/testing/test-term.ts` | New: `createTestTerm()`         |
| `silvery/src/context.ts`           | Events to queue                 |
| `silvery/src/index.ts`             | Exports                         |

---

## Open Questions

### 1. term.events() location

**Options:**

- A: Add to @silvery/ansi Term
- B: Wrapper in Silvery

**Lean:** B first (less churn), A later if useful elsewhere.

### 2. Resize handling

**Options:**

- A: InputEvent, render re-layouts internally
- B: Caller restarts render with new dimensions

**Lean:** A — simpler for callers.

### 3. React async batching

Sync generator needs deterministic frames.

**Solution:** `act()` wrapper, `updateContainerSync`, immediate flush.

---

## Migration

```tsx
// PRODUCTION
// Before
await render(term, <App />)
// After
await run(term, <App />)

// TESTING
// Before
const render = createRenderer({ cols: 80, rows: 24 })
const { stdin, lastFrameText } = render(<App />)
stdin.write("\x1b[B")
expect(lastFrameText()).toContain("selected")

// After
using term = createTestTerm({ cols: 80, rows: 24 })
term.render(<App />).press("ArrowDown")
expect(term.screenshot()).toContain("selected")
```

---

## See Also

- [inkx-nested-mounting.md](inkx-nested-mounting.md) — Nested mounting API (speculative, lower priority)
- [../archive/ink-patterns-pre-silvery.md](../archive/ink-patterns-pre-silvery.md) — Legacy Ink patterns (pre-silvery migration)
- [../principles.md](../principles.md) — Principle 7: Async Generator Pipelines
