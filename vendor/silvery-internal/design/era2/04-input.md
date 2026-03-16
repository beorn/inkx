# Input System

_Status: finalized (v1, 2026-03-13). How input events reach commands._

_See also: [03-commands.md](./03-commands.md) (command shapes, availability), [05-app.md](./05-app.md) (plugin composition, surfaces), [state-api-redesign.md](../reference/state-api-redesign.md) (signals, models)._

## The Core Idea

Input is a pipeline: **Source -> Mapping -> Invocation -> Invoke**. Sources produce events as async iterables. Mappings resolve events to commands. Invoke resolves args and calls the function.

No pub/sub, no event registration, no handler disposal. The for-await loop IS the lifecycle.

```
Source (async iterable)
  -> for await (event)
    -> mapping(event)
      -> Invocation | null
        -> invoke({ command, args })
```

## `Mapping<E>`

A mapping is a pure function: event in, invocation out. If it returns null, the event is unhandled. This is the universal interface between sources and commands.

```typescript
type Mapping<E> = (event: E) => Invocation | null
```

The type is generic, but in practice keymaps use `Mapping<string>` — surface adapters normalize platform events to key strings before the keymap sees them. Sources and mappings are fully decoupled — any source (keyboard, mouse, network, timer) can feed any mapping.

## `Invocation`

The output of a mapping: a command to invoke, plus optional event-derived argument overrides.

```typescript
type Invocation = {
  command: Command
  args?: Record<string, unknown> // event-derived overrides
}
```

The `args` field carries values extracted from the event — a click's coordinates, a drag's delta, a CLI's parsed flags. These override signal defaults during arg resolution.

## `invoke()`

Single dispatch point. Merges event-provided overrides with signal defaults via the schema's `.parse()`. Commands can verify internally — return false or throw for failure. Commands may be async (e.g., network, file I/O), so callers should await the result.

```typescript
function invoke({ command, args }: Invocation): unknown {
  if (command.args) {
    const resolved = command.args.parse(args ?? {}) // overrides + signal defaults
    return command.fn(resolved) // may return a promise for async commands
  }
  return command.fn()
}
```

This is the same `invoke()` that CLI, MCP, tests, and AI agents use (see [03-commands.md](./03-commands.md)). The input system doesn't get special dispatch — it produces `Invocation` objects and feeds them through the same function.

## Async Iterable Sources

Sources are async iterables. The for-await loop IS the lifecycle — structured concurrency cancels it.

```typescript
for await (const e of termKeySource(stdin)) {
  const inv = keys(e)
  if (inv) {
    const result = await invoke(inv) // await — commands may be async
    if (result === false) bell()
  }
}
```

No registration, no cleanup — break or cancel stops it. The loop IS the scope: when it ends, no dangling listeners.

Async iterables compose naturally:

```typescript
// Merge two sources
for await (const e of merge(termKeySource(stdin), timerSource(1000))) {
  // ...
}

// Filter a source
for await (const e of filter(termKeySource(stdin), (e) => !e.ctrl)) {
  // ...
}
```

## `keymap()` Factory

`keymap()` builds a `Mapping<string>` from binding groups. Chord and count state live in the closure — keymap-local signals, same primitive, narrower scope.

```typescript
type Binding = { key: string; command: Command; when?: Signal<boolean> }
type BindingGroup = Record<string, Command> | Binding[]

function keymap(...groups: BindingGroup[]): Mapping<string> {
  const bindings = flatten(groups) // normalize records + arrays into flat Binding[]
  const chord = signal<string | null>(null) // keymap-local
  const count = signal<number | null>(null) // keymap-local

  return (key: string) => {
    for (const b of bindings) {
      if (b.when && !b.when.value) continue
      if (matches(b.key, key, chord.value)) return { command: b.command }
    }
    return null
  }
}
```

The returned function is a plain `Mapping<string>`. Chord state (`d d`, `g g`) and count state (`3 j`) are signals scoped to the keymap closure, not global state.

## `when(signal, bindings)`

`when()` stamps each binding with a predicate. Predicates are channel-specific (mode, modifier state), NOT on the command itself. A CLI can invoke `remove` regardless of TUI mode.

```typescript
const keys = keymap(
  { "ctrl+c": commands.quit }, // always active
  when(isNormal, { j: commands.down, k: commands.up, "d d": commands.remove }),
  when(isInsert, { escape: commands.exitInsert }),
)
```

