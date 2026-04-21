# pipe() + with*() Feature Plugin Composition — Prototype on aichat

**Status**: research spike. No production code changes.
**Date**: 2026-04-21
**Context**: Tests the user's layering hypothesis against pro's dual-model review (K2.6's definePlugin-style + GPT's provider-style rebuttal). The question this spike answers is narrow and concrete: **can `pipe()` + `with*()` + `createSlice` express a real app's feature plugins as cleanly as the `definePlugin({...})` factory did in help-overlay.v2, while keeping the layered architecture the user wants?**

Companion files:

- `aichat-composed.tsx` — aichat refactored into feature plugins via `pipe()` composition.
- `help-overlay.v3.ts` — help overlay re-expressed in the same shape (v1 → v2 → v3 lineage).

The reader has read pro's review (`/tmp/llm-8b5b9e1c-review-both-proposals-pick-uy27.txt`). This doc **engages with** the points made there; it doesn't re-litigate them.

---

## 0. TL;DR

- aichat expressed as `pipe(createBaseApp, withApp, withScript, withStream, withMount, withCompact, withSubmit, withKeys, withAutoExit, withReact(<AIChat/>))` — see `aichat-composed.tsx`: **~375 code LOC / 487 LOC total** of feature plugins + composition + view stub vs **640 LOC** in current `state.ts + index.tsx`. Net saving ~40%, but the real win is that each plugin is a **~40–80 LOC pure slice with one responsibility**, not one 250-line `switch` in `createDemoUpdate`.
- The layered `with*()` approach **is** clearer than a mesh: every plugin is a function `(app) => app & { mySlice }`, and the stack shape at the `pipe()` call site is the architecture diagram.
- Ordering errors **are** catchable by TS, but only cheaply when plugins advertise `<Req, Add>` via `extends`-bound inputs (the "HasX" constraint pattern). Pure width-typed pipe inference catches "plugin B needs what plugin A added" by default; it doesn't catch subtler "must run outermost" constraints without an explicit bound. This tradeoff is honest, not ideal.
- HelpOverlay: v1=296 LOC (3 files) → v2=33 LOC (definePlugin, single file) → **v3=56 code LOC / 85 total with comments** (pipe/with*/createSlice + hook, single file). v3 is ~23 code LOC over v2 but gains composability: it can contribute effects and participate in cross-plugin dispatch without a parallel registry, and adds 4 discoverable `withApp.keymap()` commands v2 couldn't register.
- **One concrete refactor km should do**: migrate `with-help-overlay.ts` (the current Phase 0 mini-cutover) to the v3 shape before committing to `withDialogs()`. It's the cheapest way to prove the pattern carries weight in the real km pipe stack, and it settles the pro debate with evidence rather than taste.

---

## 1. aichat's architecture today

Before designing anything, I read state.ts (387 LOC) and index.tsx (253 LOC) the way the user would. What I found:

### Logical feature plugins (pre-existing in the code, just not separated)

| Feature                | Where it lives today                                                 | State it owns                                                                     |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Mount / init**       | `update → case "mount"`                                              | `pulse` interval, initial script dispatch                                         |
| **Script walk-through**| `doAdvance`, `case "advance"` / `"autoAdvance"`                      | `scriptIdx`, `exchanges`                                                          |
| **Streaming animation**| `startStreaming`, `case "endThinking"` / `"streamTick"` / `"endTools"`| `streamPhase`, `revealFraction`, `pulse`                                         |
| **Auto-typing**        | `case "typingTick"` / `"autoTypingDone"`                             | `autoTyping`                                                                      |
| **Compaction**         | `useAutoCompact`, `case "compact"` / `"compactDone"`                 | `compacting`, `contextBaseline`                                                   |
| **User submit**        | `case "submit"`                                                      | appends to `exchanges`                                                            |
| **Off-script reply**   | `case "respondRandom"`                                               | `offScript`, appends to `exchanges`                                               |
| **Key bindings**       | `useKeyBindings` hook                                                | `ctrlDPending`, `lastCtrlDRef`                                                    |
| **Auto-exit**          | `useAutoExit` hook                                                   | `done`                                                                            |
| **Footer UI + timer**  | `DemoFooter`                                                         | `inputText`, `elapsed`, `randomIdx`, auto-submit timer                            |

