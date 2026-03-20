# Rendering & Input

> **Deep-dive** for [00-architecture.md](./00-architecture.md) SS Part 0-1 and Input. Ag rendering, input pipeline, concrete examples. Last synced: 2026-03-19.

_Status: draft (2026-03-19). From zero to a full interactive app — rendering and input in progressive steps._

_See also: [03-commands.md](./03-commands.md) (command shapes, availability), [05-app.md](./05-app.md) (plugin composition), [06-scopes.md](./06-scopes.md) (structured concurrency)._

---

## Level 1: Ag Only (No App Level)

The simplest interactive app. `create()` provides the dispatch/apply pipeline. `withAg()` adds the node tree. `withTerm()` reads terminal input and flushes rendering. `withReact()` bridges React components to the ag node tree. State lives in React `useState` — no signals, no commands, no keymap.

```typescript
// counter.tsx — Level 1: ag only, no app level
import { create, pipe } from "@silvery/create"
import { withScope } from "@silvery/scope"
import { withAg } from "@silvery/ag"
import { withTerm } from "@silvery/ag-term"
import { withReact, useInput } from "@silvery/ag-react"
import { useState } from "react"

function Counter() {
  const [count, setCount] = useState(0)

  // useInput receives unhandled input:key ops (no keymap to intercept them)
  useInput((op) => {
    if (op.key === "j" || op.key === "ArrowDown") setCount((c) => c + 1)
    if (op.key === "k" || op.key === "ArrowUp") setCount((c) => c - 1)
    if (op.key === "q") return false // unhandled — falls through
    return true
  })

  return (
    <Box flexDirection="column">
      <Text>Count: {count}</Text>
      <Text color="$muted">j/k to change, q to quit</Text>
    </Box>
  )
}

const app = pipe(
  create(),
  withScope(),
  withAg(),
  withTerm(),
  withReact({ view: <Counter /> }),
)
await app.run()
```

**What happens at runtime:**

1. `withTerm()` sets `app.run` — creates a terminal, starts the for-await input loop.
2. `withReact()` wraps `app.run` — starts the React reconciler, renders `<Counter />` into the ag node tree.
3. `app.run()` enters the loop: `for await (const key of terminal.keys(scope.signal))`.
4. Each keypress becomes `app.dispatch({ type: "input:key", ...key })`.
5. No keymap exists (no `withApp()`), so `input:key` ops fall through to `useInput()` hooks registered by `withReact()`.
6. `useInput` handler mutates React state. React re-renders. Ag flushes to terminal.

This is the minimal interactive path:

```
terminal.keys() --> dispatch({ type: "input:key" }) --> apply chain --> withReact fans out to useInput() --> React setState --> re-render --> flush --> stdout
```

No commands, no keymap, no signals. Pure React + ag rendering + terminal input.

---

## How Input Flows

Input is dispatched as ops. Sources produce `input:key` and `input:mouse` ops. At Level 1, unmatched input reaches `useInput()` directly. At Level 2 (with app level), the keymap plugin intercepts keys and resolves them to command ops before they reach components.

```
terminal.keys() --> dispatch({ type: "input:key", ... })
                      |
                  +-- apply chain ---------------------------------+
                  |  withApp/keymap: match binding --> when()         |
                  |    --> queueMicrotask(dispatch(command op))      |
                  |  withReact: fan out to useInput() hooks         |
                  +------------------------------------------------+
```

No pub/sub, no event registration, no handler disposal. The for-await loop IS the lifecycle. `dispatch()` IS the entry point.

### Op Types

Input events are ops -- augmented via declaration merging on `OpTypes` (see [00-architecture.md](./00-architecture.md) SS Op Types):

```typescript
// Defined by @silvery/ag-term:
declare module "@silvery/create" {
  interface OpTypes {
    "input:key": { key: string; shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }
    "input:mouse": {
      kind: "click" | "doubleClick" | "rightClick"
      x: number
      y: number
      button?: string
      modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }
    }
  }
}
```

Minimal, flat, framework-agnostic. No event classes, no `preventDefault()`. Key strings carry the raw event value (`"a"`, `"Enter"`, `"Escape"`, `"ArrowDown"`). The keymap's `matches()` function handles normalization to the lowercase patterns used in bindings.

### Async Iterable Sources