Two separate concerns: **can the command run?** (args schema — `parse()` fails if signal defaults are nullish) vs **should this key trigger it?** (`when()` predicates, mode-specific). A command like `remove` is always available; the key `d d` only triggers it in normal mode. Commands don't know about modes — that's the keymap's job.

## Command Availability

Availability is derived from the args schema. Signal defaults serve triple duty:

1. **Schema** — what params the command accepts
2. **Default resolver** — interactive surfaces read signal values automatically
3. **Availability predicate** — if a signal default is nullish, parse fails -> command unavailable

```typescript
canInvoke(command, provided?)     // try parse -> boolean
available(commands, provided?)    // filter to invocable commands
missingParams(command, provided?) // which args aren't resolvable
```

This is the same mechanism described in [03-commands.md](./03-commands.md#command-availability) — the input system doesn't add its own availability layer. `keymap()` can optionally filter by `canInvoke()` during resolution to skip unavailable bindings.

## Event Dispatch Pipeline

The full pipeline from source to effect:

```
Source (async iterable)
  |
  v
for await (event)
  |
  +- 1. Update channel state         shift.value = e.shift
  |    (signals from event data)      chord.push(e.key)
  |
  +- 2. Resolve command               keymap checks when predicates, matches key
  |    (channel-specific lookup)       filter by canInvoke()
  |    -> Invocation | null
  |
  +- 3. Invoke                        invoke({ command, args })
  |    (resolve schema, call fn)       signal defaults + overrides -> parse -> fn()
  |    fn can verify internally        return false -> rejected
  |
  +- 4. Handle failure                bell(), status("Can't outdent root")
       (from fn rejection)
```

All steps happen inside the for-await loop body — no event bus, no middleware chain. Different sources can have different dispatch logic (a mouse source updates `hover.value` in step 1; a keyboard source updates `chord.value`).

## Canonical Event Vocabularies

Two flat event types sharing a `HasModifiers` interface:

```typescript
interface HasModifiers {
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
}

interface KeyStroke extends HasModifiers {
  key: string // raw event values: "a", "Enter", "Escape", "ArrowDown"
  sequence?: string // raw terminal escape sequence
}
// Note: keymap patterns use normalized lowercase names ("enter", "escape"),
// while KeyStroke.key carries the raw event value ("Enter", "Escape").
// The keymap's matches() function handles the normalization.

interface PointerEvent extends HasModifiers {
  type: "press" | "release" | "move" | "scroll"
  x: number
  y: number
  button?: number
}
```

Minimal, flat, framework-agnostic. No event classes, no `preventDefault()`.

## Surfaces Own the Loop

`withTerminal()` exists at two layers:

**L2 — standalone convenience** for simple apps that just need a terminal:

```typescript
using app = withTerminal({
  view: <ListView />,
  keys,   // Mapping<string>
})
```

**L3 — plugin** in the app composition system:

```typescript
const app = pipe(
  createApp(),
  withTerminal({ view: <ListView />, keys }),
)
using handle = await run(app)
```

Both wire the same loop internally:

```typescript
function withTerminal({ view, keys }): Plugin {
  return (app) => {
    app.rt.hooks.onStart.push(async () => {
      const term = app.rt.providers.term

      term.render(view, app)

      ;(async () => {
        for await (const e of termKeySource(term.stdin)) {
          if (app.rt.scope.cancelled) break
          const inv = keys(e)
          if (inv) await invoke(inv)
        }
      })()
    })

    return app
  }
}
```

The standalone form calls `createApp()` + `pipe()` + `run()` internally — it's sugar, not a different system. The loop runs inside the app's scope tree. When the app disposes, the scope cancels, the AbortSignal fires, the async iterable terminates, the for-await exits. See [06-scopes.md](./06-scopes.md) for structured concurrency details.

## Signal Scopes

All state is signals, scoped by visibility:

| Scope            | Example                   | Lifetime               |
| ---------------- | ------------------------- | ---------------------- |
| **Universal**    | `items`, `cursor`, `mode` | App lifetime           |
| **Keymap-local** | `chord`, `count`          | Keymap instance        |
| **Derived**      | `isNormal`, `isInsert`    | Derived from universal |

No special "scope" concept — just closures and the same `signal()` primitive at different lexical scopes.

```typescript
// Universal — lives on the model
const mode = signal<"normal" | "insert">("normal")

// Derived — derived from universal
const isNormal = derived(() => mode.value === "normal")
const isInsert = derived(() => mode.value === "insert")

// Keymap-local — lives inside keymap() closure
const keys = keymap(
  // chord and count signals are created internally by keymap()
  when(isNormal, { j: commands.down, k: commands.up }),
  when(isInsert, { escape: commands.exitInsert }),
)
```

## Layered Architecture

| Layer  | What             | Examples                                                       | Package               |
| ------ | ---------------- | -------------------------------------------------------------- | --------------------- |
| **L0** | Primitives       | `signal()`, `derived()`, functions, `.parse()` interface       | `@silvery/platter`    |
| **L1** | Shapes           | `{ fn, args? }`, `Invocation`, `Mapping<E>`                    | Conventions (no code) |
| **L2** | Input library    | `keymap()`, `when()`, `invoke()`, `canInvoke()`, `available()` | `@silvery/tea`        |
| **L3** | App framework    | `createModel()`, `pipe()`, plugins, `op()`                     | `@silvery/tea`        |
| **L3** | Surface adapter  | `withTerminal()`, `withDom()`                                  | `@silvery/tea-platter`|
| **L4** | Domain framework | `withDocument()`, `withHistory()`, `withCursor()`              | `docily`              |

Helpers produce the shapes; shapes are the architecture. A `Mapping<string>` is just a function — you don't need `keymap()` to create one:

```typescript
// keymap() factory — convenient
const keys = keymap(when(isNormal, { j: commands.down }))

// Manual — equally valid
const keys: Mapping<string> = (key) => {
  if (isNormal.value && key === "j") return { command: commands.down }
  return null
}
```

Both produce the same shape.

## Canonical Small Example

Six concepts: signals, commands, keymap, view, withTerminal, run.

```typescript
import { signal, derived } from "@silvery/platter"
import { keymap, when, invoke } from "@silvery/tea"
import { createModel, run, pipe, createApp } from "@silvery/tea"
import { withTerminal } from "@silvery/tea-platter"
import { useSignal } from "@silvery/tea-react"

// 1. Signals — reactive state
const items = signal(["Buy milk", "Write docs", "Ship feature"])
const cursor = signal(0)

// 2. Commands — plain objects with fn + optional args
const commands = {
  down: { fn() { cursor.value = Math.min(cursor.value + 1, items.value.length - 1) } },
  up:   { fn() { cursor.value = Math.max(cursor.value - 1, 0) } },
  remove: {
    fn() {
      items.value = items.value.filter((_, i) => i !== cursor.value)
      cursor.value = Math.min(cursor.value, items.value.length - 1)
    },
  },
  quit: { fn() { process.exit(0) } },
}

// 3. Keymap — event -> invocation
const keys = keymap(
  { "ctrl+c": commands.quit, q: commands.quit },
  { j: commands.down, k: commands.up, "d d": commands.remove },
)

// 4. View — React component reading signals via useSignal()
function ListView() {
  const list = useSignal(items)
  const cur = useSignal(cursor)
  return (
    <Box flexDirection="column">
      {list.map((item, i) => (
        <Text key={i} color={i === cur ? "blue" : undefined}>
          {i === cur ? "> " : "  "}{item}
        </Text>
      ))}
    </Box>
  )
}

// 5. App — compose and run
const app = pipe(
  createApp(),
  withTerminal({ view: <ListView />, keys }),
)

using handle = await run(app)
await handle.waitUntilExit()
```

No event emitters, no `useInput()` hooks, no `addEventListener`. The keymap is a function; the source is an async iterable; the loop is the lifecycle.

## Migration from km's Current System

| Current (km)                 | Era 2                                          |
| ---------------------------- | ---------------------------------------------- |
| `CommandContext`             | Signals (commands read signals directly)       |
| `WhenPredicate`              | Signal reads + `when()` on keymap              |
| `Keybinding[]`               | `keymap()` factory                             |
| `processKey()`               | for-await loop                                 |
| `buildCommandContexts()`     | Eliminated (signal defaults serve triple duty) |
| `CommandRegistry.register()` | Commands are plain objects — no registration   |

Incremental migration: command shapes don't change (`{ fn, args? }`). What changes is wiring — registration becomes a mapping function, imperative key processing becomes a for-await loop, context building becomes signal defaults.

---

_See also: [architecture-overview.md](../reference/architecture-overview.md) (entry point connecting all design docs), [03-commands.md](./03-commands.md) (command tree, auto-derived surfaces), [05-app.md](./05-app.md) (plugin composition, `op()` ergonomics), [06-scopes.md](./06-scopes.md) (effects, scoping, concurrency)._
