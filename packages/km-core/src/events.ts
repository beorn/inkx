/**
 * @km/core - Event System
 *
 * Cross-layer event emitter for decoupling modules and providing observability.
 * Uses nanoevents for lightweight, type-safe event handling with Disposable support.
 *
 * Event categories:
 * - User events: parse-error, sync-error, validation-warning → UI feedback
 * - Debug events: command-executed, action-handled → debug() log
 * - Metric events: repo-loaded, file-parsed → performance monitoring
 */

import { createNanoEvents } from "nanoevents"

// =============================================================================
// Event Type Definitions
// =============================================================================

/**
 * Interface-based event typing for full type safety.
 * Each event maps to a handler function signature.
 */
export interface KmEvents {
  // User-facing events (→ UI feedback)
  "parse-error": (e: { file: string; line: number; message: string }) => void
  "sync-error": (e: { path: string; message: string }) => void
  /**
   * External edit detected at write time. The on-disk file no longer matched
   * the baseline km loaded, so km's write was discarded and the disk version
   * was preserved untouched (see hub/km/storage-architecture.md §7.1 —
   * content-as-CAS contract). The TUI surfaces this as a toast so the user
   * can reconcile manually. `strategy` names the resolution policy
   * ("last_write_wins" has been replaced by discard-on-conflict since
   * writeback-cas adoption).
   */
  "sync-conflict": (e: { path: string; strategy: string }) => void
  "validation-warning": (e: { nodeId: string; message: string }) => void

  // Debug events (→ debug() log)
  "command-executed": (e: { id: string; duration: number }) => void
  "action-handled": (e: { action: string; result: "ok" | "error" }) => void

  // Metric events (→ performance monitoring)
  "repo-loaded": (e: { nodeCount: number; duration: number }) => void
  "file-parsed": (e: { taskCount: number; duration: number }) => void
}

// =============================================================================
// Disposable Support
// =============================================================================

/**
 * Subscription - works as unbind function, .dispose(), and `using` keyword.
 * Enables three usage patterns:
 *
 * 1. Unbind function (React useEffect):
 *    useEffect(() => {
 *      const unsub = kmEvents.on('parse-error', handler)
 *      return unsub  // cleanup
 *    }, [])
 *
 * 2. Dispose method:
 *    const sub = kmEvents.on('parse-error', handler)
 *    sub.dispose()
 *
 * 3. Using keyword (TypeScript 5.2+):
 *    function handleScope() {
 *      using sub = kmEvents.on('parse-error', handler)
 *      // auto-disposed when scope exits
 *    }
 */
export interface Subscription extends Disposable {
  (): void // Callable as unbind function
  dispose(): void
  [Symbol.dispose](): void
}

/**
 * Create a Subscription from an unbind function.
 * Wraps nanoevents unbind to support all three disposal patterns.
 */
function createSubscription(unbind: () => void): Subscription {
  const sub = Object.assign(unbind, {
    dispose: unbind,
    [Symbol.dispose]: unbind,
  })
  return sub as Subscription
}

// =============================================================================
// Event Emitter
// =============================================================================

const _emitter = createNanoEvents<KmEvents>()

/**
 * Global event emitter for km.
 * Type-safe, lightweight (107 bytes), fully disposable.
 *
 * Usage:
 *   // Emit
 *   kmEvents.emit('parse-error', { file: 'test.md', line: 42, message: 'bad' })
 *
 *   // Subscribe
 *   const unsub = kmEvents.on('parse-error', (e) => {
 *     showStatus(e.message)
 *   })
 *   unsub()  // Clean unsubscribe
 */
export const kmEvents = {
  // eslint-disable-next-line promise/prefer-await-to-callbacks -- Event listener callback pattern
  on<K extends keyof KmEvents>(event: K, cb: KmEvents[K]): Subscription {
    const unbind = _emitter.on(event, cb)
    return createSubscription(unbind)
  },
  emit: _emitter.emit.bind(_emitter),
}

// =============================================================================
// DisposableStore - Manage Multiple Subscriptions
// =============================================================================

/**
 * DisposableStore - manages multiple disposables with single cleanup.
 *
 * Usage:
 *   const store = new DisposableStore()
 *   store.add(kmEvents.on('parse-error', handler1))
 *   store.add(kmEvents.on('sync-error', handler2))
 *   store.dispose()  // cleans up all
 *
 *   // Or with `using` keyword:
 *   using store = new DisposableStore()
 *   // All cleaned up when scope exits
 */
export class DisposableStore implements Disposable {
  private disposables: Disposable[] = []

  add<T extends Disposable>(d: T): T {
    this.disposables.push(d)
    return d
  }

  dispose(): void {
    this.disposables.forEach((d) => d[Symbol.dispose]())
    this.disposables = []
  }

  [Symbol.dispose](): void {
    this.dispose()
  }
}
