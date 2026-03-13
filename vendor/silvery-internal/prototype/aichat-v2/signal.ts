/**
 * Minimal signal + createModel implementation for the prototype.
 *
 * In production, these would come from `import { signal, createModel } from "silvery"`.
 *
 * Three layers:
 * - Layer 1: signal<T>() — fine-grained reactive state cells
 * - Layer 2: createModel(factory) — wraps factory → typed hook + namespace
 * - Layer 3: useChat(selector) — signal-aware selector with auto-unwrapping
 */

import { useSyncExternalStore } from "react"

type Listener = () => void

export interface Signal<T> {
  readonly value: T
  subscribe(fn: Listener): () => void
}

export interface WritableSignal<T> extends Signal<T> {
  value: T
}

// ── Layer 1: Signal Primitive ──────────────────────────────────

export function signal<T>(initial: T): WritableSignal<T> {
  let current = initial
  const listeners = new Set<Listener>()
  return {
    get value() {
      return current
    },
    set value(next: T) {
      current = next
      for (const fn of listeners) fn()
    },
    subscribe(fn: Listener) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}

/** React hook — subscribe to a signal reactively via useSyncExternalStore. */
export function useSignal<T>(sig: Signal<T>): T {
  return useSyncExternalStore(
    (cb) => sig.subscribe(cb),
    () => sig.value,
  )
}

// ── Layer 2: createModel ───────────────────────────────────────

/** Check if a value looks like a Signal (has .value + .subscribe). */
function isSignal(v: unknown): v is Signal<unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    "value" in v &&
    "subscribe" in v &&
    typeof (v as any).subscribe === "function"
  )
}

/**
 * Create a read-only proxy that auto-unwraps signal fields.
 * `proxy.phase` returns the signal's current value, not the signal itself.
 * Non-signal fields (methods, constants) pass through unchanged.
 */
function createUnwrappingProxy<T extends Record<string, any>>(obj: T): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver)
      if (isSignal(val)) return val.value
      return val
    },
  })
}

/**
 * Subscribe to ALL signals in a model instance.
 * When any signal changes, the callback fires.
 *
 * In production, this would use dependency tracking (subscribe only to
 * signals the selector actually reads). For the prototype, subscribing
 * to all signals is simpler and sufficient.
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
 * createModel — wraps a factory function into a Zustand-like typed hook.
 *
 * Returns a callable selector hook + namespace:
 * - `useChat(m => m.phase)` — signal-aware selector (auto-unwraps signals)
 * - `useChat.get()` — direct access to raw instance (with signal fields)
 * - `useChat.create(...args)` — create isolated instance (for tests)
 * - `useChat.bind(...args)` — initialize the singleton with args
 *
 * If the factory takes no arguments, the singleton is created immediately.
 * If it takes arguments, call `.bind(args)` or pass to `createApp()` first.
 */
export function createModel<A extends any[], T extends Record<string, any>>(
  factory: (...args: A) => T,
): ModelHook<A, T> {
  let instance: T | null = null

  // The hook: callable as a React selector
  function useHook<U>(selector: (model: T) => U): U {
    if (!instance) throw new Error("Model not initialized — call .bind() first")
    const inst = instance
    const unwrapped = createUnwrappingProxy(inst)
    return useSyncExternalStore(
      (cb) => subscribeToAllSignals(inst, cb),
      () => selector(unwrapped),
    )
  }

  /** Direct access to the raw model instance (signals are NOT unwrapped). */
  useHook.get = (): T => {
    if (!instance) throw new Error("Model not initialized — call .bind() first")
    return instance
  }

  /** Create an isolated instance — for tests. Does not affect the singleton. */
  useHook.create = (...args: A): T => factory(...args)

  /** Initialize the singleton with arguments. */
  useHook.bind = (...args: A): T => {
    instance = factory(...args)
    return instance
  }

  // Zero-arg factory: auto-initialize
  if (factory.length === 0) {
    instance = (factory as () => T)()
  }

  return useHook as ModelHook<A, T>
}

/** The type returned by createModel — callable hook + namespace methods. */
export interface ModelHook<A extends any[], T> {
  /** Signal-aware selector hook for React — auto-unwraps signals. */
  <U>(selector: (model: T) => U): U
  /** Direct access to the raw instance (signals NOT unwrapped). */
  get(): T
  /** Create an isolated instance for testing. */
  create(...args: A): T
  /** Initialize the singleton with arguments. */
  bind(...args: A): T
}
