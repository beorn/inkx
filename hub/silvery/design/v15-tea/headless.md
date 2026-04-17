# Headless State Machines

> **Deep-dive** for [era2-overview.md](../../reference/era2-overview.md) § Era 2b Phase 1. Package: `@silvery/headless`. Pure `(state, action) → state` machines for interactive components.

_Status: draft (2026-03-24). See also: [signals.md](./signals.md) (signals integration), [commands.md](./commands.md) (command tree), [app-composition.md](../v10-terminal/app-composition.md) (app composition)._

---

## What and Why

Interactive components (SelectList, TextInput, ListView, Toggle, Tabs, CommandPalette) currently embed state management inside React hooks. This couples state logic to React and makes it untestable, unreplayable, and non-portable.

`@silvery/headless` extracts the pure state machine from each component:

```
Before:  SelectList.tsx = state logic + React hooks + rendering
After:   @silvery/headless    = state logic (pure functions)
         SelectList.tsx       = thin React wrapper over headless machine
```

Every machine is `update(state, action) → state`. No React. No rendering. No side effects. Depends only on `@silvery/create`.

### Design Goals

1. **One function per machine** — `selectListUpdate(state, action) → state`
2. **States are plain objects** — serializable, snapshotable, diffable
3. **Actions are discriminated unions** — `{ type: "move_down" }`, typed per-machine
4. **No effects in return** — kill ring, callbacks, and I/O are the caller's responsibility
5. **Framework-agnostic** — works with React useState, signals, zustand, or bare loops
6. **Minimal state** — only independent variables. Derived values are computed externally

### What This Enables

- **Test without React**: `update(state, { type: "move_down" })` → assert on state
- **Replay**: record action stream → replay → deterministic state
- **AI automation**: agents dispatch typed actions, inspect typed state
- **Portability**: same machine drives terminal, browser, and headless consumers
- **Undo**: state is a value — push to history stack, pop to undo

---

## The Primitive

Each machine exports three things:

```typescript
// 1. State type — plain object, serializable
interface SelectListState {
  index: number
  count: number
}

// 2. Action union — discriminated by `type`
type SelectListAction =
  | { type: "move_down" }
  | { type: "move_up" }
  | { type: "move_to"; index: number }
  | { type: "move_first" }
  | { type: "move_last" }

// 3. Update function — pure, total, deterministic
function selectListUpdate(state: SelectListState, action: SelectListAction): SelectListState
```

The update function is **total** — every action returns a valid state. No `null`, no exceptions, no "not handled" returns. If an action is a no-op (move_down at the last item), the function returns the same state object (identity — enables `===` short-circuit in renderers).

### Factory for Initial State

Each machine also exports a factory for initial state:

```typescript
function createSelectListState(opts: { count: number; index?: number }): SelectListState
```

Factories validate invariants (index in range, count >= 0) and provide defaults.

### Convenience: `createMachine()`

For callers who want a dispatch-style API instead of manual update calls:

```typescript
import { createMachine } from "@silvery/headless"

const list = createMachine(selectListUpdate, createSelectListState({ count: 10 }))
list.state // { index: 0, count: 10 }
list.send({ type: "move_down" })
list.state // { index: 1, count: 10 }
list.subscribe((state) => {
  /* re-render */
})
```

`createMachine` is a thin wrapper (~15 lines): holds current state, calls update on send, notifies subscribers. No signals dependency — just a minimal observable container. Lives in `@silvery/headless`, not `@silvery/create`.

---

## Machines

### SelectListState

Cursor navigation over a list of items. Supports disabled items, wrapping, and controlled item count.

