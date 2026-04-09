/**
 * Dialog Guard Tests
 *
 * Covers:
 * - getModeStack: returns shared singleton
 * - pushDialogMode / popDialogMode: mode stack lifecycle
 * - resetModeStack: clears stack and grace period
 * - markDialogConfirmed / isDialogConfirmGracePeriod: grace period timing
 *
 * These are pure unit tests for the dialog-guard module. Integration with
 * board-app.ts command filtering is tested in dialog-lifecycle.slow.test.ts.
 */

import { describe, test, expect, beforeEach, vi, afterEach } from "vitest"
import {
  getModeStack,
  resetModeStack,
  pushDialogMode,
  popDialogMode,
  markDialogConfirmed,
  isDialogConfirmGracePeriod,
} from "../src/dialog-guard.ts"

beforeEach(() => {
  resetModeStack()
})

// =============================================================================
// Mode stack singleton
// =============================================================================

describe("getModeStack", () => {
  test("returns a mode stack instance", () => {
    const stack = getModeStack()
    expect(stack).toBeDefined()
    expect(stack.current()).toBe("command")
  })

  test("returns the same instance on repeated calls", () => {
    const a = getModeStack()
    const b = getModeStack()
    expect(a).toBe(b)
  })
})

// =============================================================================
// pushDialogMode / popDialogMode
// =============================================================================

describe("pushDialogMode / popDialogMode", () => {
  test("push puts stack into dialog mode", () => {
    const stack = getModeStack()
    expect(stack.isDialog()).toBe(false)

    pushDialogMode("dialog:search")
    expect(stack.isDialog()).toBe(true)
    expect(stack.current()).toBe("dialog:search")
  })

  test("pop returns to command mode after single push", () => {
    pushDialogMode("dialog:rename")
    const popped = popDialogMode()

    expect(popped).toBe("dialog:rename")
    expect(getModeStack().current()).toBe("command")
    expect(getModeStack().isDialog()).toBe(false)
  })

  test("nested push/pop: stacks correctly", () => {
    pushDialogMode("dialog:search")
    pushDialogMode("dialog:confirm")

    expect(getModeStack().current()).toBe("dialog:confirm")

    popDialogMode()
    expect(getModeStack().current()).toBe("dialog:search")

    popDialogMode()
    expect(getModeStack().current()).toBe("command")
  })

  test("pop on empty stack returns undefined", () => {
    const result = popDialogMode()
    expect(result).toBeUndefined()
  })
})

// =============================================================================
// resetModeStack
// =============================================================================

describe("resetModeStack", () => {
  test("clears mode stack to command", () => {
    pushDialogMode("dialog:search")
    pushDialogMode("dialog:confirm")
    expect(getModeStack().size()).toBe(2)

    resetModeStack()
    expect(getModeStack().size()).toBe(0)
    expect(getModeStack().current()).toBe("command")
  })

  test("clears grace period timestamp", () => {
    markDialogConfirmed()
    expect(isDialogConfirmGracePeriod()).toBe(true)

    resetModeStack()
    expect(isDialogConfirmGracePeriod()).toBe(false)
  })
})

// =============================================================================
// Grace period
// =============================================================================

describe("dialog confirm grace period", () => {
  test("isDialogConfirmGracePeriod returns false initially", () => {
    expect(isDialogConfirmGracePeriod()).toBe(false)
  })

  test("isDialogConfirmGracePeriod returns true immediately after markDialogConfirmed", () => {
    markDialogConfirmed()
    expect(isDialogConfirmGracePeriod()).toBe(true)
  })

  test("isDialogConfirmGracePeriod returns false after grace period expires", () => {
    // Mock performance.now to simulate time passing
    const originalNow = performance.now
    let mockTime = 1000
    vi.spyOn(performance, "now").mockImplementation(() => mockTime)

    markDialogConfirmed() // sets dialogConfirmedAt = 1000
    expect(isDialogConfirmGracePeriod()).toBe(true)

    // Advance past 500ms grace period
    mockTime = 1600
    expect(isDialogConfirmGracePeriod()).toBe(false)

    vi.restoreAllMocks()
  })

  test("grace period is active within 500ms window", () => {
    const originalNow = performance.now
    let mockTime = 1000
    vi.spyOn(performance, "now").mockImplementation(() => mockTime)

    markDialogConfirmed()

    // At 499ms — still in grace period
    mockTime = 1499
    expect(isDialogConfirmGracePeriod()).toBe(true)

    // At 500ms — expired
    mockTime = 1500
    expect(isDialogConfirmGracePeriod()).toBe(false)

    vi.restoreAllMocks()
  })
})

// =============================================================================
// Journey: full dialog lifecycle via guard functions
// =============================================================================

describe("dialog lifecycle journey", () => {
  test("open search -> confirm -> grace period -> expired", () => {
    const stack = getModeStack()

    // 1. Start in command mode
    expect(stack.current()).toBe("command")
    expect(stack.isDialog()).toBe(false)

    // 2. Open search dialog
    pushDialogMode("dialog:search")
    expect(stack.isDialog()).toBe(true)

    // 3. Confirm and close
    markDialogConfirmed()
    popDialogMode()
    expect(stack.current()).toBe("command")

    // 4. Grace period is active (Enter should be suppressed)
    expect(isDialogConfirmGracePeriod()).toBe(true)

    // 5. After reset, grace period clears
    resetModeStack()
    expect(isDialogConfirmGracePeriod()).toBe(false)
  })
})
