# @silvery/headless

Pure state machines for UI components -- no React, no rendering, no side effects.

Each machine is a pure `(state, action) -> state` function that you can use anywhere: terminal, browser, tests, or server.

Part of the [Silvery](https://silvery.dev) ecosystem.

## Install

```bash
npm install @silvery/headless
```

## Quick Start

```ts
import { createSelectListState, selectListUpdate } from "@silvery/headless"

let state = createSelectListState({ count: 10 })
state = selectListUpdate(state, { type: "move_down" })
console.log(state.index) // 1
```

## API

### State Machines

- **`createMachine(update, initialState)`** -- Observable state container wrapping any update function
- **`selectListUpdate(state, action)`** -- Cursor navigation over a list (move up/down, jump to start/end)
- **`createSelectListState(opts)`** -- Initial state for a select list
- **`readlineUpdate(state, action)`** -- Text editing with cursor, kill ring, and history
- **`createReadlineState(opts)`** -- Initial state for a readline editor
- **`historyUpdate(state, action)`** -- Browser-style navigation history with amend-on-departure
- **`createHistoryState(initial)`** -- Initial single-entry history

### React Hooks

- **`useSelectList(opts)`** -- React hook wrapping `selectListUpdate` as component state
- **`useReadline(opts)`** -- React hook wrapping `readlineUpdate` as component state

### Types

`Machine`, `UpdateFn`, `SelectListState`, `SelectListAction`, `ReadlineState`, `ReadlineAction`

## Naming Conventions

Machine files are flat with no suffix:

- `readline.ts` (not `readline-machine.ts`)
- `select-list.ts` (not `select-list-machine.ts`)

Each file exports:

- `{name}Update(state, action)` — pure update function
- `create{Name}State(opts)` — state factory
- `{Name}State`, `{Name}Action` — types

The `createMachine()` container is for consumers who need observability (subscribe, send). The update function itself is framework-agnostic.

## Writing a New Machine

1. Create a file named after the concept (e.g., `clipboard.ts`)
2. Define `State` and `Action` types (immutable, serializable)
3. Write a pure `update(state, action) -> state` function
4. Export a `createState(opts)` factory
5. Add to `index.ts` barrel export
6. Optionally add a React hook in `react.ts`

See the [Headless Machines guide](https://silvery.dev/guide/headless-machines) for full examples.

## License

MIT