Sources are async iterables. `withTerm()` owns the loop -- it reads from `terminal.keys()` and dispatches ops:

```typescript
function withTerm(options?: TermOptions) {
  return (app) => {
    app.run = async () => {
      await using terminal = createTerminal(options)
      app.flush = () => runPipeline(app.root, terminal)
      app.flush()
      for await (const key of terminal.keys(app.scope?.signal)) {
        app.dispatch({ type: "input:key", ...key })
      }
    }
    return app
  }
}
```

No registration, no cleanup -- break or cancel stops it. The loop IS the scope: when it ends, no dangling listeners. The async iterable terminates when the scope's `AbortSignal` fires. See [06-scopes.md](./06-scopes.md) for structured concurrency details.

Async iterables compose naturally:

```typescript
// Merge two sources
for await (const e of merge(terminal.keys(signal), timerSource(1000))) {
  app.dispatch({ type: e.type ?? "input:key", ...e })
}

// Filter a source
for await (const e of filter(terminal.keys(signal), (e) => !e.ctrl)) {
  app.dispatch({ type: "input:key", ...e })
}
```

### The Adapter: withReact

`withReact()` bridges React to the ag node tree and handles unmatched input. It wraps `apply()` to fan out `input:*` ops to `useInput()` hooks registered by components:

```typescript
function withReact({ view }: { view: ReactElement }) {
  return (app) => {
    const inputHandlers = new Set<(op: Op) => boolean>()

    // useInput hook registers here -- exposed to React components via context
    app.onInput = (handler: (op: Op) => boolean) => {
      inputHandlers.add(handler)
      return () => { inputHandlers.delete(handler) }  // returns unsubscribe
    }

    const prevApply = app.apply
    app.apply = (op) => {
      if (prevApply(op)) return true
      if (op.type.startsWith("input:")) {
        for (const h of inputHandlers) if (h(op)) return true
      }
      return false
    }
    const prevRun = app.run
    app.run = async () => {
      await using reconciler = createReconciler(app.root, () => app.flush?.())
      reconciler.render(view)  // injects app into React context
      await prevRun?.()
    }
    return app
  }
}
```

Note the order: `prevApply(op)` is called first. If the keymap (installed by `withApp()`) handles the op, `useInput()` hooks never see it. Only unmatched input falls through to components.

---

## Deep-Dive: Chord Engine

Multi-key sequences (`dd`, `gg`, `ciw`) require a chord engine with trie lookup, timeout, and ambiguity resolution. The chord state is keymap-local -- a signal inside the `compileKeymap()` closure.

### Trie Structure

`compileKeymap()` builds a trie from registered bindings. Each node represents a key prefix; leaf nodes hold the resolved command:

```
Root
+-- d
|   +-- d --> commands.remove          ("dd")
+-- g
|   +-- g --> commands.goToTop         ("gg")
+-- j --> commands.down                ("j")
+-- k --> commands.up                  ("k")
+-- c
    +-- i
        +-- w --> commands.changeWord  ("ciw")
```

Single-key bindings (`j`, `k`) resolve immediately. Multi-key bindings (`dd`, `gg`, `ciw`) are prefixes -- when a key lands on a non-leaf trie node, the engine enters chord state and waits for more input.

### Timeout and Ambiguity

When a keypress matches both a single-key binding AND a chord prefix (e.g., `d` bound to `delete` and `dd` bound to `deleteLine`), the engine must handle ambiguity:

1. **Enter pending state**: Store the current trie position in the keymap-local `chord` signal.
2. **Start timeout** (~300ms configurable): If no follow-up key arrives before timeout, resolve the single-key binding.
3. **Follow-up key arrives**:
   - Matches a child node --> continue down the trie (extend chord).
   - Reaches a leaf --> resolve the command, clear chord state.
   - No match --> resolve the pending single-key binding for the prefix, then reprocess the follow-up key.

