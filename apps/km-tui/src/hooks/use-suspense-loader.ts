/**
 * Suspense-compatible data loader
 *
 * Wraps a synchronous load function in the Suspense `read()` protocol.
 * First read runs the loader synchronously and caches the result; later
 * reads return the cache. Errors are captured and rethrown on subsequent
 * reads.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const loaderRef = React.useRef<SuspenseLoader<Data> | null>(null)
 *   if (!loaderRef.current) {
 *     loaderRef.current = createSuspenseLoader(() => loadHeavyData())
 *   }
 *
 *   return (
 *     <React.Suspense fallback={<Text>Loading...</Text>}>
 *       <DataView loader={loaderRef.current} />
 *     </React.Suspense>
 *   )
 * }
 *
 * function DataView({ loader }: { loader: SuspenseLoader<Data> }) {
 *   const data = loader.read() // Fast path: cached; first-read: sync load
 *   return <Text>{data.name}</Text>
 * }
 * ```
 */

export type LoaderStatus = "idle" | "pending" | "resolved" | "error"

export interface SuspenseLoader<T> {
  /** Read the loaded value. First read runs `load()` synchronously. */
  read(): T
  /** Current status of the loader */
  status: LoaderStatus
}

/**
 * Create a suspense-compatible loader that runs `load()` synchronously
 * on first read and caches the result. The Suspense fallback only fires
 * if a future async variant is added — for the current sync path it never
 * shows, which is exactly what the pickers want (see issue
 * km-tui.omnibox-picker-immediate).
 *
 * @param load - Synchronous function that loads the data
 * @returns A SuspenseLoader compatible with React.Suspense
 */
export function createSuspenseLoader<T>(load: () => T): SuspenseLoader<T> {
  let status: LoaderStatus = "idle"
  let result: T
  let error: unknown

  return {
    get status() {
      return status
    },
    read(): T {
      if (status === "resolved") return result
      if (status === "error") throw error
      // Load synchronously on first read. Previous versions of this function
      // deferred `load()` via `setTimeout(..., 0)` in production "so UI renders
      // first", but that forced a Suspense fallback to appear on every open
      // even for fast synchronous loaders — the pickers' "show results
      // immediately, don't require typing" complaint in
      // km-tui.omnibox-picker-immediate. The loaders we use
      // (loadProjectOptions / loadTagOptions / loadAssigneeOptions /
      // loadItemOptions) all run in <10ms on a typical vault — blocking the
      // first render for that long is strictly better than showing a
      // Loading… fallback for a frame.
      //
      // If a future loader genuinely needs async deferral, wrap it in its
      // own Promise and implement a SuspenseLoader that throws the promise
      // — the interface supports that path, we just don't use it here.
      try {
        result = load()
        status = "resolved"
        return result
      } catch (e) {
        error = e
        status = "error"
        throw error
      }
    },
  }
}
