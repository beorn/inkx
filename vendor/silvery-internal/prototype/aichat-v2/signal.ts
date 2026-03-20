/**
 * Minimal signal + createModel implementation for the prototype.
 *
 * In production, these would come from separate packages:
 * - signal(), computed()   → `@silvery/signals` (plural — Decision 35; alien-signals under the hood)
 * - createModel(factory)   → `@silvery/model` (optional — model factories with explicit DI)
 * - useSignal()            → `@silvery/signals/react` (React hook for signal subscription)
 *
 * Key design points (Decisions 26, 29, 34, 35):
 * - Signals use the callable accessor pattern: count() to read, count(5) to write
 *   (same as alien-signals, Angular, SolidJS — NOT .value like Vue/Preact) (Decision 29)
 * - Signals are OPTIONAL — commands work without them (Decision 34)
 * - @silvery/signals wraps alien-signals (~1.8KB) — fastest implementation (Decision 26)
 * - @silvery/model depends on @silvery/signals — fully optional (Decision 34)
 * - createModel passes a context object to the factory — the model receives
 *   its runtime dependencies explicitly, not via ambient lookup
 *
 * This file inlines what would be @silvery/signals + @silvery/model + @silvery/signals/react
 * for prototype simplicity.
 */

import { useSyncExternalStore } from "react"
import type { Scope } from "./scope.js"

type Listener = () => void

/**
 * Signal accessor — callable function pattern.
 *
 * Read:  count()     → returns current value
 * Write: count(5)    → sets value, notifies subscribers
 *
 * Also exposes .subscribe() for external consumers (React hooks, plugins).
 */
export interface Signal<T> {
  /** Read the current value. */
  (): T
  subscribe(fn: Listener): () => void
}

export interface WritableSignal<T> extends Signal<T> {
  /** Write a new value (callable with argument). */
  (value: T): void
}

// ── Layer 0: Signal Primitive ──────────────────────────────────
// Production: @silvery/signals (plural — Decision 35; re-exports alien-signals ~1.8KB — Decision 26)

export function signal<T>(initial: T): WritableSignal<T> {
  let current = initial
  const listeners = new Set<Listener>()

  // Callable accessor: sig() to read, sig(value) to write
  const sig = (...args: [] | [T]): T => {
    if (args.length === 0) return current
    current = args[0]
    for (const fn of listeners) fn()
    return current
  }

  sig.subscribe = (fn: Listener) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  return sig as WritableSignal<T>
}

/**
 * React hook — subscribe to a signal reactively via useSyncExternalStore.
 *
 * Production: @silvery/signals/react provides this hook.
 * Also available via @silvery/ag-react which re-exports it.
 */
export function useSignal<T>(sig: Signal<T>): T {
  return useSyncExternalStore(
    (cb) => sig.subscribe(cb),
    () => sig(),
  )
}

// ── Layer 3: createModel ───────────────────────────────────────
// Production: @silvery/model (optional package — depends on @silvery/signals — Decision 34)

/**
 * Context passed to model factories by createModel.
 *
 * The model receives its runtime dependencies explicitly — no ambient
 * lookup via useScope() or AsyncLocalStorage. This makes models testable
 * (pass a test scope) and composable (multiple models share an app scope).
 */
export interface ModelContext {
  scope: Scope
}

/** Check if a value looks like a Signal (callable with .subscribe). */
function isSignal(v: unknown): v is Signal<unknown> {
  return typeof v === "function" && "subscribe" in v && typeof (v as any).subscribe === "function"
}

/**
 * Subscribe to ALL signals in a model instance.
 * When any signal changes, the callback fires.
 *
 * In production, @silvery/signals would use dependency tracking (subscribe
 * only to signals the selector actually reads). For the prototype,
 * subscribing to all signals is simpler and sufficient.
 */
function subscribeToAllSignals(instance: Record<string, any>, callback: () => void): () => void {
  const unsubs: (() => void)[] = []
  for (const val of Object.values(instance)) {
    if (isSignal(val)) {
      unsubs.push(val.subscribe(callback))
    }
  }
  return () => unsubs.forEach((fn) => fn())
}

/**
 * createModel — wraps a factory function into a typed hook.
 *
 * Production: @silvery/model provides this. It's an opinionated layer
 * on top of @silvery/signals — fully optional (Decision 34).
 *
 * The factory receives a ModelContext (scope) as its first argument,
 * followed by any domain-specific args. This matches the design:
 *
 *   const useChat = createModel((ctx, script) => { ... })
 *   useChat.bind({ scope }, script)       // main.tsx
 *   useChat.create({ scope }, script)     // tests
 *
 * Returns a callable selector hook + namespace:
 * - `useChat(m => m.phase())` — selector calls accessors explicitly (Decision 29)
 * - `useChat.get()` — direct access to raw instance
 * - `useChat.create(ctx, ...args)` — create isolated instance (for tests)
 * - `useChat.bind(ctx, ...args)` — initialize the singleton with args
 */
export function createModel<A extends any[], T extends Record<string, any>>(
  factory: (ctx: ModelContext, ...args: A) => T,
): ModelHook<A, T> {
  let instance: T | null = null

  // The hook: callable as a React selector
  // With callable accessors, selectors call sig() explicitly — no auto-unwrapping needed (Decision 29)
  function useHook<U>(selector: (model: T) => U): U {
    if (!instance) throw new Error("Model not initialized — call .bind() first")
    const inst = instance
    return useSyncExternalStore(
      (cb) => subscribeToAllSignals(inst, cb),
      () => selector(inst),
    )
  }

  /** Direct access to the raw model instance. */
  useHook.get = (): T => {
    if (!instance) throw new Error("Model not initialized — call .bind() first")
    return instance
  }

  /** Create an isolated instance — for tests. Does not affect the singleton. */
  useHook.create = (ctx: ModelContext, ...args: A): T => factory(ctx, ...args)

  /** Initialize the singleton with arguments. */
  useHook.bind = (ctx: ModelContext, ...args: A): T => {
    instance = factory(ctx, ...args)
    return instance
  }

  return useHook as ModelHook<A, T>
}

/** The type returned by createModel — callable hook + namespace methods. */
export interface ModelHook<A extends any[], T> {
  /** Selector hook for React — selectors call accessors explicitly. */
  <U>(selector: (model: T) => U): U
  /** Direct access to the raw instance. */
  get(): T
  /** Create an isolated instance for testing. */
  create(ctx: ModelContext, ...args: A): T
  /** Initialize the singleton with arguments. */
  bind(ctx: ModelContext, ...args: A): T
}