**10 features, one monolithic reducer.** The reducer has **30+ `case` arms across all features**; a change to "compaction" brushes against "script walk-through" because they share `doAdvance`. This is the mesh/star the user is describing: features talk to each other by reaching into one another's state via shared helper functions (`doAdvance`, `autoAdvanceEffects`), not through a typed event interface.

### How state lives

- **One giant `DemoState`** (14 fields) and one `DemoMsg` union (17 variants) inside `createDemoUpdate`.
- Consumed via `useTea(INIT_STATE, update)` — `useTea` is silvery's TEA hook.
- Three **separate** React hooks (`useAutoCompact`, `useAutoExit`, `useKeyBindings`) observe the state and dispatch back — each one re-creates its own effect closure on every state change.
- DemoFooter has **local** React state (`inputText`, `elapsed`, `randomIdx`) that the reducer doesn't see, bridged through an imperative `footerControlRef`.

### Key event routing

- `useInput` at the parent (`useKeyBindings`) catches Escape, Tab, Ctrl+D, Ctrl+L.
- `TextInput` inside `DemoFooter` handles text + Enter (via `onSubmit` prop).
- **Two different routing stories coexisting.** The parent hook owns global keys; TextInput owns text keys. When Tab collides (both parent wants to submit, TextInput could intercept), an imperative ref bridges them.

### Dependencies (react hook graph)

```
useTea(INIT_STATE, update)
  ↓ state, send
useEffect(mount)
useAutoCompact(state, send)     — re-runs on every exchanges/done/compacting/baseline change
useAutoExit(autoStart, done, exit)
useKeyBindings(state, send, footerControlRef)
                                ↑
                         footerControlRef (imperative)
                                ↑
DemoFooter({ controlRef, onSubmit, ...stateProjections })
  DemoFooter has its own useState, useEffect, useRef for inputText/elapsed/randomIdx/autoSubmit
```

This is exactly the mesh the user is complaining about — six ambient subscribers + one monolithic reducer + one imperative ref bridge.

---

## 2. Target shape: pipe() + with*() + createSlice

### The principle

Every feature plugin is:

```ts
type AppPlugin<Req, Add> = (app: Req) => Req & Add
```

Where:

- `Req` is what the plugin **requires** upstream in the pipe (e.g. `BaseApp & { script: ScriptSlice }`).
- `Add` is what the plugin **contributes** (e.g. `{ stream: StreamSlice }`).

Each plugin:

1. Owns its slice of state via `createSlice(init, handlers)`.
2. Wraps `app.apply` to handle its own op types.
3. Can emit `{ type: "dispatch", op }` effects to trigger other plugins' ops.
4. Can emit custom effects (e.g. `{ type: "timer", ... }`) that a runner interprets.
5. Is a plain function — unit-testable without React, without the store, without the runtime.

There is no factory registry. There is no `name: "help"` namespace string. There is no per-plugin zustand store. The architecture diagram IS the `pipe()` call.

### Worked example — `withStream`

