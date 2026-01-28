/**
 * Mock Watcher for Testing
 *
 * A simple mock implementation of the Watcher interface for tests
 * that need to run without real filesystem watching.
 */

import type { Watcher, ServiceStatus, FileChange } from "../watcher.ts"

/**
 * Mock watcher that implements the Watcher interface without
 * actually watching the filesystem.
 */
export interface FakeWatcher extends Watcher {
  /** Manually emit a change event for testing */
  emitChange(changes: FileChange[]): void
  /** Manually emit a ready event */
  emitReady(): void
  /** Manually emit an error event */
  emitError(error: Error): void
}

/**
 * Create a mock watcher for testing.
 *
 * The mock watcher implements the full Watcher interface but doesn't
 * actually watch the filesystem. Use the emit* methods to simulate events.
 *
 * @example
 * const mockWatcher = createFakeWatcher();
 * using repo = runGenerator(createRepo(repoDir, {
 *   watcherFactory: () => mockWatcher,
 * }));
 * const watcher = repo.watch();
 * await watcher.start();
 * mockWatcher.emitChange([{ type: "change", path: "/test.md" }]);
 */
export function createFakeWatcher(): FakeWatcher {
  let status: ServiceStatus = "stopped"

  type ChangeHandler = (changes: FileChange[]) => void
  type ErrorHandler = (error: Error) => void
  type ReadyHandler = () => void
  type AnyHandler = ChangeHandler | ErrorHandler | ReadyHandler

  const handlers = new Map<string, Set<AnyHandler>>()

  const watcher: FakeWatcher = {
    get status() {
      return status
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- Watcher interface requires Promise<void>
    async start() {
      if (status !== "stopped") return
      status = "starting"
      status = "running"
      // Emit ready on next tick to simulate async behavior
      setImmediate(() => {
        const readyHandlers = handlers.get("ready")
        readyHandlers?.forEach((h) => (h as ReadyHandler)())
      })
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- Watcher interface requires Promise<void>
    async stop() {
      if (status !== "running") return
      status = "stopping"
      status = "stopped"
    },

    on(event: string, handler: AnyHandler) {
      let set = handlers.get(event)
      if (!set) {
        set = new Set()
        handlers.set(event, set)
      }
      set.add(handler)
    },

    off(event: string, handler: AnyHandler) {
      handlers.get(event)?.delete(handler)
    },

    async [Symbol.asyncDispose]() {
      await this.stop()
    },

    // Mock-specific methods for testing
    emitChange(changes: FileChange[]) {
      const changeHandlers = handlers.get("change")
      changeHandlers?.forEach((h) => (h as ChangeHandler)(changes))
    },

    emitReady() {
      const readyHandlers = handlers.get("ready")
      readyHandlers?.forEach((h) => (h as ReadyHandler)())
    },

    emitError(error: Error) {
      const errorHandlers = handlers.get("error")
      errorHandlers?.forEach((h) => (h as ErrorHandler)(error))
    },
  }

  return watcher
}
