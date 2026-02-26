/**
 * Raw signal handler tests
 *
 * Tests the emergency terminal restore function used by crash handlers.
 * Ctrl+C and Ctrl+Z handling has moved to inkx's terminal lifecycle system
 * (see vendor/beorn-inkx/tests/terminal-lifecycle.test.ts).
 */

import { describe, it, expect, vi } from "vitest"
import { restoreTerminal } from "../src/raw-signals.ts"

describe("restoreTerminal", () => {
  it("is a function", () => {
    expect(typeof restoreTerminal).toBe("function")
  })

  // Note: restoreTerminal writes directly via writeSync and mutates
  // process.stdin.rawMode, making it hard to test without mocking the
  // process globals. The core restore/resume logic is tested in
  // vendor/beorn-inkx/tests/terminal-lifecycle.test.ts.
})