```typescript
// Inside compileKeymap():
const chord = signal<TrieNode | null>(null)
const chordTimer = signal<Timer | null>(null)

function handleKey(op: Op): boolean {
  const current = chord() ?? root

  const next = current.children.get(op.key)
  if (!next) {
    // No match in current position -- if we were in a chord, resolve the prefix
    if (chord()) {
      resolvePending(current)
      chord(null)
      clearTimeout(chordTimer())
      // Reprocess this key from root
      return handleKey(op)
    }
    return false // unhandled
  }

  if (next.binding && !next.children.size) {
    // Leaf node -- resolve immediately
    chord(null)
    clearTimeout(chordTimer())
    dispatchBinding(next.binding)
    return true
  }

  if (next.binding && next.children.size) {
    // Ambiguous -- both a complete binding and a prefix
    chord(next)
    chordTimer(
      setTimeout(() => {
        // Timeout -- resolve the complete binding
        chord(null)
        dispatchBinding(next.binding!)
      }, 300),
    )
    return true
  }

  // Non-leaf, non-binding -- pure prefix, wait for more
  chord(next)
  return true
}
```

### Count Prefix

Vim-style count prefixes (`3j` = move down 3 times) are handled as a parallel state machine:

```typescript
const count = signal<number | null>(null)

// Digits accumulate into count (but "0" at start is a command, not count)
if (/^[0-9]$/.test(op.key)) {
  if (op.key === "0" && count() === null) {
    // "0" is a command (go to line start), not a count prefix
  } else {
    count((count() ?? 0) * 10 + parseInt(op.key))
    return true
  }
}

// When a binding resolves, pass count as repeat:
function dispatchBinding(binding: RegisteredBinding) {
  const repeat = count() ?? 1
  count(null)
  for (let i = 0; i < repeat; i++) {
    const meta = commandMeta.get(binding.command)
    if (meta) {
      queueMicrotask(() => app.dispatch({ type: "command", path: meta.path, args: binding.args }))
    }
  }
}
```

Count and chord compose: `3dd` = delete 3 lines. The count is consumed when the chord completes.

---

## Deep-Dive: Key Normalization and Event Vocabulary

Key strings in `input:key` ops carry the raw terminal event. The keymap's `matches()` function normalizes for comparison with binding patterns:

| Raw event     | Binding pattern | Notes                                 |
| ------------- | --------------- | ------------------------------------- |
| `"a"`         | `a`             | Lowercase letter                      |
| `"A"`         | `A`             | Uppercase (Shift implied)             |
| `"Enter"`     | `Enter`         | Special keys capitalized              |
| `"Escape"`    | `Escape`        | Special keys capitalized              |
| `"ArrowDown"` | `ArrowDown`     | Arrow keys                            |
| ctrl+c        | `ctrl+c`        | Modifier prefix, `+` separator        |
| ctrl+shift+k  | `ctrl+shift+k`  | Multiple modifiers, canonical order   |
| ctrl+w then v | `ctrl+w v`      | Chord: space-separated key sequence   |

Modifier flags (`shift`, `ctrl`, `meta`, `alt`) are booleans on the op. The binding pattern encodes them as prefixes. The keymap normalizes both sides for comparison.

---

## Signal Scopes

All state is signals, scoped by visibility:

| Scope            | Example                   | Lifetime                |
| ---------------- | ------------------------- | ----------------------- |
| **Universal**    | `items`, `cursor`, `mode` | App lifetime            |
| **Keymap-local** | `chord`, `count`          | Keymap instance         |
| **Derived**      | `isNormal`, `isInsert`    | Computed from universal |

No special "scope" concept -- just closures and the same `signal()` primitive at different lexical scopes. Signals use the function-call pattern: `mode()` to read, `mode("normal")` to write.

```typescript
// Universal -- lives on the model
const mode = signal<"normal" | "insert">("normal")

// Derived -- computed from universal
const isNormal = computed(() => mode() === "normal")
const isInsert = computed(() => mode() === "insert")
```

---

## Level 2: With App Level (Signals, Commands, Keymap)

Adding `withApp()` and a domain plugin. State moves from React `useState` to signals. Input moves from `useInput()` to declarative keymaps. The view becomes a pure renderer -- no input handling.