```ts
import { createSlice } from "@silvery/create"
import type { AppPlugin } from "@silvery/create"
import type { BaseApp } from "@silvery/create/runtime/base-app"
import type { ScriptSlice } from "./with-script.ts"
import { fx } from "silvery"

// --- Slice: state + handlers ---
export interface StreamState {
  phase: "idle" | "thinking" | "streaming" | "tools" | "done"
  revealFraction: number
  pulse: boolean
}

const streamSlice = createSlice(
  (): StreamState => ({ phase: "idle", revealFraction: 0, pulse: false }),
  {
    startStreaming: (s, { hasThinking }: { hasThinking: boolean }): StreamState =>
      hasThinking
        ? { ...s, phase: "thinking", revealFraction: 0 }
        : { ...s, phase: "streaming", revealFraction: 0 },
    endThinking: (s): StreamState => ({ ...s, phase: "streaming", revealFraction: 0 }),
    streamTick: (s, { rate }: { rate: number }): StreamState => {
      const frac = Math.min(s.revealFraction + rate, 1)
      return { ...s, revealFraction: frac }
    },
    streamDone: (s): StreamState => ({ ...s, phase: "done", revealFraction: 1 }),
    togglePulse: (s): StreamState => ({ ...s, pulse: !s.pulse }),
  },
)

// --- Contribution types ---
export type StreamOp = typeof streamSlice.Op
export interface StreamContribution {
  stream: StreamState
  streamOps: typeof streamSlice
}

// --- Plugin function ---
// Req: BaseApp with a ScriptSlice upstream. That's how TS catches ordering.
export function withStream(opts: { fast: boolean }): AppPlugin<
  BaseApp & ScriptSlice,
  StreamContribution
> {
  return (app) => {
    let state = streamSlice.create().state
    const prev = app.apply

    app.apply = (op) => {
      // Handle our own ops
      if (op.type.startsWith("stream.")) {
        const method = op.type.slice("stream.".length) as keyof typeof streamSlice
        state = (streamSlice as any)[method](state, op)

        // Emit timing effects based on the new state (this is the rich bit
        // that definePlugin's {ops: (s) => newState} shape can't do cleanly).
        if (op.type === "stream.startStreaming" && !opts.fast) {
          const hasThinking = (op as any).hasThinking
          if (hasThinking) return [fx.delay(1200, { type: "stream.endThinking" })]
          return [fx.interval(50, { type: "stream.streamTick", rate: 0.12 }, "reveal")]
        }
        if (op.type === "stream.streamTick" && state.revealFraction >= 1) {
          // Reached full reveal — cascade to done, maybe via tools.
          return [fx.cancel("reveal"), { type: "dispatch", op: { type: "stream.streamDone" } }]
        }
        return []
      }
      return prev(op)
    }

    // Expose state + ops for React consumption + downstream plugins.
    return Object.assign(app, {
      stream: state, // mutable ref read by React via custom hook below
      streamOps: streamSlice,
    }) as typeof app & StreamContribution
  }
}
```

**Cross-plugin dispatch** — when streaming completes and the script has more entries, `withStream` emits `{ type: "dispatch", op: { type: "script.advance" } }`. The base app's drain loop re-enters the apply chain, `withScript` matches, advances the script, and may itself emit another `stream.startStreaming`. This is the effect lane doing exactly the cross-cutting job `doAdvance` does today — without shared helpers.

**Unit-testable without React**:

```ts
const app = pipe(createBaseApp(), withScript({...}), withStream({ fast: false }))
app.dispatch({ type: "stream.startStreaming", hasThinking: false })
expect(app.stream.phase).toBe("streaming")
expect(app.drainEffects()).toEqual([/* the interval timer effect */])
```

No `render()`, no `useTea`, no reconciler. Just the chain.

### React binding

A small hook reads the plugin state:

```ts
export function useAppSlice<A, K extends keyof A>(app: A, key: K): A[K] {
  // Same pattern as zustand — subscribe via useSyncExternalStore.
  // In practice, each plugin exposes a subscribe() method similar to withInputChain.
}
```

This is **one hook**, not one-per-plugin. Selectors are the React-memo story.

---

## 3. Ordering constraints: what the type system catches

**Pure `AppPlugin<A, B> = (app: A) => B`** catches the "obvious" case:

```ts
// withStream requires ScriptSlice. If you forget withScript, TS errors:
pipe(
  createBaseApp(),
  withStream({ fast: false }), // ❌ Type 'BaseApp' is missing properties 'script', 'scriptOps'
)
```

This is what already works in silvery today — `withFocusChain` requires `{ dispatchKey }`, so pipes that forget it error at the call site.

### What it doesn't catch cheaply

