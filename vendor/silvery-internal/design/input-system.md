# Input System

_Status: finalized (v1, 2026-03-13). How input events reach commands._

_See also: [command-centric.md](./command-centric.md) (command shapes, availability), [app-composition.md](./app-composition.md) (plugin composition, surfaces), [state-api-redesign.md](./state-api-redesign.md) (signals, models)._

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

Any input source — keyboard, mouse, network, timer, voice — produces typed events. Any mapping function can resolve those events to commands. The two are decoupled: a mapping doesn't know where the event came from, and a source doesn't know what the mapping will do with it.

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

Single dispatch point. Merges event-provided overrides with signal defaults via the schema's `.parse()`. Commands can verify internally — return false or throw for failure.

```typescript
function invoke({ command, args }: Invocation) {
  if (command.args) {
    const resolved = command.args.parse(args ?? {}) // overrides + signal defaults
    return command.fn(resolved)
  }
  return command.fn()
}
```

This is the same `invoke()` that CLI, MCP, tests, and AI agents use (see [command-centric.md](./command-centric.md)). The input system doesn't get special dispatch — it produces `Invocation` objects and feeds them through the same function.

## Async Iterable Sources

Sources are async iterables. The for-await loop IS the lifecycle — structured concurrency cancels it.

```typescript
for await (const e of termKeySource(stdin)) {
  const inv = keys(e)
  if (inv) invoke(inv)
}
```

No `handle(channel, mapping)` registration. No cleanup. Break or cancel stops it.

**Why not pub/sub?** Registration is a cleanup nightmare. Listeners must be removed in the right order, at the right time, in the right scope. With async iterables, the loop IS the scope. When the scope ends, the loop ends. No dangling listeners. No `off()` calls that someone forgot. No listener leaks.

Async iterables also compose naturally:

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

`keymap()` builds a `Mapping<KeyStroke>` from binding groups. Chord and count state live in the closure — keymap-local signals, same primitive, narrower scope.

```typescript
function keymap(...groups: BindingGroup[]): Mapping<KeyStroke> {
  const bindings = flatten(groups)
  const chord = signal<string | null>(null) // keymap-local
  const count = signal<number | null>(null) // keymap-local

  return (e: KeyStroke) => {
    for (const b of bindings) {
      if (b.when && !b.when.value) continue
      if (matches(b.key, e, chord.value)) return { command: b.command }
    }
    return null
  }
}
```

The returned function is a plain `Mapping<KeyStroke>` — it doesn't know about sources, loops, or surfaces. It takes a keystroke, returns an invocation or null. Chord state (`d d`, `g g`) and count state (`3 j`) are signals scoped to the keymap closure, not global state.

## `when(signal, bindings)`

`when()` stamps each binding with a predicate. Predicates are channel-specific (mode, modifier state), NOT on the command itself. A CLI can invoke `remove` regardless of TUI mode.

```typescript
const keys = keymap(
  { "ctrl+c": commands.quit }, // always active
  when(isNormal, { j: commands.down, k: commands.up, "d d": commands.remove }),
  when(isInsert, { escape: commands.exitInsert }),
)
```

This separates two concerns that other systems conflate:

