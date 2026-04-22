// silvery plugin-composition prototype — single-file, runnable with `bun run`.
// Proves: scope+pipe, with*(app), dispatch+invokeCommand, signals, Provider,
// cross-layer constraints, effect:* commands, LIFO dispose, test variant.
//
// Run:  bun run hub/silvery/prototype/plugin-composition.ts
// Test: bun run hub/silvery/prototype/plugin-composition.ts --test

// ─── 1. Framework core (~40 LOC) ────────────────────────────────────────

type Dispose = { [Symbol.dispose](): void }

const scope = <T extends object = {}>(base: T = {} as T): T & Dispose =>
  Object.assign(base, { [Symbol.dispose]() {} })

// Variadic pipe — left-to-right composition. Typed up to 12 args.
type Fn<A, B> = (a: A) => B
function pipe<A>(a: A): A
function pipe<A, B>(a: A, ab: Fn<A, B>): B
function pipe<A, B, C>(a: A, ab: Fn<A, B>, bc: Fn<B, C>): C
function pipe<A, B, C, D>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>): D
function pipe<A, B, C, D, E>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>): E
function pipe<A, B, C, D, E, F>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>, ef: Fn<E, F>): F
function pipe<A, B, C, D, E, F, G>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>, ef: Fn<E, F>, fg: Fn<F, G>): G
function pipe<A, B, C, D, E, F, G, H>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>, ef: Fn<E, F>, fg: Fn<F, G>, gh: Fn<G, H>): H
function pipe<A, B, C, D, E, F, G, H, I>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>, ef: Fn<E, F>, fg: Fn<F, G>, gh: Fn<G, H>, hi: Fn<H, I>): I
function pipe<A, B, C, D, E, F, G, H, I, J>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>, ef: Fn<E, F>, fg: Fn<F, G>, gh: Fn<G, H>, hi: Fn<H, I>, ij: Fn<I, J>): J
function pipe<A, B, C, D, E, F, G, H, I, J, K>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>, ef: Fn<E, F>, fg: Fn<F, G>, gh: Fn<G, H>, hi: Fn<H, I>, ij: Fn<I, J>, jk: Fn<J, K>): K
function pipe<A, B, C, D, E, F, G, H, I, J, K, L>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>, ef: Fn<E, F>, fg: Fn<F, G>, gh: Fn<G, H>, hi: Fn<H, I>, ij: Fn<I, J>, jk: Fn<J, K>, kl: Fn<K, L>): L
function pipe(x: unknown, ...fns: Array<Fn<unknown, unknown>>): unknown {
  return fns.reduce((v, f) => f(v), x)
}

// ─── 2. Minimal signal (~15 LOC; real impl = alien-signals) ─────────────

type Signal<T> = { get(): T; set(v: T): void; subscribe(fn: (v: T) => void): () => void }

const signal = <T>(initial: T): Signal<T> => {
  let v = initial
  const subs = new Set<(v: T) => void>()
  return {
    get: () => v,
    set: (next) => { v = next; subs.forEach((f) => f(v)) },
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn) } },
  }
}

// ─── 3. App chooses its types (not framework) ──────────────────────────

type Key = { name: string; mods?: { ctrl?: boolean; alt?: boolean; shift?: boolean } }
type KeyEvent   = { kind: "key";   key: Key }
type PasteEvent = { kind: "paste"; text: string }
type AppEvent = KeyEvent | PasteEvent   // renamed to avoid DOM `Event` clash

// ─── 4. Cross-layer constraint helpers (purely types) ──────────────────

type HasDispatch<E = AppEvent> = { dispatch(e: E): boolean }
type HasCommands = {
  invokeCommand(name: string, args?: unknown): void
  registerCommand(name: string, handler: (args?: unknown) => void): void
}

// ─── 5. Layer 1: seam plugins (plugin-contributed, not framework) ──────

const withDispatch = <E,>() => <A extends Dispose>(app: A): A & HasDispatch<E> =>
  Object.assign(app, { dispatch: (_e: E) => false })   // baseline; wrappers override

const withCommands = <A extends Dispose>(app: A): A & HasCommands => {
  const registry = new Map<string, (args?: unknown) => void>()
  return Object.assign(app, {
    invokeCommand(name: string, args?: unknown) {
      const h = registry.get(name)
      if (!h) throw new Error(`unknown command: ${name}`)
      h(args)
    },
    registerCommand(name: string, handler: (args?: unknown) => void) {
      registry.set(name, handler)
    },
  })
}

// ─── 6. Provider — the ONE external-data abstraction ───────────────────

type Provider<S, E> = {
  state: S
  events: AsyncIterable<E>
  [Symbol.dispose](): void
}

