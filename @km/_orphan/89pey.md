---
id: "@km/_orphan/89pey"
aliases:
  - km-89pey
created_by: claude:53ab8041
created_at: 2026-02-28T08:31:57Z
closed_at: 2026-03-03T12:29:11Z
---

# [x] zustand-tea: Elm-style effects middleware for Zustand @km/_orphan #feature #P1 @claude:53ab8041

Standalone Zustand middleware that brings Elm Architecture (TEA) effects-as-data to any Zustand app. The only new code in a four-level state management progression (Component → Shared → Actions → Pure) — everything else is React and Zustand.

## What it is

A ~30-line Zustand middleware (tea()) that extends reducers to optionally return effects as data:
- Level 3 (Actions): reducer returns state → dispatch pattern (replaces zustand/middleware/redux)
- Level 4 (Pure): reducer returns [state, effects] → effects-as-data, testable, replayable, serializable

One middleware handles both. Upgrade is per-case within a reducer, not per-app.

## Core API

```tsx
// The middleware
const useStore = create(tea(reducer, effectRunners?))

// Level 3: return state (no effects)
function reducer(state, action) {
  case 'increment': return { ...state, count: state.count + 1 }
}

// Level 4: return [state, effects] when needed
function reducer(state, action) {
  case 'increment': return { ...state, count: state.count + 1 }      // no effects
  case 'save': return [{ ...state, saving: true }, [httpPost('/api', state)]]  // with effects
}

// Mixed function + data effects (gradual migration)
case 'quick': return [state, [
  httpPost('/api', state),                          // data effect (testable)
  async (dispatch) => { await fetch(...) }          // function effect (escape hatch)
]]
```

## Package contents

1. tea() — Zustand middleware (~30 lines). Array.isArray detects state vs [state, effects].
2. collect() — test helper (~8 lines). Normalizes reducer output for assertions.
3. TypeScript types — ReducerResult<S, E>, EffectRunner<E>, EffectCreator, etc.
4. README — the real product. Four-level progression, migration guides, comparisons.

## Effect creators (parallel to action creators)

```tsx
// Action creators: what happened (flow IN)
const increment = () => ({ type: 'increment' })
const loaded = (data) => ({ type: 'loaded', data })

// Effect creators: what should happen (flow OUT)
const httpPost = (url, body, onSuccess?, onError?) => ({ type: 'http', method: 'POST', url, body, onSuccess, onError })
const delay = (ms, then) => ({ type: 'delay', ms, then })
const log = (msg) => ({ type: 'log', msg })
```

Elm-style Cmd Msg parameterization: effects carry their completion action (onSuccess/onError), making the full round-trip testable as data.

## Effect runners (the interpreter)

```tsx
const effectRunners = {
  http: async (effect, dispatch) => {
    const res = await fetch(effect.url, { method: effect.method, body: effect.body })
    if (effect.onSuccess) dispatch(effect.onSuccess(await res.json()))
  },
  delay: (effect, dispatch) => setTimeout(() => dispatch(effect.then), effect.ms),
  log: (effect) => console.log(effect.msg),
}
```

Runners are swappable: production runners (real I/O), test runners (collect/assert), replay runners (playback).

## Testing

```tsx
// collect() normalizes reducer output
const [state, effects] = collect(reducer(initial, save()))
expect(state.saving).toBe(true)
expect(effects).toContainEqual(httpPost('/api/save', initial))

// Full round-trip testable (Cmd Msg style)
expect(effects).toContainEqual(httpPost('/api', initial, { onSuccess: saved, onError: saveError }))
```

## Connection to inkx

zustand-tea is framework-agnostic but inkx provides the terminal integration:

1. **createApp wiring** — event handlers dispatch to the tea store instead of imperative set()
2. **Terminal effect runners** — inkx ships runners for stdout, kitty keyboard, mouse, cursor
3. **createStore coexistence** — inkx's existing TEA store (inkx/store) serves non-React/headless use cases
4. **Noun-singletons** — domain .apply() functions return the same [state, effects] tuple shape

Architecture:
- zustand-tea: middleware pattern (pure, generic, any Zustand app)
- inkx: terminal integration + terminal effect runners + createApp wiring
- km: domain reducers + domain effect runners + command system

## Connection to km's TEA vision

See docs/design/tea-state-machines.md. The noun-singleton pattern (PlainText.apply, Board.apply, Tree.apply) returns [state, effects] tuples. zustand-tea's middleware calls these and forwards effects:

```tsx
function reducer(state, action) {
  case 'insert_text': {
    const [text, effects] = PlainText.apply(state.text, action)
    return [{ ...state, text }, effects]
  }
}
```

## Precedents

- redux-loop: 'port of Elm Architecture to Redux' — same pattern, Redux-specific
- Hyperapp v2: uses exact same optional tuple return (Array.isArray), stable since 2019
- Andy Matuschak: 'Pure State Machines with Effects' (Swift) — names it 'Command Pattern in functional style'
- Elm Cmd Msg: effects parameterized by completion action type

## Why standalone package

- Framework-agnostic: works with React DOM, React Native, inkx, any Zustand app
- Discoverable: people searching 'zustand effects' or 'zustand elm' find it
- Forces clean API: can't accidentally couple to inkx internals
- The README IS the product — the code is almost incidental
- Validates the pattern independently of inkx/km

## Scope of work

1. Prototype tea() middleware + collect() helper + types
2. Write README with four-level progression narrative
3. Integration: wire into inkx's createApp (EventHandlerContext gains dispatch)
4. Integration: km's command system dispatches through tea store
5. Docs: update inkx docs (state management guide, per-level landing pages)
6. Docs: update km docs/design/tea-state-machines.md with zustand-tea connection
7. Publish to npm

## Design decisions (see @km/_orphan/m88v3 for full exploration)

- Tuples over generators (no benefit, simpler types, better composition)
- Optional tuple (Hyperapp pattern) over mandatory tuple (Elm pattern) — eliminates 'none tax'
- Mixed function/data effects — gradual migration like TypeScript's any
- Plain objects as effects — sweet spot for JS/TS (algebraic effects need language support)
- Array.isArray detection — safe because Zustand state is always an object