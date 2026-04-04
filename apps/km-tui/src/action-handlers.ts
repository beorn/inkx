/**
 * Action Handler Registry
 *
 * Provides compile-time exhaustive handling for all KmOp types.
 * TypeScript will error if any action type is missing from the switch statement.
 *
 * This replaces the error-prone layered type guard approach (isTUIAction,
 * isUIOp, isBoardOp) that required manual synchronization between
 * type guards and switch statements.
 *
 * The key insight: using a single exhaustive switch with `assertNever` in the
 * default case means TypeScript will catch any missing action type at compile time.
 *
 * @see issue km-y00m for the motivation behind this design
 */

import type { KmOp } from "@km/commands"

/**
 * Helper to ensure exhaustiveness at compile time.
 * If this function is reachable at runtime, it means we have an unhandled action type.
 * TypeScript will error if the switch above it isn't exhaustive.
 *
 * @param action - The unhandled action (should be type `never` if switch is exhaustive)
 * @returns never - Always throws
 */
export function assertNever(action: never): never {
  const unhandled = action as KmOp
  throw new Error(`Unhandled action type: ${unhandled.type}`)
}