```typescript
// todo.tsx -- Level 2: with app level, domain plugin, declarative keymap
import { signal, computed } from "@silvery/signal"
import { useSignal } from "@silvery/signal/react"
import { create, pipe } from "@silvery/create"
import { withScope } from "@silvery/scope"
import { withApp, when } from "silvertea"
import { withAg } from "@silvery/ag"
import { withTerm } from "@silvery/ag-term"
import { withReact } from "@silvery/ag-react"

// -- Signals --
const items = signal(["Buy milk", "Write docs", "Ship feature"])
const cursor = signal(0)
const mode = signal<"normal" | "insert">("normal")
const isNormal = computed(() => mode() === "normal")

// -- View --
// Pure rendering. No input handling. Reads signals via useSignal().
function ListView() {
  const list = useSignal(items)
  const cur = useSignal(cursor)
  return (
    <Box flexDirection="column">
      {list.map((item, i) => (
        <Text key={i} color={i === cur ? "$primary" : undefined}>
          {i === cur ? "> " : "  "}{item}
        </Text>
      ))}
    </Box>
  )
}

// -- Domain plugin --
// Co-locates model, commands, keybindings. Closure access, no `this`.
function withTodo() {
  return (app) => {
    app.commands.navigation = {
      down: { title: "Down", fn() { cursor(Math.min(cursor() + 1, items().length - 1)) } },
      up:   { title: "Up",   fn() { cursor(Math.max(cursor() - 1, 0)) } },
    }
    app.commands.edit = {
      toggle_done: {
        title: "Toggle Done",
        fn() {
          const i = cursor()
          items(items().map((t, j) =>
            j === i ? (t.startsWith("[x] ") ? t.slice(4) : `[x] ${t}`) : t
          ))
        },
      },
      remove: {
        title: "Remove",
        fn() {
          items(items().filter((_, i) => i !== cursor()))
          cursor(Math.min(cursor(), items().length - 1))
        },
      },
    }
    app.commands.app = {
      quit: { title: "Quit", fn() { app.quit?.() } },
    }

    // Register command refs --> paths (enables dispatch by path)
    for (const [ns, cmds] of Object.entries(app.commands)) {
      for (const [name, cmd] of Object.entries(cmds)) {
        app.registerCommand?.([ns, name], cmd)
      }
    }

    // Keymap -- declarative: key --> command ref. when() gates by mode.
    app.keymap?.({
      "ctrl+c": app.commands.app.quit,
      q: app.commands.app.quit,
      ...when(isNormal, {
        j: app.commands.navigation.down,
        k: app.commands.navigation.up,
        x: app.commands.edit.toggle_done,
        dd: app.commands.edit.remove,     // chord
      }),
    })

    return app
  }
}

// -- Run --
const app = pipe(
  create(),
  withScope(),
  withAg(),
  withApp(),
  withTodo(),
  withTerm(),
  withReact({ view: <ListView /> }),
)
await app.run()
```

**What this adds over Level 1:**

- **Signals as state** -- `signal()` to create, `cursor()` to read, `cursor(5)` to write (function-call pattern, not `.value`)
- **`computed()`** for derived values -- `isNormal` recomputes when `mode()` changes
- **Commands** as `{ title, fn }` objects -- registered on `app.commands.*`
- **`app.keymap()`** for declarative key --> command binding
- **`when()`** returns conditional binding descriptors -- evaluated at input time, not registration time
- **View reads signals via `useSignal()`** -- no other hooks, no `onKeyDown`, no `useInput()`
- **Chord binding** (`dd`) -- resolved by the trie in `compileKeymap()`
- **Domain plugin** co-locates models + commands + keybindings
- **`app.keymap?.()`** -- conditional call enables headless use (no keymap without `withApp()`)

### `when()` -- Descriptor-Based

`when()` returns per-binding descriptors carrying a live signal accessor. Object spread produces descriptors, not eagerly computed values:

```typescript
type Binding = CommandRef | { command: CommandRef; args?: unknown; prompt?: string }
type ConditionalBinding = { when: () => boolean; binding: Binding }

function when<B extends Record<string, Binding>>(
  condition: () => boolean, // signal accessor -- function-call pattern, not .value
  bindings: B,
): Record<keyof B, ConditionalBinding> {
  const result = {} as any
  for (const [key, binding] of Object.entries(bindings)) {
    result[key] = { when: condition, binding }
  }
  return result
}
```

`app.keymap()` inspects each value -- if it has a `when` property, the binding is conditional. The signal accessor is called at input time -- not at registration time.

