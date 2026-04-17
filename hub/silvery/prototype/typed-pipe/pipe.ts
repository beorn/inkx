/**
 * Era2b Typed Composition Prototype
 *
 * Question: can pipe(create(), withScope(), withChat()) type-check requirements
 * and infer additions without manual type annotations?
 *
 * Answer: YES with overloaded pipe or builder chain. Both infer everything
 * from the plugin's generic constraint + return type. No `Plugin<Req, Add>` needed.
 *
 * Run: cd /Users/beorn/Code/pim/km && bunx tsc --noEmit --strict vendor/silvery-internal/prototype/typed-pipe/pipe.ts
 */

// =============================================================================
// Domain types
// =============================================================================

interface Scope {
  cancelled: boolean
  timeout(ms: number, fn: () => void): () => void
  [Symbol.dispose](): void
}

interface CommandTree {
  [ns: string]: { [name: string]: { fn: (...args: any[]) => any } }
}

interface ChatModel {
  messages(): string[]
  submit(text: string): void
}

interface AIProvider {
  generate(prompt: string): AsyncGenerator<string>
}

// =============================================================================
// Base app
// =============================================================================

interface AppBase {
  defer(fn: () => void): void
  quit(): void
}

function create(): AppBase {
  const cleanups: (() => void)[] = []
  return {
    defer(fn) {
      cleanups.push(fn)
    },
    quit() {
      for (const fn of cleanups) fn()
    },
  }
}

// =============================================================================
// Plugins — generic functions. Constraint = requirement. Return = addition.
//
// NOTHING is manually annotated as Plugin<Req, Add>. TypeScript infers
// both the requirement and the addition from the function signature.
// =============================================================================

function withScope(scope: Scope) {
  return <A extends AppBase>(app: A) => {
    return { ...app, scope }
  }
}

function withCommands() {
  return <A extends AppBase>(app: A) => {
    return { ...app, commands: {} as CommandTree, keymap(_b: Record<string, any>) {} }
  }
}

function withChat(opts: { ai: AIProvider }) {
  return <A extends AppBase & { scope: Scope; commands: CommandTree }>(app: A) => {
    void opts // used at runtime
    return { ...app, chat: { messages: (): string[] => [], submit(_text: string) {} } }
  }
}

function withKeymap() {
  return <A extends AppBase & { commands: CommandTree; chat: ChatModel }>(app: A) => {
    return app
  }
}

// =============================================================================
// Approach 1: Overloaded pipe
//
// TypeScript instantiates each generic at each overload step.
// 5-6 overloads covers silvery's realistic use case (~10 plugins max).
// Each overload adds one type variable that chains to the next.
// =============================================================================

function pipe<A>(a: A): A
function pipe<A, B>(a: A, f1: (a: A) => B): B
function pipe<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C
function pipe<A, B, C, D>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D
function pipe<A, B, C, D, E>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E): E
function pipe<A, B, C, D, E, F>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
): F
function pipe<A, B, C, D, E, F, G>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
): G
function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
): H
function pipe(initial: any, ...fns: ((arg: any) => any)[]): any {
  return fns.reduce((acc, fn) => fn(acc), initial)
}

// =============================================================================
// Approach 2: Builder chain — zero overloads, infinite chain, perfect types
//
// Same generic instantiation as overloaded pipe, but via method chaining.
// .then() is a single generic method — no overload limit.
// =============================================================================

interface PipeBuilder<T> {
  then<U>(fn: (value: T) => U): PipeBuilder<U>
  build(): T
}

function from<T>(value: T): PipeBuilder<T> {
  return {
    then<U>(fn: (value: T) => U): PipeBuilder<U> {
      return from(fn(value))
    },
    build(): T {
      return value
    },
  }
}

