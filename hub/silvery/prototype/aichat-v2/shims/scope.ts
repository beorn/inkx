/**
 * Shim for @silvery/scope.
 * Production: structured concurrency with scope trees, child tasks, and ownership.
 */

type Pending = { id: ReturnType<typeof setTimeout>; resolve: () => void }

export interface Task<T = void> {
  cancel(): void
  result: Promise<T>
}

export interface Scope extends Disposable {
  readonly cancelled: boolean
  child(): Scope
  spawn<T>(fn: (scope: Scope) => Promise<T>): Task<T>
  sleep(ms: number): Promise<void>
  timeout(ms: number, fn: () => void): () => void
  defer(fn: () => void): void
}

export function createScope(): Scope {
  const pending = new Set<Pending>()
  const cleanups: (() => void)[] = []
  let cancelled = false

  const scope: Scope = {
    get cancelled() {
      return cancelled
    },

    child() {
      const child = createScope()
      cleanups.push(() => child[Symbol.dispose]())
      return child
    },

    spawn<T>(fn: (scope: Scope) => Promise<T>): Task<T> {
      const child = scope.child()
      const result = fn(child).finally(() => child[Symbol.dispose]())
      return { cancel: () => child[Symbol.dispose](), result }
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

    defer(fn) {
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

  return scope
}

export function createInstantScope(): Scope {
  const cleanups: (() => void)[] = []
  let cancelled = false

  const scope: Scope = {
    get cancelled() {
      return cancelled
    },
    child() {
      const child = createInstantScope()
      cleanups.push(() => child[Symbol.dispose]())
      return child
    },
    spawn<T>(fn: (scope: Scope) => Promise<T>): Task<T> {
      const child = scope.child()
      const result = fn(child).finally(() => child[Symbol.dispose]())
      return { cancel: () => child[Symbol.dispose](), result }
    },
    sleep() {
      return Promise.resolve()
    },
    timeout(_, fn) {
      fn()
      return () => {}
    },
    defer(fn) {
      if (cancelled) fn()
      else cleanups.push(fn)
    },
    [Symbol.dispose]() {
      cancelled = true
      for (const fn of cleanups) fn()
      cleanups.length = 0
    },
  }

  return scope
}