Two separate concerns: **can the command run?** (args schema -- `resolveInvocation()` returns `"unavailable"` if signal defaults are nullish) vs **should this key trigger it?** (`when()` predicates, mode-specific). A command like `remove` is always available; the key `dd` only triggers it in normal mode. Commands don't know about modes -- that's the keymap's job.

### `app.keymap()` Registration

`app.keymap()` handles three binding shapes:

1. **Direct command ref**: `{ j: app.commands.todo.move_down }`
2. **Command with args/prompt**: `{ Enter: { command: app.commands.todo.add, prompt: "text" } }`
3. **Conditional (from `when()`)**: `{ Escape: { when: condition, binding: ... } }`

### Input Precedence

All declarative via `when()` and keymap layer ordering:

1. Last-registered bindings checked first (domain plugins register after `withApp()`)
2. `when()` conditions evaluated dynamically at input time -- signal accessors called per keypress
3. Unmatched input falls through to `useInput()` hooks (registered via `app.onInput` in `withReact()`)

No imperative push/pop. Focus is a signal condition -- `when(focusModel.hasFocus, { ... })`.

### Command Availability

Availability is derived from the args schema via `resolveInvocation()`. Signal defaults serve triple duty:

1. **Schema** -- what params the command accepts
2. **Default resolver** -- interactive surfaces read signal values automatically
3. **Availability predicate** -- if a signal default is nullish, resolution returns `"unavailable"`

| Surface           | ready            | prompt                  | unavailable               | invalid                  | unknown                 |
| ----------------- | ---------------- | ----------------------- | ------------------------- | ------------------------ | ----------------------- |
| **keymap**        | dispatch command | dispatch prompt op      | swallow                   | swallow                  | swallow                 |
| **app.command()** | resolve result   | reject `PromptRequired` | reject `Unavailable`      | reject `ValidationError` | reject `UnknownCommand` |
| **raw dispatch**  | execute          | `op.status="prompt"`    | `op.status="unavailable"` | `op.status="invalid"`    | `op.status="unknown"`   |
| **CLI/MCP**       | execute          | report missing args     | report unavailable        | report error             | report not found        |

---

## Full Event Dispatch Pipeline

The complete pipeline from source to effect, through dispatch/apply:

```
terminal.keys(scope.signal)       <-- async iterable, terminates on scope cancel
  |
  v
for await (key)
  |
  +-- app.dispatch({ type: "input:key", ...key })
       |
       +-- withScope: install lazy op.scope getter
       |
       +-- apply chain:
       |    |
       |    +-- withApp/keymap:
       |    |    match key against trie
       |    |    check when() conditions (signal accessors)
       |    |    check resolveInvocation() state
       |    |    --> queueMicrotask(dispatch({ type: "command", ... }))
       |    |    return true (handled)
       |    |
       |    +-- withReact (fallthrough):
       |         fan out to useInput() hooks
       |         return true if any handler consumed it
       |
       +-- signal mutation --> React re-render --> flush --> stdout
```

All steps happen through the dispatch/apply pipeline -- no event bus, no middleware chain. Different input types dispatch different op types (`input:key` vs `input:mouse`), but all flow through the same pipeline.

## Layered Architecture

| Layer  | What             | Examples                                                     | Package           |
| ------ | ---------------- | ------------------------------------------------------------ | ----------------- |
| **L0** | Primitives       | `signal()`, `computed()`, functions                          | `@silvery/signal` |
| **L1** | Foundation       | `create()`, `dispatch()`, `apply()`, `OpTypes`               | `@silvery/create` |
| **L2** | App architecture | `withApp()`, `app.keymap()`, `when()`, `resolveInvocation()` | `silvertea`       |
| **L2** | Rendering        | `withAg()`, `withReact()`, `withTerm()`                      | `@silvery/ag-*`   |
| **L3** | Domain plugins   | `withTodo()`, `withEditor()`, `withDocument()`               | App-specific      |

Keymaps are not a separate library -- they are part of `withApp()`. Domain plugins register bindings via `app.keymap()`. The dispatch/apply pipeline is the architecture.

---

_See also: [00-architecture.md](./00-architecture.md) (dispatch/apply pipeline, full pipe example), [03-commands.md](./03-commands.md) (command tree, auto-derived surfaces), [05-app.md](./05-app.md) (plugin composition), [06-scopes.md](./06-scopes.md) (effects, scoping, concurrency)._
