/**
 * Conditional logging for km-tui
 *
 * Uses optional chaining pattern: log.debug?.() skips argument evaluation
 * when debug logging is disabled. See vendor/beorn-logger/docs/conditional-logging-research.md
 *
 * @example
 * import { log, sid } from "../log"
 *
 * log.debug?.("render %s children=%d", sid(node.id), children.length)
 * log.trace?.("layout col=%d card=%d", colIndex, cardIndex)
 */
import { createConditionalLogger, type ConditionalLogger } from "@beorn/logger"

// Re-export ConditionalLogger type for convenience
export type { ConditionalLogger }

// ============================================================
// Short ID helper
// ============================================================

/**
 * Extract short ID suffix for logging (last 8 chars)
 *
 * @example
 * sid("abc123def456") // → "3def456"
 * sid("short")        // → "short"
 */
export function sid(id: string): string {
  return id.length > 8 ? id.slice(-8) : id
}

// ============================================================
// TUI Logger
// ============================================================

/**
 * TUI logger with conditional methods
 *
 * Methods return undefined when disabled, enabling optional chaining:
 *
 * @example
 * log.debug?.("render %s", sid(node.id))     // Skipped if debug disabled
 * log.trace?.("verbose detail")               // Skipped if trace disabled
 * log.error("always logged")                  // Always works (no ?. needed)
 *
 * // Child loggers are also conditional:
 * const nodeLog = log.logger(sid(node.id))
 * nodeLog.debug?.("children=%d", count)
 *
 * // Spans require TRACE env:
 * {
 *   using span = log.span?.("render")
 *   span?.debug?.("working...")
 * }
 */
export const log: ConditionalLogger = createConditionalLogger("km:tui")

// ============================================================
// Specialized loggers (pre-wrapped)
// ============================================================

/** Render logging (high frequency, use sparingly) */
export const renderLog = log.logger("render")

/** Layout logging */
export const layoutLog = log.logger("layout")

/** Navigation logging */
export const navLog = log.logger("nav")
