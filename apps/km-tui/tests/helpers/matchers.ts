/**
 * Custom Vitest Matchers for TUI Testing
 *
 * Provides Playwright-inspired matchers for testing silvery components.
 * These complement the built-in toExist and toHaveCount matchers in board-test.ts.
 *
 * @example
 * ```tsx
 * const app = render(<MyComponent />)
 * const element = app.getByText('Hello')
 *
 * expect(element).toHaveText('Hello World')
 * expect(element).toBeVisible()
 * expect(element).toBeLeftOf(otherElement)
 * ```
 */

import { expect } from "vitest"
import type { AutoLocator, Rect } from "@silvery/test"
import type { TestAppState } from "./test-app.ts"

// =============================================================================
// Type Guard
// =============================================================================

function isAutoLocator(value: unknown): value is AutoLocator {
  return (
    value !== null &&
    typeof value === "object" &&
    "boundingBox" in value &&
    "textContent" in value &&
    typeof (value as AutoLocator).boundingBox === "function" &&
    typeof (value as AutoLocator).textContent === "function"
  )
}

function assertAutoLocator(value: unknown, matcherName: string): asserts value is AutoLocator {
  if (!isAutoLocator(value)) {
    throw new Error(
      `${matcherName} expects an AutoLocator, got ${typeof value}. ` +
        `Use app.getByTestId() or app.locator() to get a locator.`,
    )
  }
}

// =============================================================================
// TestApp Type Guard
// =============================================================================

function isTestApp(value: unknown): value is { state: TestAppState } {
  return (
    value !== null &&
    typeof value === "object" &&
    "state" in value &&
    typeof (value as Record<string, unknown>).state === "object" &&
    (value as Record<string, unknown>).state !== null &&
    "cursor" in ((value as Record<string, unknown>).state as Record<string, unknown>)
  )
}

function assertTestApp(value: unknown, matcherName: string): asserts value is { state: TestAppState } {
  if (!isTestApp(value)) {
    throw new Error(
      `${matcherName} expects a TestApp (with .state property), got ${typeof value}. ` +
        `Use createTestApp() to create a TestApp.`,
    )
  }
}

// =============================================================================
// Matcher Type Declarations
// =============================================================================

declare module "vitest" {
  interface Matchers<T> {
    // Text matchers
    toHaveText(expected: string): void
    toContainText(expected: string): void

    // Visibility matchers
    toBeVisible(): void
    toBeHidden(): void

    // Layout matchers
    toBeLeftOf(other: AutoLocator): void
    toBeRightOf(other: AutoLocator): void
    toBeAbove(other: AutoLocator): void
    toBeBelow(other: AutoLocator): void
    toBeContainedIn(container: AutoLocator): void
    toHaveWidth(expected: number): void
    toHaveHeight(expected: number): void