// Fake term provider — emits scripted events. Real one reads stdin.
const createFakeTerm = (script: AppEvent[]): Provider<{ size: Signal<[number, number]> }, AppEvent> => {
  const size = signal<[number, number]>([80, 24])
  let disposed = false
  async function* gen() { for (const e of script) { if (disposed) return; yield e } }
  return {
    state: { size },
    events: gen(),
    [Symbol.dispose]() { disposed = true },
  }
}

// ─── 7. Layer 2: target bridge ─────────────────────────────────────────

type HasTerm = { term: { size: Signal<[number, number]> } }

const withTerm = (term: Provider<{ size: Signal<[number, number]> }, AppEvent>) =>
  <A extends Dispose & HasDispatch<AppEvent>>(app: A): A & HasTerm => {
    const prevDispose = app[Symbol.dispose].bind(app)
    // In real code an async task pumps term.events → app.dispatch. For the
    // prototype we drain the events in main() instead.
    return Object.assign(app, {
      term: { size: term.state.size },
      [Symbol.dispose]() { term[Symbol.dispose](); prevDispose() },
    })
  }

// ─── 8. Layer 3: input transform (wraps dispatch to coalesce) ──────────

// Coalesces ≥5 consecutive printable keystrokes into a single paste event.
// Proves: dispatch wrappers can TRANSFORM events, not just observe/filter.
const withPasteCoalescer = <A extends Dispose & HasDispatch<AppEvent>>(app: A): A => {
  const { dispatch } = app
  let buffer = ""
  app.dispatch = (e) => {
    if (e.kind === "key" && e.key.name.length === 1) {
      buffer += e.key.name
      if (buffer.length >= 5) {
        const text = buffer; buffer = ""
        return dispatch({ kind: "paste", text })
      }
      return true
    }
    if (buffer) buffer = ""
    return dispatch(e)
  }
  return app
}

// ─── 9. Layer 4: routing + owned state ──────────────────────────────────

type HasFocus = { focus: { active: Signal<string | null>; set(id: string | null): void } }

const withFocus = <A extends Dispose & HasDispatch<AppEvent>>(app: A): A & HasFocus => {
  const active = signal<string | null>(null)
  // Real withFocus would dispatch to focused element before passing through.
  // Proving the pattern: owns a signal, sits in dispatch chain.
  return Object.assign(app, {
    focus: { active, set: (id: string | null) => active.set(id) },
  })
}

// ─── 10. Layer 5: effect handlers ──────────────────────────────────────

const withEffects = (handlers: Record<string, (args?: unknown) => void>) =>
  <A extends Dispose & HasCommands>(app: A): A => {
    for (const [name, h] of Object.entries(handlers)) app.registerCommand(name, h)
    return app
  }

// ─── 11. Layer 6: command resolution (cross-layer constraint demo) ─────

// REQUIRES HasDispatch + HasCommands — placing before either fails typecheck.
const withKeymap = (map: Record<string, string>) =>
  <A extends Dispose & HasDispatch<AppEvent> & HasCommands>(app: A): A => {
    const { dispatch } = app
    app.dispatch = (e) => {
      if (e.kind === "key") {
        const cmd = map[e.key.name]
        if (cmd) { app.invokeCommand(cmd); return true }
      }
      return dispatch(e)
    }
    return app
  }

// ─── 12. Layer 7: feature (todo) ────────────────────────────────────────

type TodoItem = { id: string; text: string; done: boolean }
type HasTodo = {
  todo: {
    items: Signal<TodoItem[]>
    add(text: string): void
    toggle(id: string): void
  }
}

let __id = 0
const nextId = () => `t${++__id}`

