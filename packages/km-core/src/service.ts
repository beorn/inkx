/**
 * Service Interface - Lifecycle Control
 *
 * For domain objects with start/stop lifecycle (file watchers, servers, etc.)
 * Service extends AsyncDisposable so it can be used with `await using`.
 */

/**
 * Service status indicates the lifecycle state.
 */
export type ServiceStatus = "stopped" | "starting" | "running" | "stopping"

/**
 * Service interface for objects with start/stop lifecycle.
 *
 * Examples: file watcher, sync daemon, network connection
 *
 * Usage:
 * ```typescript
 * await using watcher = createWatcher(vault);
 * await watcher.start();
 * // ... do stuff ...
 * // watcher.stop() called automatically via asyncDispose
 * ```
 */
export interface Service extends AsyncDisposable {
  /** Current lifecycle status */
  readonly status: ServiceStatus

  /**
   * Start the service.
   * Transitions: stopped → starting → running
   * No-op if already starting or running.
   */
  start(): Promise<void>

  /**
   * Stop the service.
   * Transitions: running → stopping → stopped
   * No-op if already stopping or stopped.
   */
  stop(): Promise<void>
}

/**
 * Run a generator to completion, returning the final value.
 * Use this when you don't need progress updates.
 *
 * @example
 * const vault = runGenerator(createVault(path));
 */
export function runGenerator<T>(gen: Generator<unknown, T, unknown>): T {
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

/**
 * Run a generator with a progress callback.
 * Use this when you want to display progress.
 * Progress type P is generic to work with any progress info shape.
 *
 * @example
 * const vault = runWithProgress(createVault(path), (p) => {
 *   spinner.update(`${p.phase}: ${p.current}/${p.total}`);
 * });
 */
export function runWithProgress<P, T>(
  gen: Generator<P, T, unknown>,
  onProgress: (info: P) => void,
): T {
  let result = gen.next()
  while (!result.done) {
    onProgress(result.value as P)
    result = gen.next()
  }
  return result.value as T
}