    // TestApp matchers — board state assertions
    toHaveCursorOn(nodeId: string): void
    toHaveSelection(nodeIds: string[]): void
    toHaveView(mode: string): void
    toHaveOverlay(name: string | null): void
    toHaveBell(): void
    toHaveNodeCount(count: number): void
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function getLocatorRect(locator: AutoLocator): Rect | null {
  return locator.boundingBox()
}

function getLocatorText(locator: AutoLocator): string {
  return locator.textContent()
}

// =============================================================================
// Text Matchers
// =============================================================================

expect.extend({
  /**
   * Assert locator has exact text content.
   *
   * @example
   * expect(locator.getByTestId('title')).toHaveText('Hello World')
   */
  toHaveText(received: unknown, expected: string) {
    assertAutoLocator(received, "toHaveText")
    const actual = getLocatorText(received)
    const pass = actual === expected

    return {
      pass,
      message: () =>
        pass ? `Expected text not to be "${expected}"` : `Expected text to be "${expected}", got "${actual}"`,
    }
  },

  /**
   * Assert locator text contains substring.
   *
   * @example
   * expect(locator.getByTestId('message')).toContainText('error')
   */
  toContainText(received: unknown, expected: string) {
    assertAutoLocator(received, "toContainText")
    const actual = getLocatorText(received)
    const pass = actual.includes(expected)

    return {
      pass,
      message: () =>
        pass ? `Expected text not to contain "${expected}"` : `Expected text to contain "${expected}", got "${actual}"`,
    }
  },
})

// =============================================================================
// Visibility Matchers
// =============================================================================

expect.extend({
  /**
   * Assert locator is visible (has bounding box with non-zero dimensions).
   *
   * @example
   * expect(locator.getByTestId('panel')).toBeVisible()
   */
  toBeVisible(received: unknown) {
    assertAutoLocator(received, "toBeVisible")
    const rect = getLocatorRect(received)
    const pass = rect !== null && rect.width > 0 && rect.height > 0

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be visible`
          : `Expected element to be visible, got ${rect ? `${rect.width}×${rect.height}` : "no rect"}`,
    }
  },

  /**
   * Assert locator is hidden (no bounding box or zero dimensions).
   *
   * @example
   * expect(locator.getByTestId('modal')).toBeHidden()
   */
  toBeHidden(received: unknown) {
    assertAutoLocator(received, "toBeHidden")
    const rect = getLocatorRect(received)
    const pass = rect === null || rect.width === 0 || rect.height === 0

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be hidden`
          : `Expected element to be hidden, got ${rect?.width}×${rect?.height}`,
    }
  },
})

// =============================================================================
// Layout Matchers
// =============================================================================

expect.extend({
  /**
   * Assert locator is positioned to the left of another element.
   *
   * @example
   * expect(locator.getByTestId('col1')).toBeLeftOf(locator.getByTestId('col2'))
   */
  toBeLeftOf(received: unknown, other: AutoLocator) {
    assertAutoLocator(received, "toBeLeftOf")
    const rectA = getLocatorRect(received)
    const rectB = getLocatorRect(other)

    if (!rectA || !rectB) {
      return {
        pass: false,
        message: () => `Cannot compare positions: ${!rectA ? "received" : "other"} has no bounding box`,
      }
    }

    const pass = rectA.x + rectA.width <= rectB.x

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be left of other`
          : `Expected element (x=${rectA.x}, width=${rectA.width}) to be left of other (x=${rectB.x})`,
    }
  },

  /**
   * Assert locator is positioned to the right of another element.
   *
   * @example
   * expect(locator.getByTestId('col2')).toBeRightOf(locator.getByTestId('col1'))
   */
  toBeRightOf(received: unknown, other: AutoLocator) {
    assertAutoLocator(received, "toBeRightOf")
    const rectA = getLocatorRect(received)
    const rectB = getLocatorRect(other)

    if (!rectA || !rectB) {
      return {
        pass: false,
        message: () => `Cannot compare positions: ${!rectA ? "received" : "other"} has no bounding box`,
      }
    }

    const pass = rectA.x >= rectB.x + rectB.width

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be right of other`
          : `Expected element (x=${rectA.x}) to be right of other (x=${rectB.x}, width=${rectB.width})`,
    }
  },

  /**
   * Assert locator is positioned above another element.
   *
   * @example
   * expect(locator.getByTestId('header')).toBeAbove(locator.getByTestId('content'))
   */
  toBeAbove(received: unknown, other: AutoLocator) {
    assertAutoLocator(received, "toBeAbove")
    const rectA = getLocatorRect(received)
    const rectB = getLocatorRect(other)

    if (!rectA || !rectB) {
      return {
        pass: false,
        message: () => `Cannot compare positions: ${!rectA ? "received" : "other"} has no bounding box`,
      }
    }

    const pass = rectA.y + rectA.height <= rectB.y

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be above other`
          : `Expected element (y=${rectA.y}, height=${rectA.height}) to be above other (y=${rectB.y})`,
    }
  },

  /**
   * Assert locator is positioned below another element.
   *
   * @example
   * expect(locator.getByTestId('footer')).toBeBelow(locator.getByTestId('content'))
   */
  toBeBelow(received: unknown, other: AutoLocator) {
    assertAutoLocator(received, "toBeBelow")
    const rectA = getLocatorRect(received)
    const rectB = getLocatorRect(other)

    if (!rectA || !rectB) {
      return {
        pass: false,
        message: () => `Cannot compare positions: ${!rectA ? "received" : "other"} has no bounding box`,
      }
    }

    const pass = rectA.y >= rectB.y + rectB.height

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be below other`
          : `Expected element (y=${rectA.y}) to be below other (y=${rectB.y}, height=${rectB.height})`,
    }
  },

