/**
 * Structured concurrency — scoped timers and lifecycle.
 *
 * A scope owns pending timers. When disposed, all timers cancel
 * and pending sleeps resolve immediately. The `using` keyword
 * ensures cleanup even on early exit.
 *
 * The current scope is ambient via AsyncLocalStorage — no need to
 * thread it through function arguments. `useScope()` retrieves it.
 *
 * Same pattern at every level: app scope → model scope → keymap-local scope.
 */

import { AsyncLocalStorage } from "node:async_hooks"

type Pending = { id: ReturnType<typeof setTimeout>; resolve: () => void }

const scopeStorage = new AsyncLocalStorage<Scope>()

export interface Scope extends Disposable {
  /** True after disposal — loops should check this after each await. */
  readonly cancelled: boolean

  /** Cancellable delay. Resolves immediately if scope is disposed. */
  sleep(ms: number): Promise<void>

  /** Cancellable timer. Returns cancel function. Skipped if scope is disposed. */
  timeout(ms: number, fn: () => void): () => void

  /** Register a cleanup callback — runs on dispose. */
  onDispose(fn: () => void): void
}

export function createScope(): Scope {
  const pending = new Set<Pending>()
  const cleanups: (() => void)[] = []
  let cancelled = false

  return {
    get cancelled() {
      return cancelled
    },

    sleep(ms) {
      return new Promise<void>((resolve) => {
        if (cancelled) {
          resolve()
          return
        }
        const entry: Pending = {
          id: setTimeout(() => {
            pending.delete(entry)
            resolve()
          }, ms),
          resolve,
        }
        pending.add(entry)
      })
    },

    timeout(ms, fn) {
      if (cancelled) return () => {}
      const entry: Pending = {
        id: setTimeout(() => {
          pending.delete(entry)
          fn()
        }, ms),
        resolve: () => {},
      }
      pending.add(entry)
      return () => {
        clearTimeout(entry.id)
        pending.delete(entry)
      }
    },

    onDispose(fn) {
      if (cancelled) fn()
      else cleanups.push(fn)
    },

    [Symbol.dispose]() {
      cancelled = true
      for (const { id, resolve } of pending) {
        clearTimeout(id)
        resolve()
      }
      pending.clear()
      for (const fn of cleanups) fn()
      cleanups.length = 0
    },
  }
}

/** Retrieve the current scope from AsyncLocalStorage. */
export function useScope(): Scope {
  const scope = scopeStorage.getStore()
  if (!scope) throw new Error("No scope — call runInScope() first")
  return scope
}

/** Run a function within a scope's AsyncLocalStorage context. */
export function runInScope<T>(scope: Scope, fn: () => T): T {
  return scopeStorage.run(scope, fn)
}
