# Example Quality Checklist

> Canonical era2 examples must pass every applicable item. A simple `render()` example skips Composition & Commands — use **Levels** to scope.

## The example IS the product

Examples aren't just code samples — they're showcases of what Silvery makes possible. The AI Chat prototype exists because it's _impressive_: streaming responses, tool calls, thinking indicators, context compaction, a polished status bar. A reader should look at the running demo and think "I want to build something like this."

Concision applies to the _teaching_ parts (model, commands, composition). But the _showcase_ parts (rich view components, polished UI details) earn their lines by demonstrating Silvery's capabilities: `ScrollbackList` with markers, `TextArea` with placeholder, semantic theme tokens, `Spinner` animations, `Link` with OSC 8. More view code is warranted when it shows off the component library. The test for every line: does it teach an era2 pattern, or does it demonstrate a Silvery capability? If neither, cut it.

## Levels

| Level          | When                     | Sections                         |
| -------------- | ------------------------ | -------------------------------- |
| **Foundation** | Counter, hello world     | Structure, View, Style           |
| **+ Signals**  | Shared state             | + State                          |
| **+ App**      | Commands, modes, plugins | + Composition, Commands, Testing |
| **Full**       | Production app           | All                              |

Don't force a higher level than needed.

---

## Structure & Narrative

The file IS the teaching material. A reader starts at line 1 and scans top-down. They should hit the most important thing as fast as possible.

### File layout (inverted pyramid)

```
1. Imports — grouped by layer (framework → signals → commands → components)
2. main() / entry point — the "what" (composition, pipe, plugins)
3. Domain plugins — withChat(), withTodo() (how it's composed)
4. Model factories — signals + commands (the state & behavior)
5. View components — pure rendering (the presentation)
6. Helpers, utilities, constants — supporting details
```

Rely on hoisting. `main()` calls `withChat()` which is defined below — the reader sees the call before the implementation. Same inside functions: shape/return first, helpers after `return`.

### Do