- **Can the command run?** — determined by the `args` schema (see [command-centric.md](./command-centric.md#command-availability)). If signal defaults can't satisfy required params, `parse()` fails.
- **Should this key trigger the command?** — determined by `when()` predicates on the keymap. Mode-specific, input-channel-specific.

A command like `remove` has no `when` field. It's always available (assuming a node is selected). But the key `d d` only triggers it in normal mode. The command doesn't know or care about modes — that's the keymap's job.

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

This is the same mechanism described in [command-centric.md](./command-centric.md#command-availability) — the input system doesn't add its own availability layer. `keymap()` can optionally filter by `canInvoke()` during resolution to skip unavailable bindings.

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

Steps 1-4 happen inside the for-await loop body. There's no event bus, no middleware chain for events, no event propagation. The loop body IS the dispatch logic. Different sources can have different dispatch logic — a mouse source might update `hover.value` in step 1, while a keyboard source updates `chord.value`.

## Canonical Event Vocabularies

Two flat event types. `HasModifiers` is a capability interface that both share.

```typescript
interface HasModifiers {
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
}

interface KeyStroke extends HasModifiers {
  key: string // "a", "Enter", "Escape", "ArrowDown"
  sequence?: string // raw terminal escape sequence
}

interface PointerEvent extends HasModifiers {
  type: "press" | "release" | "move" | "scroll"
  x: number
  y: number
  button?: number
}
```

These are minimal, flat, framework-agnostic. No inheritance hierarchy, no event classes, no `preventDefault()`. Sources produce them; mappings consume them.

## Surfaces Own the Loop

`withTerminal()` creates source, runs for-await, manages lifecycle. One declaration, one lifecycle, `using` for cleanup:

```typescript
using app = withTerminal({
  view: <ListView />,
  keys,   // Mapping<KeyStroke>
})
```

Internally, the surface plugin wires the loop:

```typescript
function withTerminal({ view, keys }): Plugin {
  return (app) => {
    app.rt.hooks.onStart.push(async () => {
      const term = app.rt.providers.term

      // Mount React
      term.render(view, app)

      // Input loop — structured concurrency cancels on dispose
      app.rt.scope.spawn("input", async (signal) => {
        for await (const e of termKeySource(term.stdin, { signal })) {
          const inv = keys(e)
          if (inv) invoke(inv)
        }
      })
    })

    return app
  }
}
```

The loop runs inside the app's scope tree. When the app disposes, the scope cancels, the AbortSignal fires, the async iterable terminates, the for-await exits. No explicit cleanup. See [scope-tree.md](./scope-tree.md) for structured concurrency details.

## Signal Scopes

All state is signals, scoped by visibility:

| Scope            | Example                   | Lifetime               |
| ---------------- | ------------------------- | ---------------------- |
| **Universal**    | `items`, `cursor`, `mode` | App lifetime           |
| **Keymap-local** | `chord`, `count`          | Keymap instance        |
| **Derived**      | `isNormal`, `isInsert`    | Derived from universal |

No special "scope" concept — just closures. Universal signals live on the model. Keymap-local signals live inside `keymap()`'s closure. Derived signals are `computed()` from universal ones. Same `signal()` primitive everywhere, different lexical scope.

```typescript
// Universal — lives on the model
const mode = signal<"normal" | "insert">("normal")

// Derived — computed from universal
const isNormal = computed(() => mode.value === "normal")
const isInsert = computed(() => mode.value === "insert")

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
| **L0** | Primitives       | `signal()`, `derived()`, functions, `.parse()` interface       | `@silvery/signal`     |
| **L1** | Shapes           | `{ fn, args? }`, `Invocation`, `Mapping<E>`                    | Conventions (no code) |
| **L2** | Input library    | `keymap()`, `when()`, `invoke()`, `canInvoke()`, `available()` | `@silvery/input`      |
| **L3** | App framework    | `createModel()`, `withTerminal()`, `pipe()`, plugins, `op()`   | `@silvery/tea`        |
| **L4** | Domain framework | `withDocument()`, `withHistory()`, `withCursor()`              | `docily`              |

Key insight: `createApp`, `createModel`, even `keymap()` are helpers that produce the shapes, not the architecture itself. The architecture is defined by the shapes — `Command`, `Invocation`, `Mapping<E>`, `signal()`. Helpers are convenience; shapes are load-bearing.

A `Mapping<KeyStroke>` is just a function. You don't need `keymap()` to create one:

```typescript
// keymap() factory — convenient
const keys = keymap(when(isNormal, { j: commands.down }))

// Manual — equally valid
const keys: Mapping<KeyStroke> = (e) => {
  if (isNormal.value && e.key === "j") return { command: commands.down }
  return null
}
```

Both produce the same shape. The framework doesn't care which you used.

## Canonical Small Example

Six concepts: signals, commands, keymap, view, withTerminal, run.

```typescript
import { signal, computed } from "@silvery/signal"
import { keymap, when, invoke } from "@silvery/input"
import { createModel, withTerminal, run, pipe, createApp } from "@silvery/tea"

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

// 4. View — React component reading signals
function ListView() {
  return (
    <Box flexDirection="column">
      {items.value.map((item, i) => (
        <Text key={i} color={i === cursor.value ? "blue" : undefined}>
          {i === cursor.value ? "> " : "  "}{item}
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

No event emitters. No `useInput()` hooks. No `onKeyPress` callbacks. No `addEventListener`. No `removeEventListener`. The keymap is a function; the source is an async iterable; the loop is the lifecycle.

## Migration from km's Current System

| Current (km)                 | Era 2                                          |
| ---------------------------- | ---------------------------------------------- |
| `CommandContext`             | Signals (commands read signals directly)       |
| `WhenPredicate`              | Signal reads + `when()` on keymap              |
| `Keybinding[]`               | `keymap()` factory                             |
| `processKey()`               | for-await loop                                 |
| `buildCommandContexts()`     | Eliminated (signal defaults serve triple duty) |
| `CommandRegistry.register()` | Commands are plain objects — no registration   |

The migration path is incremental. Commands are already `{ fn, args? }` objects in the current system — the shape doesn't change. What changes is how they're wired to input: registration-based dispatch becomes a mapping function, imperative key processing becomes a for-await loop, and context building becomes signal defaults.

---

_See also: [architecture-overview.md](./architecture-overview.md) (entry point connecting all design docs), [command-centric.md](./command-centric.md) (command registry, auto-derived surfaces), [app-composition.md](./app-composition.md) (plugin composition, `op()` ergonomics), [scope-tree.md](./scope-tree.md) (effects, scoping, concurrency)._
