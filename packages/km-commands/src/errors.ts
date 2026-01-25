/**
 * ActionError Types - Expected Failures in Command Handling
 *
 * ActionResult is the return type for command handlers.
 * Use these for expected failures that callers should handle.
 *
 * - boundary: User at edge of navigation (should ring bell)
 * - precondition: Expected condition not met (e.g., no node selected)
 * - unimplemented: Feature not yet implemented
 *
 * @example
 * function handleCursorMove(ctx: Context, dir: string): ActionResult {
 *   if (atBoundary) return boundary(dir)
 *   doMove()
 *   return ok()
 * }
 */

import { type Result, Err, OkVoid } from "@km/core"

/**
 * ActionError - discriminated union of expected command failures.
 */
export type ActionError =
  | { type: "boundary"; direction: string; message?: string }
  | { type: "precondition"; missing: string }
  | { type: "unimplemented"; feature: string }

/**
 * ActionResult - the return type for command action handlers.
 * Ok(void) on success, Err(ActionError) on expected failure.
 */
export type ActionResult = Result<void, ActionError>

/**
 * Create a boundary error (user at navigation edge).
 * UI should ring bell.
 */
export const boundary = (
  direction: string,
  message?: string,
): ActionResult => Err({ type: "boundary", direction, message })

/**
 * Create a precondition error (expected condition not met).
 */
export const precondition = (missing: string): ActionResult =>
  Err({ type: "precondition", missing })

/**
 * Create an unimplemented error (feature not yet built).
 */
export const unimplemented = (feature: string): ActionResult =>
  Err({ type: "unimplemented", feature })

/**
 * Create a success result.
 */
export const ok = (): ActionResult => OkVoid