  /**
   * Assert locator is fully contained within another element.
   *
   * @example
   * expect(locator.getByTestId('card')).toBeContainedIn(locator.getByTestId('column'))
   */
  toBeContainedIn(received: unknown, container: AutoLocator) {
    assertAutoLocator(received, "toBeContainedIn")
    const rectA = getLocatorRect(received)
    const rectB = getLocatorRect(container)

    if (!rectA || !rectB) {
      return {
        pass: false,
        message: () => `Cannot compare positions: ${!rectA ? "received" : "container"} has no bounding box`,
      }
    }

    const pass =
      rectA.x >= rectB.x &&
      rectA.y >= rectB.y &&
      rectA.x + rectA.width <= rectB.x + rectB.width &&
      rectA.y + rectA.height <= rectB.y + rectB.height

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be contained in container`
          : `Expected element [${rectA.x},${rectA.y} ${rectA.width}×${rectA.height}] to be contained in container [${rectB.x},${rectB.y} ${rectB.width}×${rectB.height}]`,
    }
  },

  /**
   * Assert locator has specific width.
   *
   * @example
   * expect(locator.getByTestId('column')).toHaveWidth(20)
   */
  toHaveWidth(received: unknown, expected: number) {
    assertAutoLocator(received, "toHaveWidth")
    const rect = getLocatorRect(received)

    if (!rect) {
      return {
        pass: false,
        message: () => `Element has no bounding box`,
      }
    }

    const pass = rect.width === expected

    return {
      pass,
      message: () =>
        pass ? `Expected width not to be ${expected}` : `Expected width to be ${expected}, got ${rect.width}`,
    }
  },

  /**
   * Assert locator has specific height.
   *
   * @example
   * expect(locator.getByTestId('row')).toHaveHeight(1)
   */
  toHaveHeight(received: unknown, expected: number) {
    assertAutoLocator(received, "toHaveHeight")
    const rect = getLocatorRect(received)

    if (!rect) {
      return {
        pass: false,
        message: () => `Element has no bounding box`,
      }
    }

    const pass = rect.height === expected

    return {
      pass,
      message: () =>
        pass ? `Expected height not to be ${expected}` : `Expected height to be ${expected}, got ${rect.height}`,
    }
  },
})

// =============================================================================
// TestApp Matchers — Board State Assertions
// =============================================================================

expect.extend({
  /**
   * Assert cursor is on a specific node.
   *
   * @example
   * expect(app).toHaveCursorOn("task1")
   */
  toHaveCursorOn(received: unknown, nodeId: string) {
    assertTestApp(received, "toHaveCursorOn")
    const actual = received.state.cursor
    const pass = actual === nodeId

    return {
      pass,
      message: () =>
        pass ? `Expected cursor not to be on "${nodeId}"` : `Expected cursor on "${nodeId}", got "${actual}"`,
    }
  },

  /**
   * Assert exact selection set (order-independent).
   *
   * @example
   * expect(app).toHaveSelection(["task1", "task2"])
   * expect(app).toHaveSelection([])  // nothing selected
   */
  toHaveSelection(received: unknown, nodeIds: string[]) {
    assertTestApp(received, "toHaveSelection")
    const actual = [...received.state.selection].sort()
    const expected = [...nodeIds].sort()
    const pass = actual.length === expected.length && actual.every((id, i) => id === expected[i])

    return {
      pass,
      message: () =>
        pass
          ? `Expected selection not to be [${nodeIds.join(", ")}]`
          : `Expected selection [${nodeIds.join(", ")}], got [${received.state.selection.join(", ")}]`,
    }
  },

  /**
   * Assert current view mode.
   *
   * @example
   * expect(app).toHaveView("cards")
   * expect(app).toHaveView("columns")
   */
  toHaveView(received: unknown, mode: string) {
    assertTestApp(received, "toHaveView")
    const actual = received.state.view
    const pass = actual === mode

    return {
      pass,
      message: () => (pass ? `Expected view not to be "${mode}"` : `Expected view to be "${mode}", got "${actual}"`),
    }
  },

  /**
   * Assert overlay state (null = no overlay open).
   *
   * @example
   * expect(app).toHaveOverlay(null)     // no overlay
   * expect(app).toHaveOverlay("search") // search overlay open
   */
  toHaveOverlay(received: unknown, name: string | null) {
    assertTestApp(received, "toHaveOverlay")
    const actual = received.state.overlay
    const pass = actual === name

    return {
      pass,
      message: () =>
        pass
          ? `Expected overlay not to be ${name === null ? "null" : `"${name}"`}`
          : `Expected overlay ${name === null ? "null" : `"${name}"`}, got ${actual === null ? "null" : `"${actual}"`}`,
    }
  },

  /**
   * Assert bell fired at least once.
   *
   * @example
   * expect(app).toHaveBell()
   */
  toHaveBell(received: unknown) {
    assertTestApp(received, "toHaveBell")
    const bellCount = received.state.bell
    const pass = bellCount > 0

    return {
      pass,
      message: () =>
        pass
          ? `Expected bell not to have fired (fired ${bellCount} times)`
          : `Expected bell to have fired, but it didn't`,
    }
  },

  /**
   * Assert number of visible nodes.
   *
   * @example
   * expect(app).toHaveNodeCount(5)
   */
  toHaveNodeCount(received: unknown, count: number) {
    assertTestApp(received, "toHaveNodeCount")
    const actual = received.state.visible.length
    const pass = actual === count

    return {
      pass,
      message: () =>
        pass
          ? `Expected node count not to be ${count}`
          : `Expected ${count} visible nodes, got ${actual} [${received.state.visible.join(", ")}]`,
    }
  },
})