- **"Must be outermost" / "must run before X in the apply chain"** — because `apply` is captured once at install time, the pipe type doesn't know "`withInput` must be upstream of `withFocus` so focus runs first." pro flagged this in his review and he's right.
- **Branded ordering**: can be encoded via marker types (e.g. `AppAfterFocus` has brand `"focus-installed"` and `withInput` takes `A extends AppAfterFocus`) — but this is precisely the "implicit-dependencies-via-signature" criticism K2.6 raised.

### Ergonomic verdict

- **Width-typed inference** (`Req`/`Add`) — catches 80% of ordering bugs for free, with zero per-plugin boilerplate. It just works because each plugin's input type describes what it needs.
- **Marker branding** — needed for the remaining 20% (invariants like "focus runs outermost"), but it's **opt-in per concern**, not blanket. Most apps don't need it; the silvery pipe stack does because of the apply-chain order semantics.
- **Pro's "ordering is unsound by default"** — correct, but overstated. The pipe types already catch "needs what you didn't add". The outer-vs-inner invariants are a separate axis, solved by marker types only where they matter.

**Net**: for feature plugins in aichat, pure `<Req, Add>` is ergonomic enough. For the runtime chain (`withInputChain`, `withFocusChain`), marker branding or explicit `installAfter: "focus"` metadata would be worth it. That's a future silvery-level concern, not an aichat-level one.

---

## 4. LOC + ergonomics comparison

Measured from `aichat-composed.tsx` and the feature-plugin stubs referenced from it.

### aichat refactored (pipe/with*/createSlice)

Measured against `aichat-composed.tsx` (375 code LOC / 487 total with comments):

| Plugin / section     | Code LOC | Slice state fields | Op types |
|----------------------|----------|--------------------|----------|
| `withScript`         | 45       | 4                  | 4        |
| `withStream`         | 65       | 3                  | 6        |
| `withMount`          | 15       | 0 (uses others)    | 1        |
| `withCompact`        | 30       | 2                  | 2        |
| `withSubmit`         | 20       | 1 (exchanges)      | 1        |
| `withKeys`           | 30       | 1 (ctrlDPending)   | 0 (via commands) |
| `withAutoExit`       | 10       | 0                  | 1 (effect-only) |
| `buildAIChatApp`     | 30       | — (composition)    | — |
| `useAppSlice` + view stub | 55  | — (React bridge)   | — |
| Shared types + helpers | 75     | `asSubscribable` utility | — |
| **Total**            | **~375** | — | — |

**Note** — `withAutoTyping` (the `autoTyping` state) and `withIdleSubmit` (the 10-second idle auto-submit) aren't broken out in the sketch; each would add ~25 LOC if fully ported. Adding both brings the total to ~425 code LOC.

Current aichat: `state.ts` 387 LOC + `index.tsx` 253 LOC = **640 LOC** of state+composition (components.tsx unchanged at 503 LOC).

**State+composition LOC: 640 → ~425 including the two missing plugins ≈ -34%.**

The savings come from:

- **`useAutoCompact`, `useAutoExit`, `useKeyBindings`** as hooks → become **pure effect plugins** returning `[{ type: "dispatch", op }]`. No closure deps, no re-render loops.
- **`DemoFooter`'s imperative `footerControlRef`** → becomes a dispatch to `withSubmit`'s ops. No ref.
- **Shared helpers like `doAdvance`, `autoAdvanceEffects`** → vanish. Each plugin emits effects; the drain loop re-dispatches.

### definePlugin comparison

definePlugin (v2) hit ~33 LOC for help overlay but **couldn't express**:
- Custom effects (intervals, delays). definePlugin's `ops: (s) => newState` is pure state. No effect lane.
- Cross-plugin dispatch. No way to say "endTools should kick off autoAdvance on withScript".
- Ordering invariants via type constraints.

For aichat's 10 features, definePlugin would need each plugin to emit `{nextState, effects}` — which is just `createSlice` + apply-chain. At that point the factory is re-inventing `with*()` with extra indirection.

### Ergonomics honest appraisal

