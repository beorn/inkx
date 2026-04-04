/**
 * OpError Types - Expected Failures in Command Handling
 *
 * OpResult is the return type for command handlers.
 * Use these for expected failures that callers should handle.
 *
 * - boundary: User at edge of navigation (should ring bell)
 * - precondition: Expected condition not met (e.g., no node selected)
 * - unimplemented: Feature not yet implemented
 *
 * @example
 * function handleCursorMove(ctx: Context, dir: string): OpResult {
 *   if (atBoundary) return boundary(dir)
 *   doMove()
 *   return ok()
 * }
 */

import { type Result, Err, OkVoid } from "@km/core"

/**
 * OpError - discriminated union of expected command failures.
 */
export type OpError =
  | { type: "boundary"; direction: string; message?: string }
  | { type: "precondition"; missing: string }
  | { type: "unimplemented"; feature: string }

/**
 * OpResult - the return type for command op handlers.
 * Ok(void) on success, Err(OpError) on expected failure.
 */
export type OpResult = Result<void, OpError>

/**
 * Create a boundary error (user at navigation edge).
 * UI should ring bell.
 */
export const boundary = (direction: string, message?: string): OpResult =>
  Err({ type: "boundary", direction, message })

/**
 * Create a precondition error (expected condition not met).
 */
export const precondition = (missing: string): OpResult => Err({ type: "precondition", missing })

/**
 * Create an unimplemented error (feature not yet built).
 */
export const unimplemented = (feature: string): OpResult => Err({ type: "unimplemented", feature })

/**
 * Create a success result.
 */
export const ok = (): OpResult => OkVoid