const withTodo = <A extends Dispose & HasCommands>(app: A): A & HasTodo => {
  const items = signal<TodoItem[]>([])
  const add = (text: string) =>
    items.set([...items.get(), { id: nextId(), text, done: false }])
  const toggle = (id: string) =>
    items.set(items.get().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

  app.registerCommand("todo.add",    (args) => add((args as { text: string }).text))
  app.registerCommand("todo.toggle", (args) => toggle((args as { id: string }).id))

  return Object.assign(app, { todo: { items, add, toggle } })
}

// ─── 13. Layer 8: cross-cutting (trace — wraps BOTH seams) ─────────────

type TraceEntry =
  | { type: "dispatch"; event: AppEvent }
  | { type: "command";  name: string; args?: unknown }

const withTrace = <A extends Dispose & HasDispatch<AppEvent> & HasCommands>(
  app: A,
): A & { trace: TraceEntry[] } => {
  const log: TraceEntry[] = []
  const { dispatch, invokeCommand } = app
  app.dispatch = (e) => { log.push({ type: "dispatch", event: e }); return dispatch(e) }
  app.invokeCommand = (name, args) => {
    log.push({ type: "command", name, args })
    invokeCommand(name, args)
  }
  return Object.assign(app, { trace: log })
}

// ─── 14. Test-variant plugin: mock effects ─────────────────────────────

const withMockEffects = <A extends Dispose & HasCommands>(
  app: A,
): A & { effectLog: Array<{ name: string; args?: unknown }> } => {
  const effectLog: Array<{ name: string; args?: unknown }> = []
  const { invokeCommand } = app
  app.invokeCommand = (name, args) => {
    if (name.startsWith("effect:")) { effectLog.push({ name, args }); return }
    invokeCommand(name, args)
  }
  return Object.assign(app, { effectLog })
}

// ─── 15. Third-party plugin: vim modal (same shape, no framework knobs) ─

type HasVim = { vim: { mode: Signal<"normal" | "insert"> } }

const withVim = <A extends Dispose & HasDispatch<AppEvent>>(app: A): A & HasVim => {
  const { dispatch } = app
  const mode = signal<"normal" | "insert">("normal")
  app.dispatch = (e) => {
    if (e.kind !== "key") return dispatch(e)
    if (mode.get() === "normal" && e.key.name === "i") { mode.set("insert"); return true }
    if (mode.get() === "insert" && e.key.name === "escape") { mode.set("normal"); return true }
    return dispatch(e)
  }
  return Object.assign(app, { vim: { mode } })
}

// ─── 16. Boot — real composition ────────────────────────────────────────

async function main() {
  using term = createFakeTerm([
    { kind: "key",   key: { name: "a" } },
    { kind: "key",   key: { name: "?" } },
    { kind: "paste", text: "pasted content" },
    { kind: "key",   key: { name: "x" } },
  ])

  using app = pipe(
    scope(),
    withDispatch<AppEvent>(),
    withCommands,
    withTerm(term),
    withPasteCoalescer,
    withFocus,
    withEffects({
      "effect:write": (args) => console.log("[write]", args),
      "effect:exit":  (args) => console.log("[exit]",  args),
    }),
    withKeymap({ a: "todo.add", "?": "effect:write" }),
    withTodo,
    withVim,
    withTrace,
  )

  app.registerCommand("todo.add", () => app.todo.add("added via keymap"))

  for await (const e of term.events) app.dispatch(e)

  console.log("\ntodos:",      app.todo.items.get())
  console.log("vim mode:",     app.vim.mode.get())
  console.log("term size:",    app.term.size.get())
  console.log("trace count:",  app.trace.length)
}

// ─── 17. Test variant — same pipe, mock leaves, signal-read assertions ─

async function test() {
  using term = createFakeTerm([
    { kind: "key", key: { name: "i" } },
    { kind: "key", key: { name: "x" } },
    { kind: "key", key: { name: "escape" } },
    { kind: "key", key: { name: "a" } },
  ])

  using app = pipe(
    scope(),
    withDispatch<AppEvent>(),
    withCommands,
    withTerm(term),
    withFocus,
    withMockEffects,
    withKeymap({ a: "todo.add" }),
    withTodo,
    withVim,
    withTrace,
  )
  app.registerCommand("todo.add", () => app.todo.add("test-added"))

  for await (const e of term.events) app.dispatch(e)

  const assert = (cond: boolean, msg: string) => {
    if (!cond) { console.error("FAIL:", msg); process.exit(1) }
    console.log("PASS:", msg)
  }
  assert(app.vim.mode.get() === "normal",                           "vim returned to normal after escape")
  assert(app.todo.items.get().length === 1,                         "one todo added")
  assert(app.todo.items.get()[0].text === "test-added",             "todo text correct")
  assert(app.trace.some((t) => t.type === "command" && t.name === "todo.add"), "trace captured command")
  assert(app.effectLog.length === 0,                                "no effects fired in test")
  console.log("\nall assertions passed.")
}

// ─── 18. Entry point ────────────────────────────────────────────────────

if (process.argv.includes("--test")) { await test() } else { await main() }

export {}   // make this file a module so top-level await is allowed

// ─── 19. Compile-time ordering demo (uncomment to see the error) ───────
//
// Swapping withKeymap above withCommands fails typecheck:
//   "Type '...' is missing the following properties from type 'HasCommands'"
//
// const broken = pipe(
//   scope(),
//   withDispatch<AppEvent>(),
//   withKeymap({ a: "todo.add" }),   // ← error: HasCommands not yet on A
//   withCommands,
// )
