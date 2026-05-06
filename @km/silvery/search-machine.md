---
mentions:
  - km
id: "@km/silvery/search-machine"
aliases:
  - km-silvery.search-machine
  - km-silvery-search-machine
created_by: Bjørn Stabell
created_at: 2026-04-02T21:38:47Z
closed_at: 2026-04-02T23:34:14Z
close_reason: Implemented. ListView auto-registers as Searchable. SearchProvider
  dispatch+deferred effects. 18 tests.
owner: bjorn@stabell.org
---

# [x] createSearchMachine<M> — generic TEA search building block @km/silvery #feature #P1

Pure TEA state machine for search, generic over match type M.

## Interface

```typescript
interface Searchable<M> {
  search(query: string): M[]
  reveal(match: M): void
}

interface SearchState<M> {
  active: boolean
  query: string
  cursorPosition: number
  matches: M[]
  currentMatch: number
}

type SearchAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "input"; char: string }
  | { type: "backspace" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "cursorLeft" }
  | { type: "cursorRight" }

type SearchEffect<M> =
  | { type: "search"; query: string }
  | { type: "reveal"; match: M }

function searchUpdate<M>(action, state): [SearchState<M>, SearchEffect<M>[]]
function createSearchMachine<M>(): SearchMachine<M>
```

## TEA Properties

- State is serializable (replay, undo, snapshot)
- Actions are serializable (logging, recording)
- Effects are resolved by the registered Searchable
- Pure update function — no side effects
- Testable headlessly without React or terminal

## Era2 Integration

As a domain plugin:

```typescript
function withSearch<M>(config?: { commands?: string }) {
  return (app) => {
    const machine = createSearchMachine<M>()
    app.models[config?.commands ?? "search"] = machine
    app.commands[config?.commands ?? "search"] = {
      open: { title: "Find", fn() { machine.update({ type: "open" }) } },
      close: { title: "Close", fn() { machine.update({ type: "close" }) } },
      next: { title: "Next Match", fn() { machine.update({ type: "next" }) } },
      prev: { title: "Previous Match", fn() { machine.update({ type: "prev" }) } },
    }
    app.keymap?.(...)
    return app
  }
}
```

## Already exists (partial)

`@silvery/ag-term/search-overlay` has `searchUpdate()` — already a pure state machine. This bead extracts it into a proper generic building block with signal-based state and era2 command integration.