**Wins of pipe/with*/createSlice**:
- Types accumulate naturally across the pipe — `const app = pipe(...)`, `app.stream.phase`, `app.script.scriptIdx` all inferred.
- Each plugin is a plain function — trivial to test, trivial to mock.
- Effects are first-class, not squeezed into a pure reducer.
- No global registries. Order is explicit at the call site.

**Costs honestly documented**:
- Per-plugin boilerplate is higher than definePlugin: a `createSlice` + an `apply` wrapper + a contribution type. ~15 LOC of ceremony vs definePlugin's ~5.
- Ordering invariants beyond "needs X upstream" require marker-typing, which is harder to teach.
- React binding still needs a hook, and each plugin needs an external-store shape for `useSyncExternalStore` — same as v2, unavoidable for React integration.

---

## 5. HelpOverlay v3

See `help-overlay.v3.ts`. Final size: **56 code LOC / 85 LOC total including comments and the file header** (slice + plugin + keymap registrations + hook).

Comparison:

| Version | Code LOC | Composability | Effects | Cross-plugin dispatch | Command palette |
|---------|----------|---------------|---------|------------------------|-----------------|
| v1 (reducer + store + singleton + bridge + hook, 3 files) | 296 | low — singleton, lives outside pipe | none | none | no |
| v2 (definePlugin, single file) | 33 | medium — declarative but factory-owned | impossible | impossible | no |
| **v3 (pipe/with*/createSlice)** | **56** | **high — just a `with*()` in the pipe** | native | native | **yes (4 commands registered)** |

**Why v3 is +23 code LOC over v2** — because v3 is not a factory. It carries:
- an explicit `createSlice` init (6 LOC) — vs definePlugin's inferred-from-ops shape (0 LOC of ceremony, but you lose the init-factory separation that createSlice uses for testing).
- an explicit `apply` wrapper + subscription store (12 LOC) — vs definePlugin's `ops: {...}` map (6 LOC, machine-generated wiring).
- 4 `withApp.keymap()` command registrations (5 LOC) — v2's `keys: {...}` map doesn't register them as discoverable commands.
- a `useHelpOverlay` hook that reads via useSyncExternalStore (3 LOC).

**What +23 LOC buys you** — help can now emit effects (e.g. "showing help should dim the underlying board" = a `{ type: "dispatch", op: { type: "board.dim" }}` effect), gate keys on global state via natural access to `app.dialogs` upstream in the pipe, and expose its commands to the palette automatically through `withApp`. None of this is possible in v2 without growing the definePlugin schema into what pipe already is.

