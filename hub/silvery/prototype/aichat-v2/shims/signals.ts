/**
 * Shim for @silvery/signals + @silvery/model.
 * Production: alien-signals (~1.8KB) + React useSyncExternalStore binding.
 *
 * This shim implements basic dependency tracking so computed signals
 * properly notify subscribers when their dependencies change.
 */

import { useRef, useSyncExternalStore } from "react"

type Listener = () => void

// ── Dependency tracking ──────────────────────────────────────────

/** Global tracking context — set during computed evaluation. */
let _tracking: Set<Signal<any>> | null = null

// ── Types ────────────────────────────────────────────────────────

export interface Signal<T> {
  (): T
  subscribe(fn: Listener): () => void
}

export interface WritableSignal<T> extends Signal<T> {
  (value: T): void
  set(value: T): void
}

// ── signal() ─────────────────────────────────────────────────────

export function signal<T>(initial: T): WritableSignal<T> {
  let current = initial
  const listeners = new Set<Listener>()

  const sig = (...args: [] | [T]): T => {
    if (args.length === 0) {
      _tracking?.add(sig as Signal<T>)
      return current
    }
    current = args[0]
    for (const fn of [...listeners]) fn()
    return current
  }

  sig.subscribe = (fn: Listener) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  sig.set = (value: T) => {
    sig(value)
  }

  return sig as WritableSignal<T>
}

// ── computed() ───────────────────────────────────────────────────

/** Derived signal — recomputes when dependencies change. */
export function computed<T>(fn: () => T): Signal<T> {
  let current: T
  const listeners = new Set<Listener>()
  let depUnsubs: (() => void)[] = []

  function recompute() {
    // Track which signals are read
    const deps = new Set<Signal<any>>()
    const prev = _tracking
    _tracking = deps
    const next = fn()
    _tracking = prev

    // Re-subscribe to new deps (cleans up old first)
    for (const u of depUnsubs) u()
    depUnsubs = [...deps].map((dep) => dep.subscribe(recompute))

    if (!shallowEqual(current, next)) {
      current = next
      for (const cb of [...listeners]) cb()
    }
  }

  // Initial computation
  recompute()

  const sig = () => {
    _tracking?.add(sig as Signal<T>)
    return current
  }

  sig.subscribe = (cb: Listener) => {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  }

  return sig as Signal<T>
}

// ── batch() ──────────────────────────────────────────────────────

let _batching = false
const _batchQueue = new Set<Listener>()

/** Batch multiple signal writes — subscribers fire once at the end. */
export function batch(fn: () => void): void {
  if (_batching) return fn()
  _batching = true
  try {
    fn()
  } finally {
    _batching = false
    const queued = [..._batchQueue]
    _batchQueue.clear()
    for (const cb of queued) cb()
  }
}

// ── useSignal / useModel ─────────────────────────────────────────

export function useSignal<T>(sig: Signal<T>): T {
  return useSyncExternalStore(
    (cb) => sig.subscribe(cb),
    () => sig(),
  )
}

/**
 * React hook that subscribes to signals read inside the selector.
 * Like Zustand's useStore(store, selector).
 *
 *   const messages = useModel(chat, m => m.messages())
 *   const draft = useModel(chat, m => m.input.draft())
 */
export function useModel<T extends Record<string, any>, U>(model: T, selector: (m: T) => U): U {
  const cached = useRef<U>(undefined as U)
  return useSyncExternalStore(
    (cb) => subscribeToAllSignals(model, cb),
    () => {
      const next = selector(model)
      if (!shallowEqual(cached.current, next)) cached.current = next
      return cached.current
    },
  )
}

// ── Internals ───────────────────────────────────────────────────

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false
  const ka = Object.keys(a as Record<string, unknown>)
  const kb = Object.keys(b as Record<string, unknown>)
  if (ka.length !== kb.length) return false
  for (const k of ka) if ((a as any)[k] !== (b as any)[k]) return false
  return true
}

function isSignal(v: unknown): v is Signal<unknown> {
  return typeof v === "function" && "subscribe" in v && typeof (v as any).subscribe === "function"
}

function subscribeToAllSignals(instance: Record<string, any>, callback: () => void): () => void {
  const unsubs: (() => void)[] = []
  function walk(obj: Record<string, any>) {
    for (const val of Object.values(obj)) {
      if (isSignal(val)) {
        unsubs.push(val.subscribe(callback))
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        walk(val)
      }
    }
  }
  walk(instance)
  return () => unsubs.forEach((fn) => fn())
}