```typescript
interface SelectListState {
  /** Currently highlighted index (0-based) */
  index: number
  /** Total item count (items themselves are external) */
  count: number
}

type SelectListAction =
  | { type: "move_down" }
  | { type: "move_up" }
  | { type: "move_to"; index: number }
  | { type: "move_first" }
  | { type: "move_last" }
  | { type: "page_down"; pageSize: number }
  | { type: "page_up"; pageSize: number }
  | { type: "set_count"; count: number }

function selectListUpdate(state: SelectListState, action: SelectListAction): SelectListState
function createSelectListState(opts: { count: number; index?: number }): SelectListState
```

**Disabled items**: The current SelectList supports `disabled` items and skips them during navigation. The headless machine handles this by accepting an optional `isDisabled` callback in actions that need it:

```typescript
| { type: "move_down"; isDisabled?: (index: number) => boolean }
| { type: "move_up"; isDisabled?: (index: number) => boolean }
```

The update function calls `isDisabled` to skip indices. If all items are disabled, it returns the unchanged state.

**No wrap-around**: `move_down` at last index returns identity. The current SelectList wraps — but that's a policy decision. Wrapping can be added as a separate `selectListWrapUpdate` or via a config flag if needed.

**Items are external**: The machine tracks `index` and `count`, not the items themselves. The caller maps `state.index` to their item array. This avoids generics on the state type and keeps serialization trivial.

---

### ReadlineState

Text editing with kill ring support. Covers cursor movement, character editing, word operations, kill/yank, and transpose — the full readline keybinding set.

```typescript
interface ReadlineState {
  /** Current text value */
  value: string
  /** Cursor position (0 = before first char, length = after last) */
  cursor: number
  /** Kill ring — shared across instances via external injection */
  killRing: readonly string[]
  /** Yank cycling state — null when no yank in progress */
  yankState: YankState | null
}

interface YankState {
  lastYankIndex: number
  yankStart: number
  yankEnd: number
}

type ReadlineAction =
  // Cursor movement
  | { type: "move_left" }
  | { type: "move_right" }
  | { type: "move_word_left" }
  | { type: "move_word_right" }
  | { type: "move_start" }
  | { type: "move_end" }
  // Character editing
  | { type: "insert"; text: string }
  | { type: "delete_back" }
  | { type: "delete_forward" }
  | { type: "transpose" }
  // Kill operations (modify killRing in returned state)
  | { type: "kill_word_back" }
  | { type: "kill_word_forward" }
  | { type: "kill_to_start" }
  | { type: "kill_to_end" }
  // Yank operations
  | { type: "yank" }
  | { type: "yank_cycle" }
  // Bulk
  | { type: "set_value"; value: string; cursor?: number }
  | { type: "clear" }

function readlineUpdate(state: ReadlineState, action: ReadlineAction): ReadlineState
function createReadlineState(opts?: { value?: string; cursor?: number }): ReadlineState
```

**Kill ring strategy**: The current implementation uses a global mutable array (`const killRing: string[] = []`). In the headless machine, the kill ring is **part of the state**. Kill operations return a new state with the updated `killRing`. This makes the machine pure — no global mutation.

To share a kill ring across multiple ReadlineState instances (as the current global does), the caller extracts `killRing` from one machine's state and injects it into another:

```typescript
// Sharing kill ring between two inputs
const state1 = readlineUpdate(state1, { type: "kill_word_back" })
// state1.killRing now has the killed text

// Before processing state2's action, sync the kill ring
const state2WithSharedRing = { ...state2, killRing: state1.killRing }
const state2Next = readlineUpdate(state2WithSharedRing, { type: "yank" })
```

Or more commonly, a `ReadlineContext` holds the shared kill ring and syncs it:

```typescript
function createReadlineContext(): ReadlineContext {
  let killRing: readonly string[] = []
  return {
    update(state: ReadlineState, action: ReadlineAction): ReadlineState {
      const next = readlineUpdate({ ...state, killRing }, action)
      killRing = next.killRing // sync shared ring
      return next
    },
  }
}
```

This preserves the shared-kill-ring behavior while keeping the machine itself pure.

