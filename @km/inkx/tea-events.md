---
id: "@km/inkx/tea-events"
aliases:
  - km-inkx.tea-events
  - km-inkx-tea-events
created_by: claude:fd695049
created_at: 2026-03-04T12:47:39Z
closed_at: 2026-03-07T02:12:09Z
close_reason: "Grooming: already implemented —
  withCommands/withKeybindings/withDiagnostics plugin system"
---

# [x] Composable app plugin system: unified event handling, sources, and commands @km/inkx #feature #P2 @claude:fbad9cb1

## Composable App Plugin System

inkx's event handling is split across hardcoded paths with critical asymmetries (keyboard DOM dispatch only in tests, mouse bypasses commands, event routing not customizable). This bead designs and implements a composable plugin system that unifies all event handling.

### Architecture: Sipping TEA

Every plugin has two parts: a **slice** (pure reducer for its model state) and a **plugin function** (event wiring, subscriptions, API surface).

- **All state in the model** — plugin state (focus, terminal, vim mode) lives in the model alongside user state. No closure state. Fully inspectable, serializable, replayable.
- **All changes through update** — slices are pure `(msg, sliceState) → sliceState`. The kernel composes them. No plugin can clobber another.
- **Reactive subscriptions** — plugins react to model changes via `app.subscribe`. I/O reactions (scroll viewport) or dispatch (which goes through update). Subscribers never mutate the model.
- **Automatic cleanup** — `app.subscribe` collects in a `DisposableStack`. `using app = pipe(...)` cleans up everything.
- **Typed dispatch proxy** — `app.dispatch.focus.revalidate()` builds from `EventMap` namespace:action keys.

### Plugin composition

```typescript
using app = pipe(
  createApp(store, { slices: { term, focus, vim } }),
  withReact(<Board />),
  withTerminal(process),      // ALL terminal I/O in one plugin
  withFocus(),
  withDomEvents(),
  withCommands(opts),
)
await app.run()
```

`run()` is sugar over `pipe()` with good defaults. `createApp(store)` is just a typed event loop — everything else is plugins.

### Key design decisions

- SlateJS-style `(app) => app` plugin shape (override methods, capture originals via closure)
- State in model, not closures — enables snapshot/replay/time-travel
- Slices for state transitions, plugins for event wiring and I/O — clean separation
- `withTerminal(process)` wraps all terminal concerns (stdin, stdout, resize, lifecycle, protocols)
- Mouse and keyboard resolve to same named commands
- Three event source mechanisms: static plugins, React components (reactive), effects (one-shot)
- EventMap discriminated unions for type safety across sources and update

### Incremental TEA adoption ("sipping TEA")

useState → shared store → commands → slices → effects as data. Each step is additive. Mix imperative and pure in the same app. Migrate one slice at a time.

### Implementation phases

1. Fix keyboard DOM dispatch asymmetry (processEventBatch)
2. App extension points (update, events, dispatch on App interface) + pipe()
3. Extract built-in plugins from hardcoded logic
4. Mouse command resolution through same registry
5. @km/tui migration to composable plugins