- [ ] **Inverted pyramid**: main/exports at top, helpers at bottom, constants last. See [principles.md § Inverted Pyramid](../../../docs/principles.md#principle-inverted-pyramid)
- [ ] **Imports tell the story**: group by layer (generic → specific) — `@silvery/create` → `@silvery/signals` → `@silvery/commands` → `@silvery/ag-react`. The dependency stack is visible in the imports
- [ ] **Namespace imports** for external data: `import * as script from "..."` not 10 named imports
- [ ] **Reduce imports**: only import what the reader needs to see. Helpers import their own deps
- [ ] **Section headers match doc sections**: `// Model`, `// Commands`, `// View`, `// App`
- [ ] **Model shape first**: `const model = { phase: signal("idle"), ... }` then `const commands = { ... }` then `return { ...model, commands }`. The reader sees the full public surface before any implementation. Internal functions hoist below the return
- [ ] **Hoist helpers into their callers** when they're only used once — keeps related code together and captures closure variables naturally
- [ ] **One concept per code block** when teaching. Signals in one block, commands in the next
- [ ] **Pain first**: show why the naive approach hurts before showing the era2 way
- [ ] **Runnable at every step**: a reader who stops after Step 1 has working code
- [ ] **Top-heavy decomposition**: when splitting a function/object, crystallize the important stuff into the top-most object so it reads like pseudo-code. Push boilerplate into helper objects/functions — but don't hide important domain details. The reader should see the full domain story (signals, updaters, commands) in the main object, with only mechanical complexity (streaming chunks, delivery state, cancellation) extracted
- [ ] **Core logic < 15 lines** per function: extract details into named helpers
- [ ] **Comments explain _why_**, not _what_. Cross-reference docs: `// See 03-commands.md § availability`

### Don't

- [ ] Don't bury the entry point at the bottom of the file
- [ ] Don't put types/interfaces before the code that uses them — let the reader discover types when they need to
- [ ] Don't declare signals as separate `const` variables then repeat them in the return — define them inline in the model object
- [ ] Don't add optional parameters unless the example is _about_ options
- [ ] Don't add error handling, fallbacks, or edge cases unless teaching those things
- [ ] Don't show 300 lines of view rendering when the point is model/commands

---

## Composition

### Do

- [ ] `pipe(create(), withScope(), withApp(), withTerm(), withReact(), ...domains..., ...behavioral...)`
- [ ] **Pipe ordering: generic → specific** — all infrastructure first (`create`, `withScope`, `withApp`, `withTerm`, `withReact`), then domain plugins (`withChat`, `withTodo`), then behavioral (`withAutoAdvance`) last. Rendering is infrastructure, not app-specific — group it with the foundation
- [ ] Each domain is a `with*()` plugin co-locating model + commands + keybindings in one closure
- [ ] **Model via `createModel()`** — signals + updaters (methods that mutate state). **Commands defined in the plugin**, not in the model — thin `{ fn }` wrappers around model updaters registered on `app.commands`
- [ ] `withScope()` and `withApp()` are separate plugins (not combined)
- [ ] Providers via `withApp({ providers })` — typed I/O capabilities
- [ ] `using scope = createScope()` for lifecycle
- [ ] `scope.defer(fn)` for cleanup (not `onDispose` — matches Go/Swift/TC39 DisposableStack)
- [ ] **Wrap updaters to add behavior** — `const { submit } = chat; chat.submit = (...args) => { submit(...args); replyFromScript() }`. Prefer wrapping over `.subscribe()` — it's simpler, no cleanup needed, and composes naturally via the plugin pipe
- [ ] **If you must `.subscribe()`, always clean up** — `app.defer(sig.subscribe(...))`. But prefer wrapping updaters first
- [ ] `app.keymap?.()` with optional chaining for headless compatibility
- [ ] Plugin ordering also reflects dependencies — plugins that reference other domains come after them
- [ ] Scopes pass explicitly — no ambient lookup, no `AsyncLocalStorage`
- [ ] `scope.sleep()` / `scope.timeout()` for cancellable timers, check `scope.cancelled` after `await`
- [ ] Use signals as keymap predicates: `when(inputEmpty, { "ctrl+d": commands.exit })` — signal IS `() => boolean`

### Don't

- [ ] Don't wire things manually in `main()` — use plugins
- [ ] Don't skip `withScope()` in app-level examples
- [ ] Don't use raw `setTimeout`/`setInterval` — scope-owned timers
- [ ] Don't use `as ChatModel` / `as any` casts — use `chatModel.get()` for typed access, plain object assignment for plugin extensions

---

## State & Signals

### Do

- [ ] Callable accessors: `count()` to read, `count(5)` to write
- [ ] `computed()` for derived state — never manually sync. If you're writing `x(!y().trim())` in a handler, it should be `computed(() => !y().trim())`
- [ ] `createModel(factory)` for models — `.create()` for test isolation, `.get()` for view access, `.bind()` for plugin registration
- [ ] **Minimal model surface** — only signals that represent independent domain state. The model for a chat app is ~3 signals: `messages`, `draft`, `isDone`. Everything else is either on the message, derived, or component-local
- [ ] **Per-entity state over global state** — streaming lifecycle (thinking → streaming → revealing-tools) belongs on the message being streamed, not as global `phase`/`streamingText`/`activeToolIndex` on the model. The view renders from the message alone — no `isLatest` + global phase checks
- [ ] **Delivery state on messages** — agent messages carry `delivery: { stage, visibleText, revealedTools }` while streaming. When complete, `delivery` is removed. The model has no global "phase"
- [ ] **Component-local for presentational concerns** — elapsed time, pulse animation, random placeholder selection are `useState`/`useEffect` in the component, not model signals
- [ ] `model.create(mockDeps)` for isolated test instances — each test gets its own signals

### Don't

- [ ] Don't use `.value` — callable accessors only
- [ ] Don't duplicate entity state on the model — if it describes one message's delivery, put it on the message. If every component needs `isLatest` to decide what to show, the state is in the wrong place
- [ ] Don't use `useState` for state that's read outside the component (commands, keymaps, other plugins)
- [ ] Don't manually sync derived state — use `computed()`
- [ ] Don't use a writable signal for state that could be derived — if `isCompacting` can be computed from whether a compaction message exists in the timeline, it should be `computed()`, not `signal()` set imperatively. Prefer deriving over setting

---

## Commands & Input

### Do

- [ ] Commands are `{ fn, args? }` — closures capture state. No title needed (discoverable from tree path)
- [ ] `z.object(...)` for `args` — validation + signal defaults + availability
- [ ] `when(predicate, { key: command })` — predicate is `() => boolean`, signals qualify naturally
- [ ] Tree placement IS registration: `app.commands.chat = { ... }`
- [ ] `invoke({ command, args })` for programmatic dispatch
- [ ] Chord/double-press bindings are infrastructure (keymap system) — don't implement in the example

### Don't

- [ ] Don't use `useInput()` in components — keymaps handle it outside React
- [ ] Don't scatter `if (mode === "normal")` — use `when()` blocks per mode
- [ ] Don't use `registerCommand()` — tree structure IS discovery

---

## View & Components

### Do

- [ ] Views are pure rendering — read signals, return JSX, no logic
- [ ] Canonical components: `SelectList`, `TextInput`, `TextArea`, `VirtualList`, `ScrollbackList`
- [ ] Semantic tokens: `$primary`, `$muted`, `$success`, `$error`, `$border`
- [ ] `$muted` for dimmed text (not `$muted-bg`)
- [ ] `focusScope` on `Box` for focus management
- [ ] `Spinner` / `ProgressBar` — not manual animation

### Don't

- [ ] Don't manage cursor/selection/focus manually — use canonical components
- [ ] Don't hardcode colors — always `$token` semantic colors
- [ ] Don't use `setInterval` in components — scope timers or signal-derived values

---

## Testing

### Do

- [ ] Model tests need no React, no rendering: `model.create(mockDeps)`
- [ ] `createInstantScope()` for zero-delay execution
- [ ] `invoke({ command, args })` then check signal values
- [ ] Each test gets its own instance via `.create()` — no shared state
- [ ] Same model API works in tests, plugins, CLI, MCP

### Don't

- [ ] Don't mount React to test model behavior
- [ ] Don't use real timers — instant scopes
- [ ] Don't share state between tests

---

## Style

See [principles.md](../../../docs/principles.md) for the full rationale. Key rules for examples:

- [ ] **Factory functions** — `createX()`, not classes. No `this`, no `new`
- [ ] **`using`** for cleanup — not `try/finally`
- [ ] **Explicit DI** — dependencies are parameters, not globals
- [ ] **`async function*`** for streaming content
- [ ] **Return signals + methods** from factories: `return { phase, submit, clear }`
- [ ] **Hoisted internals** after the `return` statement
- [ ] **Domain names** — `createChat`, `withTodo` / not `createModel1`, `doThing`
- [ ] **`is` prefix for boolean signals** — `isDone`, `isCompacting`, `isUserInputEmpty` / not `done`, `compacting`, `inputEmpty`. Reads as a question
- [ ] **Same word for the same thing** — if it's a script, call it `script` everywhere (not `entries` in one place, `script` in another)
- [ ] **Disambiguate when confusing** — `userInput` not bare `input` (input of what?). Use hierarchy: `user.input`, `script.idx`
- [ ] **Shared prefix for related things** — `userInput`, `userInputFromScript`, `isUserInputEmpty` — the `userInput` prefix groups them. `compactedTokens`, `isCompacting` — the `compact` root groups them
- [ ] **Aligned names** — `const path = ...; return { path }` / not `{ path: rootPath }`. When you see plumbing that renames (`{ compactedAmount: amount }`, `const draft = useChat(m => m.input.draft())`), ask: can I rename the source to match the destination and eliminate the mapping? Rename > alias > mapping
- [ ] **Equal visual weight** — all methods one-liner or all extracted, not mixed
- [ ] **Visual rhythm for scanning** — group and order primarily by semantic meaning (conversation state, then derived, then updaters). Within a semantic group, order by line length (short → long) for a smooth diagonal staircase. Group related names by prefix (`is*` together). Reorder lines, tweak names — don't add alignment spaces (formatters eat them). Reordering is free; aligning with spaces is a fool's errand
- [ ] **ESM only** — no `require()`
- [ ] **No IIFEs** — `;(async () => { ... })()` is unreadable. Extract to a named `async function` and call it
- [ ] **Actual Unicode** — `"•"` not `"\u2022"`, `"█"` not `"\u2588"`. Design for human readability
- [ ] **No raw ANSI codes** — use semantic theme tokens (`$primary`, `$muted`) not escape sequences
- [ ] **No unnecessary abstractions** — three similar lines beat a premature helper

---

## Stale API — never use

| Stale                        | Replacement                            | Decision |
| ---------------------------- | -------------------------------------- | -------- |
| `.value`                     | `sig()` / `sig(v)`                     | 29       |
| `derived()`                  | `computed()`                           | —        |
| `@silvery/signal` (singular) | `@silvery/signals`                     | 35       |
| `@silvery/tea`               | `@silvery/create`                      | 31       |
| `registerCommand()`          | `app.commands.x = { ... }`             | —        |
| `useChat.get()`              | `useModel(model, selector)`            | —        |
| `Readable<T>`                | `Signal<T>` — `{ (): T, subscribe() }` | —        |
| `app.rt`                     | `app.providers`                        | —        |
| `app.model` (singular)       | `app.models`                           | —        |
| `useInput()` for app keys    | `keymap()` + `when()`                  | —        |
| `ctx: ModelContext`          | Scope from plugin closure              | —        |

---

## Progressive Disclosure

When showing the progression, each step adds one concept — nothing rewrites:

1. **Just React**: `render(<App />)` with `useState` and `useInput`
2. **Add signals**: `signal()` + `useSignal()` for shared state
3. **Add app**: `pipe(create(), withApp(), ...)` with commands, keymaps, `when()` modes

`useInput` and keymaps coexist. Migration is gradual. Don't present era2 as all-or-nothing.
