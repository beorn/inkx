/**
 * Structured concurrency — scoped timers and lifecycle.
 *
 * Production: `@silvery/scope` (zero dependencies).
 * Also provides: withScope(), createScope(), currentScope().
 *
 * A scope owns pending timers. When disposed, all timers cancel
 * and pending sleeps resolve immediately. The `using` keyword
 * ensures cleanup even on early exit.
 *
 * Scope is passed explicitly via ModelContext — no ambient lookup,
 * no AsyncLocalStorage. This makes models testable (pass a test scope)
 * and composable (multiple models share an app scope).
 *
 * Same pattern at every level: app scope → model scope → keymap-local scope.
 *
 * This file inlines what would be @silvery/scope for prototype simplicity.
 */

type Pending = { id: ReturnType<typeof setTimeout>; resolve: () => void }

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
      if (cancelled) return Promise.resolve()
      return new Promise<void>((resolve) => {
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

/**
 * Timing trickery — a scope where all delays resolve immediately.
 * For tests and `--fast` dev mode. Same interface, zero wall-clock cost.
 */
export function createInstantScope(): Scope {
  const cleanups: (() => void)[] = []
  let cancelled = false

  return {
    get cancelled() {
      return cancelled
    },
    sleep() {
      return Promise.resolve()
    },
    timeout(_, fn) {
      fn()
      return () => {}
    },
    onDispose(fn) {
      if (cancelled) fn()
      else cleanups.push(fn)
    },
    [Symbol.dispose]() {
      cancelled = true
      for (const fn of cleanups) fn()
      cleanups.length = 0
    },
  }
}
