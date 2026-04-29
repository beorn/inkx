---
id: "@km/silvery/terminal-abstraction"
aliases:
  - km-silvery.terminal-abstraction
  - km-silvery-terminal-abstraction
created_by: claude:55df8ef1
created_at: 2026-03-10T06:38:06Z
closed_at: 2026-03-10T08:12:26Z
close_reason: "Phase 1: Extended createTerm() with Provider capabilities
  (getState, subscribe, events). Phase 2: Rewrote run.tsx from 1242→213 lines
  (83% reduction) as thin wrapper over createApp(). Added paste support to
  term-provider.ts. Fixed 4 stale docs referencing removed terminal option. All
  301 silvery feature tests pass."
owner: bjorn@stabell.org
---

# [x] Unified Terminal abstraction: createTerminal() factory + run() unification @km/silvery #task #P2

## What

Extend `createTerm()` / `Term` to be a full Provider-based terminal abstraction. `Term` already has stdin/stdout, dims, caps, I/O, and styling — it just needs the Provider pattern added.

```typescript
const term = createTerm()              // Node.js (existing, extended)
const term = createTerm(xtermInstance)  // xterm.js (new overload)
const term = createTerm({ cols, rows })// headless (new overload)

// Existing capabilities (unchanged)
term.bold.red('hello')                 // styling
term.cols, term.rows                   // dims
term.hasCursor(), term.hasColor()      // caps

// New Provider capabilities
term.getState()        → { cols, rows }
term.subscribe(fn)     → unsubscribe
term.events()          → AsyncIterable<key | mouse | resize>
term.writable          → WritableStream<string>
term[Symbol.dispose]() → cleanup (already exists)

// Simple API
await run(<App />, term)

// Multi-provider API (Level 3)
await createApp(<App />, { providers: { term, sync, db } })
```

## Why

- `renderToXterm()` duplicates logic from `run()` — separate code path with separate bugs
- `run()` (~1100 lines) duplicates ~600 lines from `createApp()` — should be thin wrapper
- Terminal capabilities (mouse, kitty, bracketed paste) scattered across runtime options instead of being Term concerns
- No clean way to add new backends (WebSocket, SSH, etc.)

## Design

### Extend Term (don't replace)
`Term` already IS the terminal abstraction — it has I/O, dims, caps, styling. Just add Provider interface (`getState`, `subscribe`, `events`) and `writable`.

### Composed layering
Raw I/O `{readable, writable}` → Provider parses raw input into typed events (key, mouse, resize) → Term adds styling on top.

### Factory overloads
- `createTerm()` — Node.js stdin/stdout (default-on: mouse, kitty, bracketed paste)
- `createTerm(xterm)` — xterm.js instance
- `createTerm({ cols, rows })` — headless for testing

### run() unification
`run()` becomes thin ~100-line wrapper: `createApp(<App />, { providers: { term } })`. Eliminates ~600 lines of duplication.

## Implementation plan
1. Extend `Term` type with Provider interface + writable
2. Extend `createTerm()` factory with Provider implementation (wraps existing `createTermProvider()` logic)
3. Add xterm.js and headless overloads
4. Rewrite `run()` as thin wrapper over `createApp()`
5. Deprecate `renderToXterm()`
6. Update all examples and docs

## Acceptance criteria
- [ ] `createTerm()` returns a full Provider with events/state/writable
- [ ] `createTerm(xterm)` works for xterm.js
- [ ] `run(<App />, term)` works with both
- [ ] Mouse/kitty/bracketed paste enabled by default
- [ ] `run()` is <200 lines (currently ~1100)
- [ ] `renderToXterm()` deprecated
- [ ] All examples work unchanged
- [ ] Docs updated