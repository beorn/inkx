import { useEffect, useRef } from "react"
import { log } from "../log.ts"

/**
 * Measure component mount time (render → commit).
 *
 * Records performance.now() during render, then logs the elapsed time
 * in a mount-only useEffect (fires after React commits the component).
 * Complete no-op (no hooks) when debug logging is disabled.
 *
 * Safe to conditionally call hooks because `log.debug` is stable
 * for the process lifetime — log level is set once during CLI startup
 * (before any React rendering begins).
 *
 * Activate with: DEBUG_LOG=/tmp/km.log bun km view ...
 *
 * @param label - Human-readable label for the log line
 *
 * @example
 * function MyExpensiveComponent() {
 *   useComponentTiming(`Column 3 "Projects"`)
 *   // ...
 * }
 * // → DEBUG km:tui [layout] Column 3 "Projects": 142ms
 */
export function useComponentTiming(label: string): void {
  // ConditionalLogger proxy: log.debug is undefined when LOG_LEVEL > debug
  if (!log.debug) return

  // eslint-disable-next-line react-hooks/rules-of-hooks -- guard is stable for process lifetime
  const start = useRef(performance.now())
  // eslint-disable-next-line react-hooks/rules-of-hooks -- guard is stable for process lifetime
  useEffect(() => {
    const elapsed = performance.now() - start.current
    log.debug?.(`[layout] ${label}: ${elapsed.toFixed(0)}ms`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- mount only
}
