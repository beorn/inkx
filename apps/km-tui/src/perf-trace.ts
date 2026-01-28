/**
 * Performance Tracing for TUI
 *
 * Lightweight performance measurement utilities for debugging slow cursor movement.
 * Enable with DEBUG=km:perf environment variable.
 *
 * Usage:
 *   import { trace, traceSync } from "./perf-trace.ts"
 *
 *   // For sync operations
 *   const result = traceSync("myOperation", () => expensiveComputation())
 *
 *   // For tracking render times (call at start and end)
 *   trace.start("Board.render")
 *   // ... render code ...
 *   trace.end("Board.render")
 */

import createDebug from "debug"

const debug = createDebug("km:perf")

// Track cumulative time for repeated operations
const cumulativeTimers = new Map<string, { total: number; count: number }>()

// Track active timers
const activeTimers = new Map<string, number>()

/**
 * Start a named timer
 */
function start(name: string): void {
  if (!debug.enabled) return
  activeTimers.set(name, performance.now())
}

/**
 * End a named timer and log the duration
 */
function end(name: string): number {
  if (!debug.enabled) return 0

  const startTime = activeTimers.get(name)
  if (startTime === undefined) {
    debug("WARN: end() called without matching start() for %s", name)
    return 0
  }

  activeTimers.delete(name)
  const duration = performance.now() - startTime

  // Update cumulative stats
  const stats = cumulativeTimers.get(name) ?? { total: 0, count: 0 }
  stats.total += duration
  stats.count += 1
  cumulativeTimers.set(name, stats)

  // Log if slow (> 5ms) or every 10th occurrence
  if (duration > 5 || stats.count % 10 === 0) {
    debug(
      "%s: %.2fms (avg: %.2fms over %d calls)",
      name,
      duration,
      stats.total / stats.count,
      stats.count,
    )
  }

  return duration
}

/**
 * Trace a synchronous operation
 */
function traceSync<T>(name: string, fn: () => T): T {
  if (!debug.enabled) return fn()

  start(name)
  try {
    return fn()
  } finally {
    end(name)
  }
}

/**
 * Log a summary of all cumulative timers
 */
function summary(): void {
  if (!debug.enabled) return

  debug("=== Performance Summary ===")
  for (const [name, stats] of cumulativeTimers.entries()) {
    debug(
      "%s: total=%.2fms, count=%d, avg=%.2fms",
      name,
      stats.total,
      stats.count,
      stats.total / stats.count,
    )
  }
  debug("===========================")
}

/**
 * Reset all timers
 */
function reset(): void {
  cumulativeTimers.clear()
  activeTimers.clear()
}

export const trace = {
  start,
  end,
  summary,
  reset,
}

export { traceSync }