**Ctrl+A/E/K/U**: The current codebase handles these differently in TextInput (line-level) vs TextArea (visual-line-level). The headless ReadlineState handles single-line operations (`move_start`/`move_end`/`kill_to_start`/`kill_to_end`). Multi-line variants (TextArea's visual-line-aware versions) are a separate `TextAreaState` machine that composes with ReadlineState.

---

### ListNavigatorState

Virtual list cursor navigation with scroll tracking. Drives ListView's keyboard navigation.

```typescript
interface ListNavigatorState {
  /** Cursor position in the full item list */
  cursorIndex: number
  /** Total item count */
  count: number
  /** Viewport height in items (for page up/down) */
  viewportHeight: number
}

type ListNavigatorAction =
  | { type: "move_down" }
  | { type: "move_up" }
  | { type: "move_first" }
  | { type: "move_last" }
  | { type: "page_down" }
  | { type: "page_up" }
  | { type: "move_to"; index: number }
  | { type: "set_count"; count: number }
  | { type: "set_viewport_height"; height: number }

function listNavigatorUpdate(state: ListNavigatorState, action: ListNavigatorAction): ListNavigatorState
function createListNavigatorState(opts: { count: number; viewportHeight?: number }): ListNavigatorState
```

**Why separate from SelectListState?** SelectList is for short lists (all items rendered). ListNavigator adds viewport awareness for virtual lists — page up/down depends on viewport height. The state machines are structurally similar but serve different use cases. A future abstraction might unify them if warranted.

**Scroll offset is derived**: The caller computes scroll offset from `cursorIndex` and viewport height. The machine only tracks the cursor — scroll positioning is a rendering concern.

---

### ToggleState

Boolean state with flip action.

```typescript
interface ToggleState {
  value: boolean
}

type ToggleAction = { type: "toggle" } | { type: "set"; value: boolean }

function toggleUpdate(state: ToggleState, action: ToggleAction): ToggleState
function createToggleState(opts?: { value?: boolean }): ToggleState
```

Intentionally minimal. `toggle` flips; `set` overwrites. Identity return on no-op set.

---

### TabGroupState

Tab switching with wrap-around navigation.

```typescript
interface TabGroupState {
  /** Currently active tab ID */
  activeId: string
  /** Ordered tab IDs */
  tabIds: readonly string[]
}

type TabGroupAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "select"; id: string }
  | { type: "set_tabs"; tabIds: readonly string[] }

function tabGroupUpdate(state: TabGroupState, action: TabGroupAction): TabGroupState
function createTabGroupState(opts: { tabIds: readonly string[]; activeId?: string }): TabGroupState
```

**Wrap-around**: `next` at last tab wraps to first. `prev` at first wraps to last. This matches the current Tabs component behavior.

**Dynamic tabs**: `set_tabs` updates the tab list. If the active tab was removed, falls back to the first tab. If the list is empty, `activeId` becomes `""`.

---

### CommandPaletteState

Composition of text query + filtered list navigation.

```typescript
interface CommandPaletteState {
  /** Current search query */
  query: string
  /** Highlighted result index */
  selectedIndex: number
  /** Number of results (computed externally from query + commands) */
  resultCount: number
}

type CommandPaletteAction =
  | { type: "set_query"; query: string }
  | { type: "append_char"; char: string }
  | { type: "delete_char" }
  | { type: "move_down" }
  | { type: "move_up" }
  | { type: "set_result_count"; count: number }
  | { type: "reset" }

function commandPaletteUpdate(state: CommandPaletteState, action: CommandPaletteAction): CommandPaletteState
function createCommandPaletteState(): CommandPaletteState
```

**Filtering is external**: The machine tracks query and selectedIndex. The caller filters the command list (`fuzzyMatch(commands, state.query)`) and passes the result count via `set_result_count`. This keeps the machine pure and avoids baking in a specific fuzzy matching algorithm.

**Index reset on query change**: `set_query`, `append_char`, and `delete_char` reset `selectedIndex` to 0. The current CommandPalette does this too.

---

## Key-to-Action Mapping

Headless machines don't know about keys. A separate layer maps key events to actions:

```typescript
import { type Key } from "@silvery/ag/keys"

/** Map a key event to a SelectList action, or null if unmapped */
function selectListKeyMap(key: Key, input: string): SelectListAction | null {
  if (key.downArrow || input === "j") return { type: "move_down" }
  if (key.upArrow || input === "k") return { type: "move_up" }
  if (key.ctrl && input === "a") return { type: "move_first" }
  if (key.ctrl && input === "e") return { type: "move_last" }
  return null
}
```

Each machine provides a default key map alongside its update function. These live in `@silvery/headless/keys` — a subpath that depends on `@silvery/ag/keys` for the Key type. The core machine functions have zero dependencies on key types.

React components use these key maps in their `useInput` handlers:

```typescript
useInput((input, key) => {
  const action = selectListKeyMap(key, input)
  if (action) dispatch(action)
})
```

---

## React Integration

React wrappers are thin — they connect the headless machine to React's rendering cycle:

```typescript
// In @silvery/ag-react/ui/components/SelectList.tsx (post-migration)
import { selectListUpdate, createSelectListState, selectListKeyMap } from "@silvery/headless"

function SelectList({ items, highlightedIndex, onHighlight, onSelect, ...props }) {
  const [state, dispatch] = useReducer(selectListUpdate, { index: highlightedIndex ?? 0, count: items.length })

  // Sync controlled prop
  useEffect(() => {
    if (highlightedIndex !== undefined && highlightedIndex !== state.index) {
      dispatch({ type: "move_to", index: highlightedIndex })
    }
  }, [highlightedIndex])

  // Sync count
  useEffect(() => {
    if (items.length !== state.count) {
      dispatch({ type: "set_count", count: items.length })
    }
  }, [items.length])

  // Key handling via headless key map
  useInput((input, key) => {
    if (key.return) {
      onSelect?.(items[state.index], state.index)
      return
    }
    const action = selectListKeyMap(key, input)
    if (action) {
      dispatch(action)
      onHighlight?.(state.index) // notify parent
    }
  })

  // ... render items[state.index] with highlight
}
```

**`useReducer` is the natural fit** — React's built-in reducer hook matches the `(state, action) → state` signature exactly. No wrapper library needed.

### Signals Integration

For signal-based apps (era2b), machines integrate via signal + computed:

```typescript
import { signal, computed } from "@silvery/signals"
import { selectListUpdate, createSelectListState } from "@silvery/headless"

const listState = signal(createSelectListState({ count: items().length }))

function dispatch(action: SelectListAction) {
  listState(selectListUpdate(listState(), action))
}

// Derived values
const currentItem = computed(() => items()[listState().index])
```

---

## Testing

Headless machines are trivially testable — no React, no rendering, no framework:

```typescript
import { selectListUpdate, createSelectListState } from "@silvery/headless"

test("move_down increments index", () => {
  const s0 = createSelectListState({ count: 5 })
  const s1 = selectListUpdate(s0, { type: "move_down" })
  expect(s1.index).toBe(1)
})

test("move_down at end returns identity", () => {
  const s0 = createSelectListState({ count: 5, index: 4 })
  const s1 = selectListUpdate(s0, { type: "move_down" })
  expect(s1).toBe(s0) // identity — enables === short-circuit
})

test("readline kill and yank round-trip", () => {
  let s = createReadlineState({ value: "hello world", cursor: 11 })
  s = readlineUpdate(s, { type: "kill_word_back" })
  expect(s.value).toBe("hello ")
  expect(s.killRing[0]).toBe("world")

  s = readlineUpdate(s, { type: "yank" })
  expect(s.value).toBe("hello world")
})
```

### Property-based testing

State machines are ideal for property tests:

```typescript
test.prop("index always in [0, count)", (fc) => {
  const actions = fc.array(
    fc.oneof(
      fc.constant({ type: "move_down" }),
      fc.constant({ type: "move_up" }),
      fc.constant({ type: "move_first" }),
      fc.constant({ type: "move_last" }),
    ),
  )
  const count = fc.integer({ min: 1, max: 100 })
  return (count, actions) => {
    let state = createSelectListState({ count })
    for (const action of actions) state = selectListUpdate(state, action)
    expect(state.index).toBeGreaterThanOrEqual(0)
    expect(state.index).toBeLessThan(count)
  }
})
```

---

## Package Structure

```
packages/headless/
  src/
    index.ts                   # Barrel: all machines + createMachine
    select-list.ts             # SelectListState + update + factory
    readline.ts                # ReadlineState + update + factory + context
    list-navigator.ts          # ListNavigatorState + update + factory
    toggle.ts                  # ToggleState + update + factory
    tab-group.ts               # TabGroupState + update + factory
    command-palette.ts         # CommandPaletteState + update + factory
    machine.ts                 # createMachine() helper
    keys/
      index.ts                 # All key maps (subpath: @silvery/headless/keys)
      select-list.ts           # selectListKeyMap
      readline.ts              # readlineKeyMap
      list-navigator.ts        # listNavigatorKeyMap
      toggle.ts                # toggleKeyMap
      tab-group.ts             # tabGroupKeyMap
      command-palette.ts       # commandPaletteKeyMap
  package.json
  tsconfig.json
```

**Dependencies**: `@silvery/create` only (for types, not runtime). The `keys/` subpath adds a peer dependency on `@silvery/ag` for the Key type.

**Size estimate**: ~400-500 lines total for all machines. The current readline-ops.ts is 251 lines — the headless version will be similar (same logic, different state shape).

---

## Migration Strategy

Migration happens in era2b Phase 1 (bead `km-silvery.era2b-1-headless`) and Phase 4 (`km-silvery.era2b-4-ui`):

**Phase 1**: Extract machines. Create `@silvery/headless` package. Implement all six machines with tests. No consumer changes yet.

**Phase 4**: Refactor React components. Each component switches from internal `useState`/`useRef` to `useReducer` + headless update. The component's external API (props) stays the same — this is an internal refactor, not a breaking change.

**Kill ring migration**: Replace the global mutable `killRing` array with `ReadlineContext`. React components that share a kill ring (TextInput + TextArea in the same app) receive the same context via React context or prop.

**One component at a time**: Start with SelectList (simplest), then Toggle, Tabs, CommandPalette, ListNavigator, and finally ReadlineState (most complex). Each migration is a self-contained PR.

---

## Open Questions

- **TextAreaState**: Multi-line editing adds visual-line-aware cursor movement (up/down across wrapped lines, Ctrl+A/E to visual line start/end). Should this be a separate machine that composes with ReadlineState, or an extension of it? The current code handles this in TextArea's `useInput` with calls to `cursorToRowCol`/`rowColToCursor` from text-cursor.ts.

- **ScrollState**: Should virtual scroll offset tracking (for ListView's non-navigable mode) be a headless machine? Currently it's just `scrollTo` prop + internal offset. Might be too simple to warrant a machine.

- **Identity vs equality**: Should update functions guarantee identity return (`===`) for no-op actions? This is valuable for React (skip re-render) and signals (skip notification). The design says yes — but it requires careful implementation (can't spread and return a new object on no-ops).

- **Action metadata**: Should actions carry metadata for debugging/logging? E.g., `{ type: "move_down", _source: "keyboard" }`. Or is this the caller's concern?

---

_See also: [era2-overview.md](../../reference/era2-overview.md) (era2 architecture), [signals.md](./signals.md) (signals integration), [commands.md](./commands.md) (commands), [app-composition.md](../v10-terminal/app-composition.md) (app composition, domain plugins)._
