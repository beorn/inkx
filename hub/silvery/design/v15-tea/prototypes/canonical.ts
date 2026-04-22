// Canonical plugin-composition prototype — the shape km/silvery actually ships.
//
// Differences from the minimal prototype:
//   1. Commands are DECLARED in-plugin (not registered at runtime via side-effect calls)
//   2. Command map is TYPE-INFERRED through the pipe — typos and wrong args fail at compile
//   3. Two seams: dispatch(event) + invoke(command-name, args?)
//   4. `when` predicates, optional keybindings, commands-as-data for palette/replay
//   5. Provider abstraction, effect:* namespace, trace wrapping invoke
//
// Run:  bun run hub/silvery/prototype/plugin-composition-canonical.ts
// Test: bun run hub/silvery/prototype/plugin-composition-canonical.ts --test

// ─── 1. Framework core ──────────────────────────────────────────────────

type Dispose = { [Symbol.dispose](): void }

const scope = <T extends object = {}>(base: T = {} as T): T & Dispose =>
  Object.assign(base, { [Symbol.dispose]() {} })

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
function pipe(x: unknown, ...fns: Array<Fn<unknown, unknown>>): unknown {
  return fns.reduce((v, f) => f(v), x)
}

// ─── 2. Signal ──────────────────────────────────────────────────────────

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

// ─── 3. Command system — declarative, type-inferred ────────────────────

// A Cmd is data: optional metadata + execute fn. Args type is the parameter of execute.
type Cmd<Args = void> = {
  title?: string
  description?: string
  key?: string                          // optional keybinding (only for zero-arg cmds)
  when?: () => boolean                  // predicate; closure captures plugin state
  execute: Args extends void
    ? () => void | Promise<void>
    : (args: Args) => void | Promise<void>
}

type CommandMap = Record<string, Cmd<any>>

// Extract args type from a Cmd.
type ArgsOf<C> =
  C extends Cmd<infer A> ? A :
  C extends { execute: (args: infer A) => any } ? A :
  C extends { execute: () => any } ? void :
  never

// Typed invoke: name ∈ keyof map; args match ArgsOf<map[name]>.
type Invoke<C extends CommandMap> = <N extends keyof C>(
  name: N,
  ...args: ArgsOf<C[N]> extends void ? [] : [ArgsOf<C[N]>]
) => void

// Helper for declaring commands with full inference via `satisfies`.
// Plugins use: const commands = defineCommands({ "todo.add": {execute: ...} })
const defineCommands = <const C extends CommandMap>(c: C): C => c

// ─── 4. App-chosen event types ──────────────────────────────────────────

type Key = { name: string; mods?: { ctrl?: boolean; alt?: boolean; shift?: boolean } }
type KeyEvent    = { kind: "key";    key: Key }
type PasteEvent  = { kind: "paste";  text: string }
type ResizeEvent = { kind: "resize"; w: number; h: number }
type AppEvent = KeyEvent | PasteEvent | ResizeEvent

type HasDispatch<E = AppEvent> = { dispatch(e: E): boolean }
type HasCommands<C extends CommandMap = CommandMap> = { commands: C; invoke: Invoke<C> }

// ─── 5. Seam plugins ────────────────────────────────────────────────────

const withDispatch = <E,>() => <A extends Dispose>(app: A): A & HasDispatch<E> =>
  Object.assign(app, { dispatch: (_e: E) => false })

// withCommands initializes the command registry as empty; feature plugins
// contribute by merging their typed command map into app.commands.
const withCommands = <A extends Dispose>(app: A): A & HasCommands<{}> =>
  Object.assign(app, {
    commands: {} as {},
    invoke: ((name: string, args: unknown) => {
      const cmd = (app as any).commands[name] as Cmd<any> | undefined
      if (!cmd) throw new Error(`unknown command: ${name}`)
      if (cmd.when && !cmd.when()) return
      cmd.execute(args as never)
    }) as Invoke<{}>,
  })

// Merge newly-declared commands into app.commands. This is the core trick:
// each plugin widens A['commands'] by its own map, type flows through the pipe.
const addCommands = <A extends HasCommands<any>, NewC extends CommandMap>(
  app: A,
  newCommands: NewC,
): A & HasCommands<A["commands"] & NewC> => {
  Object.assign(app.commands, newCommands)
  return app as any
}