If you strip the 4 keymap registrations (the thing v2 can't do and v1 did manually elsewhere), v3 comes in at **~51 code LOC**, still +18 over v2 but with composability and effects that scale to non-trivial plugins.

---

## 6. Orthogonal concerns — handled without a factory

### Effects / commands / cross-plugin messaging

The base-app drain loop (see `base-app.ts:110`) **already** handles `{ type: "dispatch", op }` as a re-entry effect. Any plugin can emit that effect; the runner re-enters the apply chain. No registry.

For **commands** (named, discoverable, introspectable, like keybinding palette): `withApp()` (see `with-app.ts:74`) already installs `app.commands` and `app.keymap()`. Any plugin can register its commands inside its install function:

```ts
export function withHelpOverlay(): AppPlugin<BaseApp & AppWithApp, { help: HelpState }> {
  return (app) => {
    // ... install slice + apply wrapper ...
    app.keymap({
      "?": { title: "Toggle help", fn: () => app.dispatch({ type: "help.toggle" }) },
      Escape: { title: "Close help", fn: () => app.dispatch({ type: "help.hide" }) },
    })
    return app as any
  }
}
```

Discoverable command tree + plugin-owned state — without a factory.

### Key binding priority + focus-aware resolution

Multiple plugins want `Escape`. Resolution = the pipe apply order.

- `withFocusChain` runs outermost (see `with-input-chain.ts:91`). If a focused component is a dialog that owns Escape, focus consumes the key before any fallback sees it.
- `withHelpOverlay` registers its Escape via `withApp.keymap()` — runs in the **fallback** chain after focus rejects it.
- Modal plugins like `withDialogs` can install themselves **outside** `withFocusChain` so their Escape takes priority (or use scope hints).

**Priority = install order** in the pipe. That's already the model; no factory needed.

### Focus / modal stack

silvery already has `focusScope` (from `@silvery/ag-react/focusScope`). A modal plugin wraps children in a focus scope; focus keys resolve within the active scope. No changes needed.

### React subscription optimization without per-plugin zustand

The v2 definePlugin used a per-plugin external store + `useSyncExternalStore`. v3 uses the same mechanism, but **decoupled**: each plugin exposes `subscribe(listener)` + `getState()` (same shape as `withInputChain`'s `InputStore`). A small `useAppSlice(app, "help")` hook calls `useSyncExternalStore(app.helpSubscribe, () => app.help)`.

**Selector memoization** works as normal React `useMemo` over the subscribed state. For per-plugin fine-grained updates (only rerender when `help.scrollOffset` changes, not when `help.visible` changes), the plugin can expose `subscribeKey("scrollOffset", listener)` — trivial, ~5 LOC extra per plugin, opt-in.

No global store. No zustand per plugin. React consumers read exactly the slice they subscribe to.

---

## 7. Engaging with pro's review

pro argued for the provider-style `with*()` approach based on:
1. Composition > registry.
2. Types accumulate through `pipe()`.
3. Ordering can be enforced with `<Req, Add>`.
4. No global state.

**The spike confirms 1, 2, 4 and partially confirms 3** (ordering invariants beyond "needs X upstream" require marker types, but that's a per-concern opt-in not a blanket requirement).

K2.6 argued for definePlugin based on:
1. Radical ergonomics — inference + type-safe API with minimal ceremony.
2. Catches names at compile time.
3. A declarative shape is easier for AI to generate.

**The spike confirms 1 for the trivial case (help overlay, ~33 LOC), breaks for anything non-trivial** (aichat's streaming has effects, cross-plugin dispatch, cascading timers — none fit the `ops: (s) => newState` mold without reinventing `apply`). K2.6's bet pays off for the 20% of plugins that are truly pure state machines; the other 80% need the effect lane pipe already ships.

**Where they agree**: both want plugin-owned state, typed dispatch, and AI-scriptability. The pipe/with*/createSlice approach gets all three without a factory.

**Where pro is right and I initially disagreed**: the factory was a premature abstraction. The primitive already exists (`pipe` + `AppPlugin` + `createSlice`); we just haven't used it for feature plugins yet.

---

## 8. Concrete recommendation for km

**One refactor, high-confidence**:

Replace `apps/km-tui/src/plugins/with-help-overlay.ts` (213 LOC, singleton-based) with a `withHelpOverlay(): AppPlugin<BaseApp & AppWithApp, { help: HelpSlice }>` in the v3 shape. Wire it into the km pipe the same way `withInputChain` is wired today.

**Why this one**:
- Smallest real plugin in km with a complete state machine.
- Parity tests already exist (v1 vs v2); add v3 variant to the same test matrix.
- Validates the pattern against the actual km runtime (not aichat-scale).
- If it works, `withDialogs()` (Phase 1 of the tea migration) can follow the same shape — that's 5 more dialogs = ~500 LOC reduction at similar compression ratios.
- If it fails, the spike is contained; v1 still ships.

**Do not** refactor aichat itself — it's an example, not a regression surface. Keep it as the design reference for "what the target looks like" so the pattern is discoverable.

**Do not** generalize `definePlugin` further. The spike shows it optimizes for the simple case at the cost of the general case. The general case wins when summed over all plugins.

### Open question for the user

Should marker-typed ordering (e.g. `AppAfterFocus` brands) be added to silvery's `with*()` plugins now, or deferred until a second plugin actually needs an out-of-order dependency? My instinct says defer — YAGNI until the second consumer, per CLAUDE.md's "research-first for foundational features" rule. The first consumer gets width-typed `<Req, Add>`; when the second arrives and needs the marker, extract at that point.
