/**
 * Custom Vitest Matchers for TUI Testing
 *
 * Provides Playwright-inspired matchers for testing hightea components.
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
import type { AutoLocator, Rect } from "@hightea/term/testing"

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