// ─── 6. Provider abstraction ────────────────────────────────────────────

type Provider<S, E> = {
  state: S
  events: AsyncIterable<E>
  [Symbol.dispose](): void
}

const createFakeTerm = (script: AppEvent[]): Provider<{ size: Signal<[number, number]> }, AppEvent> => {
  const size = signal<[number, number]>([80, 24])
  let disposed = false
  async function* gen() { for (const e of script) { if (disposed) return; yield e } }
  return { state: { size }, events: gen(), [Symbol.dispose]() { disposed = true } }
}

type HasTerm = { term: { size: Signal<[number, number]> } }

const withTerm = (term: Provider<{ size: Signal<[number, number]> }, AppEvent>) =>
  <A extends Dispose & HasDispatch<AppEvent>>(app: A): A & HasTerm => {
    const prevDispose = app[Symbol.dispose].bind(app)
    return Object.assign(app, {
      term: { size: term.state.size },
      [Symbol.dispose]() { term[Symbol.dispose](); prevDispose() },
    })
  }

// ─── 7. Input transforms ────────────────────────────────────────────────

const withPaste = <A extends Dispose & HasDispatch<AppEvent>>(app: A): A => {
  const { dispatch } = app
  app.dispatch = (e) => {
    if (e.kind === "key" && e.key.name.length > 1 && e.key.name.startsWith("\x1b[200~")) {
      return dispatch({ kind: "paste", text: e.key.name.slice(6) })
    }
    return dispatch(e)
  }
  return app
}

// ─── 8. Focus (owned state + routing) ──────────────────────────────────

type HasFocus = { focus: { active: Signal<string | null>; set(id: string | null): void } }

const withFocus = <A extends Dispose & HasDispatch<AppEvent>>(app: A): A & HasFocus => {
  const active = signal<string | null>(null)
  return Object.assign(app, {
    focus: { active, set: (id: string | null) => active.set(id) },
  })
}

// ─── 9. Keymap — reads command .key fields, auto-binds ─────────────────

// Instead of `withKeymap({a: "todo.add"})`, keys come from command definitions.
// A command's `key: "j"` means pressing 'j' invokes it (no manual registry).
const withKeymap = <A extends Dispose & HasDispatch<AppEvent> & HasCommands<any>>(
  app: A,
): A => {
  const { dispatch } = app
  // Build key → cmd name index once (rebuilt if commands change after boot is not supported here).
  const buildIndex = (): Record<string, string> => {
    const idx: Record<string, string> = {}
    for (const [name, cmd] of Object.entries(app.commands)) {
      if ((cmd as Cmd).key) idx[(cmd as Cmd).key!] = name
    }
    return idx
  }

  app.dispatch = (e) => {
    if (e.kind !== "key") return dispatch(e)
    const idx = buildIndex()
    const name = idx[e.key.name]
    if (!name) return dispatch(e)
    const cmd = app.commands[name] as Cmd
    if (cmd.when && !cmd.when()) return dispatch(e)
    ;(app.invoke as any)(name)
    return true
  }
  return app
}

// ─── 10. Effect namespace ──────────────────────────────────────────────

const withEffectHandlers = <
  A extends Dispose & HasCommands<any>,
  H extends Record<`effect:${string}`, (args?: any) => void>,
>(handlers: H) => (app: A) => {
  const entries = Object.entries(handlers).map(([name, fn]) => [
    name,
    { execute: fn } as Cmd<any>,
  ])
  return addCommands(app, Object.fromEntries(entries) as { [K in keyof H]: Cmd<Parameters<H[K]>[0]> })
}

// ─── 11. Feature plugins — declarative commands ───────────────────────

type TodoItem = { id: string; text: string; done: boolean }
type HasTodo = {
  todo: { items: Signal<TodoItem[]>; add(text: string): void; toggle(id: string): void }
}

let __id = 0
const nextId = () => `t${++__id}`