// =============================================================================
// Why variadic pipe() doesn't work with generic plugins
//
// Each plugin is generic: <A extends Req>(app: A) => A & Add
// TypeScript's ReturnType<> instantiates with the constraint, not the
// accumulated type. So the chain loses track of prior additions:
//
//   ReturnType<typeof withScope_result>  = AppBase & { scope }      ← correct
//   ReturnType<typeof withCommands_result> = AppBase & { commands } ← LOST scope!
//
// The overloaded pipe and builder avoid this because TypeScript instantiates
// each generic with the ACTUAL type from the previous step, not the constraint.
//
// A variadic pipe WOULD work if plugins used phantom type metadata instead
// of generics, but that changes the plugin API. Not worth it when 8 overloads
// or builder chain solve the problem cleanly.
// =============================================================================

// =============================================================================
// TESTS: Valid compositions
// =============================================================================

declare const scope: Scope
declare const ai: AIProvider

// --- Overloaded pipe: full chain ---
const app1 = pipe(create(), withScope(scope), withCommands(), withChat({ ai }), withKeymap())

// TypeScript knows the full accumulated type:
app1.chat.submit("hello") // ✓ chat exists
app1.scope.timeout(100, () => {}) // ✓ scope exists
app1.commands // ✓ commands exists
app1.quit() // ✓ base methods preserved

// --- Builder chain: same thing, no overloads ---
const app2 = from(create())
  .then(withScope(scope))
  .then(withCommands())
  .then(withChat({ ai }))
  .then(withKeymap())
  .build()

app2.chat.submit("hello")
app2.scope.timeout(100, () => {})
app2.commands

// =============================================================================
// TESTS: Invalid compositions — requirement checking
// =============================================================================

// --- Missing scope (withChat requires { scope: Scope }) ---

// @ts-expect-error — withChat needs scope, but only commands exist
const bad1 = pipe(create(), withCommands(), withChat({ ai }))

// @ts-expect-error — same with builder
const bad2 = from(create()).then(withCommands()).then(withChat({ ai })).build()

// --- Wrong order (withKeymap before withChat) ---

// @ts-expect-error — withKeymap needs chat
const bad3 = pipe(create(), withScope(scope), withCommands(), withKeymap())

// @ts-expect-error — same with builder
const bad4 = from(create()).then(withScope(scope)).then(withCommands()).then(withKeymap()).build()

// --- Completely wrong (withChat with no setup at all) ---

// @ts-expect-error — withChat needs scope AND commands
const bad5 = pipe(create(), withChat({ ai }))

// =============================================================================
// TESTS: Type inference — verify return types are correct
// =============================================================================

// These would fail at compile time if types are wrong:
const _check1: ChatModel = app1.chat
const _check2: Scope = app1.scope
const _check3: CommandTree = app1.commands
const _check4: ChatModel = app2.chat
const _check5: Scope = app2.scope

// =============================================================================
// Summary
//
// Q: Can we infer additions and check requirements without manual Plugin<R,A>?
// A: Yes. Generic plugins do it all:
//      <A extends { scope: Scope }>(app: A) => A & { chat: ChatModel }
//             ^^^^^^^^^^^^^^^^ checked        ^^^^^^^^^^^^^^^^ inferred
//
// Q: Overloads vs builder?
// A: Overloads are simpler to use (pipe(a, f, g)) but cap at ~8-10 plugins.
//    Builder has no limit (from(a).then(f).then(g)) but slightly different syntax.
//    Both work identically for requirement checking.
//
// Q: Why not variadic pipe (zero overloads, pipe syntax)?
// A: TypeScript can't instantiate generics inside mapped/conditional types.
//    ReturnType<genericFn> uses the constraint, not the accumulated type.
//    This is a known TS limitation — no higher-kinded types.
//
// Recommendation for silvery:
//    pipe() with 8 overloads. Covers all realistic apps.
//    Builder as escape hatch if someone needs >8 plugins.
// =============================================================================

export { pipe, from, create, withScope, withCommands, withChat, withKeymap }
