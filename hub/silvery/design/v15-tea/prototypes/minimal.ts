// Minimal plugin-composition prototype — the barest possible proof.
// Shows: scope+pipe, with*(app), signals, cross-layer types, LIFO dispose.
// NO commands, NO events union, NO providers, NO effects namespace.
// The point: prove that the plugin PATTERN works in <100 LOC. Everything else
// (commands, effects, providers) is additive — see plugin-composition-canonical.ts.
//
// Run: bun run hub/silvery/prototype/plugin-composition-minimal.ts

// ─── Framework (12 LOC) ─────────────────────────────────────────────────

type Dispose = { [Symbol.dispose](): void }

const scope = <T extends object = {}>(base: T = {} as T): T & Dispose =>
  Object.assign(base, { [Symbol.dispose]() {} })

type Fn<A, B> = (a: A) => B
function pipe<A>(a: A): A
function pipe<A, B>(a: A, ab: Fn<A, B>): B
function pipe<A, B, C>(a: A, ab: Fn<A, B>, bc: Fn<B, C>): C
function pipe<A, B, C, D>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>): D
function pipe<A, B, C, D, E>(a: A, ab: Fn<A, B>, bc: Fn<B, C>, cd: Fn<C, D>, de: Fn<D, E>): E
function pipe(x: unknown, ...fns: Array<Fn<unknown, unknown>>): unknown {
  return fns.reduce((v, f) => f(v), x)
}

// ─── Signal (10 LOC; real = alien-signals) ──────────────────────────────

type Signal<T> = { get(): T; set(v: T): void }

const signal = <T>(initial: T): Signal<T> => {
  let v = initial
  return { get: () => v, set: (next) => { v = next } }
}

// ─── Seam: one method plugins wrap ──────────────────────────────────────

type HasInput = { input(line: string): void }

const withInput = <A extends Dispose>(app: A): A & HasInput =>
  Object.assign(app, { input: (_line: string) => {} })   // baseline no-op

// ─── Plugin 1: history (owns state) ─────────────────────────────────────

type HasHistory = { history: { lines: Signal<string[]> } }

const withHistory = <A extends Dispose & HasInput>(app: A): A & HasHistory => {
  const lines = signal<string[]>([])
  const { input } = app
  app.input = (line) => { lines.set([...lines.get(), line]); input(line) }
  return Object.assign(app, { history: { lines } })
}

// ─── Plugin 2: uppercase transformer (wraps input, transforms arg) ──────

const withUppercase = <A extends Dispose & HasInput>(app: A): A => {
  const { input } = app
  app.input = (line) => input(line.toUpperCase())
  return app
}

// ─── Plugin 3: echo (observer, prints to console) ───────────────────────

const withEcho = <A extends Dispose & HasInput>(app: A): A => {
  const { input } = app
  app.input = (line) => { console.log(`> ${line}`); input(line) }
  return app
}

// ─── Plugin 4: count (owns state, wraps dispose to report on exit) ─────

type HasCount = { count: Signal<number> }

const withCount = <A extends Dispose & HasInput>(app: A): A & HasCount => {
  const count = signal(0)
  const { input } = app
  app.input = (line) => { count.set(count.get() + 1); input(line) }
  const prevDispose = app[Symbol.dispose].bind(app)
  return Object.assign(app, {
    count,
    [Symbol.dispose]() {
      console.log(`[withCount] processed ${count.get()} lines`)
      prevDispose()
    },
  })
}

// ─── Boot ───────────────────────────────────────────────────────────────

function main() {
  // Layer order matters: uppercase transforms BEFORE echo logs it.
  // Swap the order → echo prints lowercase, history stores uppercase.
  using app = pipe(
    scope(),
    withInput,
    withUppercase,   // runs first (outermost wrapper)
    withEcho,        // sees uppercase
    withHistory,     // stores uppercase
    withCount,
  )

  app.input("hello")
  app.input("world")
  app.input("pipe composition")

  console.log("\nhistory:", app.history.lines.get())
  console.log("count signal:", app.count.get())

  // `using` disposes app here — LIFO order, so withCount's report fires first.
}

main()

export {}
