/**
 * Shim for @silvery/clock.
 *
 * A Clock is a narrow capability for time-dependent operations,
 * extracted from Scope. Models receive a Clock instead of a full Scope.
 */

import type { Scope } from "./scope.js"

export interface Clock {
  sleep(ms: number): Promise<void>
  timeout(ms: number, fn: () => void): () => void
  readonly cancelled: boolean
}

/** Creates a Clock bound to a scope's lifetime. */
export function createClock(scope: Scope): Clock {
  return {
    sleep(ms: number) {
      return scope.sleep(ms)
    },
    timeout(ms: number, fn: () => void) {
      return scope.timeout(ms, fn)
    },
    get cancelled() {
      return scope.cancelled
    },
  }
}