const withTodo = <A extends Dispose & HasCommands<any>>(app: A) => {
  const items = signal<TodoItem[]>([])
  const add = (text: string) =>
    items.set([...items.get(), { id: nextId(), text, done: false }])
  const toggle = (id: string) =>
    items.set(items.get().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

  const commands = defineCommands({
    "todo.add":       { title: "Add todo",    execute: (args: { text: string }) => add(args.text) },
    "todo.toggle":    { title: "Toggle todo", execute: (args: { id: string })   => toggle(args.id) },
    "todo.clear-all": { title: "Clear all",   execute: () => items.set([]) },
  })
  const next = Object.assign(app, { todo: { items, add, toggle } })
  return addCommands(next, commands) as typeof next & HasCommands<A["commands"] & typeof commands> & HasTodo
}

type HasHelp = { help: { open: Signal<boolean> } }

const withHelp = <A extends Dispose & HasCommands<any>>(app: A) => {
  const open = signal(false)
  const commands = defineCommands({
    "help.open":  { title: "Open help",  key: "?",      execute: () => open.set(true) },
    "help.close": { title: "Close help", key: "escape", when: () => open.get(), execute: () => open.set(false) },
  })
  const next = Object.assign(app, { help: { open } })
  return addCommands(next, commands) as typeof next & HasCommands<A["commands"] & typeof commands> & HasHelp
}

// ─── 12. Cross-cutting: trace (wraps invoke + dispatch) ───────────────

type TraceEntry =
  | { t: "d"; event: AppEvent }
  | { t: "i"; name: string; args?: unknown }

const withTrace = <A extends Dispose & HasDispatch<AppEvent> & HasCommands<any>>(app: A) => {
  const log: TraceEntry[] = []
  const { dispatch, invoke } = app as A & { invoke: (name: string, args?: unknown) => void }
  app.dispatch = (e) => { log.push({ t: "d", event: e }); return dispatch(e) }
  ;(app as any).invoke = (name: string, args?: unknown) => {
    log.push({ t: "i", name, args })
    invoke(name, args)
  }
  return Object.assign(app, { trace: log }) as A & { trace: TraceEntry[] }
}

// ─── 13. Cross-cutting: mock effects (test only) ──────────────────────

const withMockEffects = <A extends Dispose & HasCommands<any>>(app: A) => {
  const effectLog: Array<{ name: string; args?: unknown }> = []
  const { invoke } = app as A & { invoke: (name: string, args?: unknown) => void }
  ;(app as any).invoke = (name: string, args?: unknown) => {
    if (name.startsWith("effect:")) { effectLog.push({ name, args }); return }
    invoke(name, args)
  }
  return Object.assign(app, { effectLog }) as A & { effectLog: Array<{ name: string; args?: unknown }> }
}

// ─── 14. Third-party plugin — declarative vim modal ───────────────────

type HasVim = { vim: { mode: Signal<"normal" | "insert"> } }

const withVim = <A extends Dispose & HasDispatch<AppEvent> & HasCommands<any>>(app: A) => {
  const mode = signal<"normal" | "insert">("normal")
  const { dispatch } = app
  app.dispatch = (e) => {
    if (e.kind !== "key") return dispatch(e)
    if (mode.get() === "normal" && e.key.name === "i") { mode.set("insert"); return true }
    if (mode.get() === "insert" && e.key.name === "escape") { mode.set("normal"); return true }
    return dispatch(e)
  }
  const commands = defineCommands({
    "vim.normal": { title: "Enter normal mode", execute: () => mode.set("normal") },
    "vim.insert": { title: "Enter insert mode", execute: () => mode.set("insert") },
  })
  const next = Object.assign(app, { vim: { mode } })
  return addCommands(next, commands) as typeof next & HasCommands<A["commands"] & typeof commands> & HasVim
}

// ─── 15. Boot — full composition ──────────────────────────────────────

async function main() {
  using term = createFakeTerm([
    { kind: "key", key: { name: "?" } },           // → help.open (via keymap)
    { kind: "key", key: { name: "escape" } },      // → help.close (via keymap, when: help.open)
    { kind: "key", key: { name: "i" } },           // → vim insert
    { kind: "key", key: { name: "escape" } },      // → vim normal (takes priority over help.close since help closed)
  ])

  using app = pipe(
    scope(),
    withDispatch<AppEvent>(),
    withCommands,
    withTerm(term),
    withPaste,
    withFocus,
    withEffectHandlers({
      "effect:render": () => console.log("[render]"),
      "effect:exit":   (args: { code: number }) => console.log(`[exit ${args.code}]`),
    }),
    withTodo,
    withHelp,
    withVim,
    withKeymap,          // reads .key fields from all commands above
    withTrace,
  )

  // ─── Typed invoke demonstrations ────────────────────────────────────
  // All three lines below are fully type-checked:
  app.invoke("todo.add", { text: "buy milk" })       // ✓ args: {text: string}
  app.invoke("todo.add", { text: "write tests" })    // ✓
  app.invoke("todo.clear-all")                       // ✓ no args
  app.invoke("effect:render")                        // ✓ registered via withEffectHandlers
  // app.invoke("todo.add", { id: "x" })             // ✗ would fail: args shape wrong
  // app.invoke("nonexistent")                       // ✗ would fail: not in commands map

  // ─── Dispatch events through the pipe ───────────────────────────────
  for await (const e of term.events) app.dispatch(e)

  console.log("\ntodos:       ", app.todo.items.get())
  console.log("help open:   ", app.help.open.get())
  console.log("vim mode:    ", app.vim.mode.get())
  console.log("term size:   ", app.term.size.get())
  console.log("trace count: ", app.trace.length)
  console.log("commands:    ", Object.keys(app.commands).sort())
}

// ─── 16. Test variant ─────────────────────────────────────────────────

async function test() {
  using term = createFakeTerm([
    { kind: "key", key: { name: "?" } },        // help.open
    { kind: "key", key: { name: "escape" } },   // help.close (when predicate satisfied)
  ])

  using app = pipe(
    scope(),
    withDispatch<AppEvent>(),
    withCommands,
    withTerm(term),
    withFocus,
    withTodo,
    withHelp,
    withKeymap,
    withMockEffects,      // swap in place of withEffectHandlers
    withTrace,
  )

  // Invoke with mock effects — effect:* routes to effectLog instead of handler
  app.invoke("effect:write" as any, { path: "/tmp/x" })   // cast: effect not registered as Cmd
  app.invoke("todo.add", { text: "test-one" })

  for await (const e of term.events) app.dispatch(e)

  const assert = (cond: boolean, msg: string) => {
    if (!cond) { console.error("FAIL:", msg); process.exit(1) }
    console.log("PASS:", msg)
  }
  assert(app.help.open.get() === false,               "help closed by escape keymap")
  assert(app.todo.items.get().length === 1,           "todo added via invoke")
  assert(app.todo.items.get()[0].text === "test-one", "todo text correct")
  assert(app.effectLog.length === 1,                  "effect recorded by mock")
  assert(app.effectLog[0].name === "effect:write",    "mock captured effect name")
  assert(app.trace.some((t) => t.t === "i" && t.name === "help.open"),  "trace captured help.open invoke")
  assert(app.trace.some((t) => t.t === "i" && t.name === "help.close"), "trace captured help.close invoke")
  console.log("\nall assertions passed.")
}

// ─── 17. Compile-time ordering/inference demo (uncomment to see errors) ───
//
// (a) Wrong arg shape:
//   app.invoke("todo.add", { id: "x" })
//   // Error: Argument of type '{ id: string; }' is not assignable to parameter of type '{ text: string; }'
//
// (b) Unknown command:
//   app.invoke("todo.nuke-all")
//   // Error: Argument of type '"todo.nuke-all"' is not assignable to parameter of type 'keyof Commands'
//
// (c) withKeymap before commands contributed:
//   using broken = pipe(scope(), withDispatch<AppEvent>(), withCommands, withKeymap, withTodo)
//   // Works but keymap was built before todo commands registered — runtime order bug.
//   // Cure: put withKeymap AFTER all feature plugins. Documented; future version may lazy-rebuild index.

// ─── 18. Entry ────────────────────────────────────────────────────────

if (process.argv.includes("--test")) { await test() } else { await main() }

export {}
