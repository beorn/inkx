/**
 * Action Handlers Tests
 *
 * Covers:
 * - assertNever: compile-time exhaustiveness helper
 *   - Throws on unhandled action types at runtime
 *   - Error message includes the action type
 *
 * The action-handlers module is small (assertNever only) but critical —
 * it's the safety net for the exhaustive switch pattern used in board-app.ts.
 */

import { describe, test, expect } from "vitest"
import { assertNever } from "../src/action-handlers.ts"

describe("assertNever", () => {
  test("throws Error with action type in message", () => {
    const fakeAction = { type: "UNKNOWN_OP" } as never
    expect(() => assertNever(fakeAction)).toThrow("Unhandled action type: UNKNOWN_OP")
  })

  test("thrown error is a standard Error", () => {
    const fakeAction = { type: "MISSING" } as never
    try {
      assertNever(fakeAction)
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toContain("MISSING")
    }
  })

  test("works with complex action objects", () => {
    const fakeAction = { type: "COMPLEX_OP", payload: { data: 42 } } as never
    expect(() => assertNever(fakeAction)).toThrow("Unhandled action type: COMPLEX_OP")
  })
})
