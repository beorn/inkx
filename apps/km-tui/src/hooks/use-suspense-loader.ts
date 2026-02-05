/**
 * Suspense-compatible data loader
 *
 * Creates a loader that defers heavy synchronous work to the next tick,
 * allowing the UI to render first. Uses React Suspense to show a fallback.
 *
 * In test environments (NODE_ENV=test), loads synchronously for predictable tests.
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
 *   const data = loader.read() // Suspends if not ready
 *   return <Text>{data.name}</Text>
 * }
 * ```
 */

// Check if running in test environment (vitest sets this)
const isTestEnv = process.env.NODE_ENV === "test"

export type LoaderStatus = "idle" | "pending" | "resolved" | "error"

export interface SuspenseLoader<T> {
  /** Read the loaded value. Suspends (throws promise) if not ready. */
  read(): T
  /** Current status of the loader */
  status: LoaderStatus
}

/**
 * Create a suspense-compatible loader that defers heavy work.
 *
 * The first call to `read()` triggers the load function. In production,
 * this is deferred to the next tick via setTimeout(0), allowing the UI
 * to render the Suspense fallback first. In test environments, the load
 * runs synchronously for predictable tests.
 *
 * @param load - Synchronous function that loads the data
 * @returns A SuspenseLoader that can be used with React.Suspense
 */
export function createSuspenseLoader<T>(load: () => T): SuspenseLoader<T> {
  let status: LoaderStatus = "idle"
  let result: T
  let error: unknown
  let promise: Promise<void> | null = null

  return {
    get status() {
      return status
    },
    read(): T {
      if (status === "resolved") return result
      if (status === "error") throw error
      if (status === "idle") {
        // In test environment, load synchronously for predictable tests
        if (isTestEnv) {
          try {
            result = load()
            status = "resolved"
            return result
          } catch (e) {
            error = e
            status = "error"
            throw error
          }
        }

        // In production, defer to next tick so UI renders first
        status = "pending"
        promise = new Promise<void>((resolve) => {
          setTimeout(() => {
            try {
              result = load()
              status = "resolved"
            } catch (e) {
              error = e
              status = "error"
            }
            resolve()
          }, 0)
        })
      }
      throw promise
    },
  }
}
