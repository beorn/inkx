/**
 * Board Test Helper - Fluent API for Visual Board Testing
 *
 * Wraps inkx createTestRenderer with a concise, documentation-like API
 * for testing TUI board rendering.
 *
 * ## Current Limitations
 *
 * Uses InkBoardTestable (static render) because the full Board component
 * depends on @km/storage globals. This means:
 * - ✅ Static visual testing works (content assertions, position assertions)
 * - ❌ Keyboard navigation (press/moveTo) does NOT change state
 *
 * For keyboard navigation testing, the Board component needs refactoring
 * to accept state via props instead of calling storage functions directly.
 *
 * @example
 * ```typescript
 * const b = renderBoard(SIMPLE_BOARD);
 *
 * // Content assertions - works!
 * b.expectVisible('Task 1');
 * b.expect('Task 1').toBeVisible();
 *
 * // Screenshot for debugging
 * console.log(b.screenshot());
 * ```
 */

import React from "react";
import {
  createTestRenderer,
  createLocator,
  type InkxLocator,
  type RenderResult,
} from "inkx/testing";
import { expect } from "bun:test";

import { InkBoardTestable } from "../../src/views/Board.tsx";
import type { BoardState } from "../../src/types.ts";

// NOTE: The full Board component requires @km/storage initialization, so we use
// InkBoardTestable which is a static version that accepts dimensions via props.
// This means keyboard navigation via press() won't actually change state -
// for interactive testing, the component needs to be refactored to accept
// state via props rather than calling storage functions directly.
import {
  createBoardState as createBoardStateFixture,
  createColumnState,
  createCardState,
} from "../fixtures/board-fixtures.ts";

// =============================================================================
// Types
// =============================================================================

interface BoardTestOptions {
  columns?: number;
  rows?: number;
}

interface CursorPosition {
  col?: number;
  card?: number;
}

/**
 * Content assertion builder - returned by expect(text)
 */
interface ContentAssertion {
  /** Assert the text is visible in the rendered output */
  toBeVisible(): BoardTest;
  /** Assert the text is in a specific column */
  inColumn(title: string): BoardTest;
  /** Assert this element is positioned left of another */
  toBeLeftOf(testId: string): BoardTest;
  /** Assert this element is positioned right of another */
  toBeRightOf(testId: string): BoardTest;
  /** Assert this element is positioned above another */
  toBeAbove(testId: string): BoardTest;
  /** Assert this element is positioned below another */
  toBeBelow(testId: string): BoardTest;
}

/**
 * Main board test interface - fluent API for testing board navigation
 */
interface BoardTest {
  // === Actions ===

  /** Send a key press to the board */
  press(key: string): this;

  /** Send multiple key presses */
  pressSequence(...keys: string[]): this;

  /** Type text input */
  type(text: string): this;

  /** Navigate cursor to a specific position (via multiple key presses) */
  moveTo(pos: CursorPosition): this;

  // === Cursor Assertions ===

  /** Assert cursor is at a specific column/card position */
  expectCursor(pos: CursorPosition): this;

  /** Assert a specific text is selected (has cursor) */
  expectSelected(text: string): this;

  // === Content Assertions ===

  /** Start a content assertion chain */
  expect(text: string): ContentAssertion;

  /** Assert number of columns */
  expectColumnCount(n: number): this;

  /** Assert text is visible in the output */
  expectVisible(text: string): this;

  /** Assert text is NOT visible in the output */
  expectNotVisible(text: string): this;

  // === Position Assertions ===

  /** Assert element A is positioned left of element B (by testID) */
  expectLeftOf(a: string, b: string): this;

  /** Assert element A is positioned right of element B (by testID) */
  expectRightOf(a: string, b: string): this;

  /** Assert element A is positioned above element B (by testID) */
  expectAbove(a: string, b: string): this;

  /** Assert element A is positioned below element B (by testID) */
  expectBelow(a: string, b: string): this;

  // === Debug ===

  /** Get the current frame as plain text (for debugging) */
  screenshot(): string;

  /** Get the current frame with ANSI codes */
  screenshotAnsi(): string;

  /** Get the inkx locator for advanced queries */
  locator(): InkxLocator;

  /** Get the underlying render result for advanced use */
  renderResult(): RenderResult;
}

// =============================================================================
// Implementation
// =============================================================================

class BoardTestImpl implements BoardTest {
  private result: RenderResult;
  private currentLocator: InkxLocator;

  constructor(result: RenderResult) {
    this.result = result;
    this.currentLocator = createLocator(result.getContainer());
  }

  // --- Actions ---

  press(key: string): this {
    this.result.stdin.write(key);
    // Refresh locator after state change
    this.currentLocator = createLocator(this.result.getContainer());
    return this;
  }

  pressSequence(...keys: string[]): this {
    for (const key of keys) {
      this.press(key);
    }
    return this;
  }

  type(text: string): this {
    for (const char of text) {
      this.result.stdin.write(char);
    }
    this.currentLocator = createLocator(this.result.getContainer());
    return this;
  }

  moveTo(pos: CursorPosition): this {
    // Simple movement - press h/l for columns, j/k for cards
    // This is a convenience method; tests can also use press() directly
    // NOTE: This assumes starting from origin - for complex navigation, use press()
    if (pos.col !== undefined) {
      for (let i = 0; i < pos.col; i++) {
        this.press("l");
      }
    }
    if (pos.card !== undefined) {
      for (let i = 0; i < pos.card; i++) {
        this.press("j");
      }
    }
    return this;
  }

  // --- Cursor Assertions ---

  expectCursor(pos: CursorPosition): this {
    // Find the cursor element by testID
    const cursor = this.currentLocator.getByTestId("cursor");
    const cursorBox = cursor.boundingBox();

    expect(cursorBox).not.toBeNull();

    if (pos.col !== undefined) {
      // Find the target column and compare X positions
      const column = this.currentLocator.getByTestId(`column-${pos.col}`);
      const colBox = column.boundingBox();
      expect(colBox).not.toBeNull();

      // Cursor should be within the column's X range
      if (cursorBox && colBox) {
        expect(cursorBox.x).toBeGreaterThanOrEqual(colBox.x);
        expect(cursorBox.x).toBeLessThan(colBox.x + colBox.width);
      }
    }

    if (pos.card !== undefined) {
      // Find the card at the expected index within the current column
      // This requires the card to have a testID like "card-{colIndex}-{cardIndex}"
      const card = this.currentLocator.getByTestId(
        `card-${pos.col ?? 0}-${pos.card}`,
      );
      const cardBox = card.boundingBox();

      if (cardBox && cursorBox) {
        // Cursor Y should overlap with card Y
        expect(cursorBox.y).toBeGreaterThanOrEqual(cardBox.y);
        expect(cursorBox.y).toBeLessThan(cardBox.y + cardBox.height);
      }
    }

    return this;
  }

  expectSelected(text: string): this {
    // Find text and check if it has selection styling
    const element = this.currentLocator.getByText(text);
    expect(element.count()).toBeGreaterThan(0);

    // Check if parent has selection attribute
    const selected = this.currentLocator.locator('[data-selected="true"]');
    const selectedTexts = selected.resolveAll().map((node) => {
      // Get text content recursively
      const getTextContent = (n: typeof node): string => {
        if (n.textContent !== undefined) return n.textContent;
        return n.children.map(getTextContent).join("");
      };
      return getTextContent(node);
    });

    expect(selectedTexts.some((t) => t.includes(text))).toBe(true);
    return this;
  }

  // --- Content Assertions ---

  expect(text: string): ContentAssertion {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- needed to reference BoardTest in returned object
    const self = this;
    const element = this.currentLocator.getByText(text);

    return {
      toBeVisible(): BoardTest {
        expect(element.count()).toBeGreaterThan(0);
        expect(element.isVisible()).toBe(true);
        return self;
      },

      inColumn(title: string): BoardTest {
        // Find the column by its title text
        const column = self.currentLocator.getByText(title);
        expect(column.count()).toBeGreaterThan(0);

        const colBox = column.boundingBox();
        const textBox = element.boundingBox();

        expect(colBox).not.toBeNull();
        expect(textBox).not.toBeNull();

        if (colBox && textBox) {
          // Text should be within the column's X range
          expect(textBox.x).toBeGreaterThanOrEqual(colBox.x);
        }

        return self;
      },

      toBeLeftOf(testId: string): BoardTest {
        const other = self.currentLocator.getByTestId(testId);
        const textBox = element.boundingBox();
        const otherBox = other.boundingBox();

        expect(textBox).not.toBeNull();
        expect(otherBox).not.toBeNull();

        if (textBox && otherBox) {
          expect(textBox.x + textBox.width).toBeLessThanOrEqual(otherBox.x);
        }

        return self;
      },

      toBeRightOf(testId: string): BoardTest {
        const other = self.currentLocator.getByTestId(testId);
        const textBox = element.boundingBox();
        const otherBox = other.boundingBox();

        expect(textBox).not.toBeNull();
        expect(otherBox).not.toBeNull();

        if (textBox && otherBox) {
          expect(textBox.x).toBeGreaterThanOrEqual(otherBox.x + otherBox.width);
        }

        return self;
      },

      toBeAbove(testId: string): BoardTest {
        const other = self.currentLocator.getByTestId(testId);
        const textBox = element.boundingBox();
        const otherBox = other.boundingBox();

        expect(textBox).not.toBeNull();
        expect(otherBox).not.toBeNull();

        if (textBox && otherBox) {
          expect(textBox.y + textBox.height).toBeLessThanOrEqual(otherBox.y);
        }

        return self;
      },

      toBeBelow(testId: string): BoardTest {
        const other = self.currentLocator.getByTestId(testId);
        const textBox = element.boundingBox();
        const otherBox = other.boundingBox();

        expect(textBox).not.toBeNull();
        expect(otherBox).not.toBeNull();

        if (textBox && otherBox) {
          expect(textBox.y).toBeGreaterThanOrEqual(
            otherBox.y + otherBox.height,
          );
        }

        return self;
      },
    };
  }

  expectColumnCount(n: number): this {
    // Count columns by testID pattern
    let count = 0;
    for (let i = 0; i < 20; i++) {
      // reasonable max
      const col = this.currentLocator.getByTestId(`column-${i}`);
      if (col.count() > 0) {
        count++;
      } else {
        break;
      }
    }
    expect(count).toBe(n);
    return this;
  }

  expectVisible(text: string): this {
    const frame = this.result.lastFrameText();
    expect(frame).toBeDefined();
    expect(frame).toContain(text);
    return this;
  }

  expectNotVisible(text: string): this {
    const frame = this.result.lastFrameText();
    expect(frame).toBeDefined();
    expect(frame).not.toContain(text);
    return this;
  }

  // --- Position Assertions ---

  expectLeftOf(a: string, b: string): this {
    const aEl = this.currentLocator.getByTestId(a);
    const bEl = this.currentLocator.getByTestId(b);

    const aBox = aEl.boundingBox();
    const bBox = bEl.boundingBox();

    expect(aBox).not.toBeNull();
    expect(bBox).not.toBeNull();

    if (aBox && bBox) {
      expect(aBox.x + aBox.width).toBeLessThanOrEqual(bBox.x);
    }

    return this;
  }

  expectRightOf(a: string, b: string): this {
    const aEl = this.currentLocator.getByTestId(a);
    const bEl = this.currentLocator.getByTestId(b);

    const aBox = aEl.boundingBox();
    const bBox = bEl.boundingBox();

    expect(aBox).not.toBeNull();
    expect(bBox).not.toBeNull();

    if (aBox && bBox) {
      expect(aBox.x).toBeGreaterThanOrEqual(bBox.x + bBox.width);
    }

    return this;
  }

  expectAbove(a: string, b: string): this {
    const aEl = this.currentLocator.getByTestId(a);
    const bEl = this.currentLocator.getByTestId(b);

    const aBox = aEl.boundingBox();
    const bBox = bEl.boundingBox();

    expect(aBox).not.toBeNull();
    expect(bBox).not.toBeNull();

    if (aBox && bBox) {
      expect(aBox.y + aBox.height).toBeLessThanOrEqual(bBox.y);
    }

    return this;
  }

  expectBelow(a: string, b: string): this {
    const aEl = this.currentLocator.getByTestId(a);
    const bEl = this.currentLocator.getByTestId(b);

    const aBox = aEl.boundingBox();
    const bBox = bEl.boundingBox();

    expect(aBox).not.toBeNull();
    expect(bBox).not.toBeNull();

    if (aBox && bBox) {
      expect(aBox.y).toBeGreaterThanOrEqual(bBox.y + bBox.height);
    }

    return this;
  }

  // --- Debug ---

  screenshot(): string {
    return this.result.lastFrameText() ?? "";
  }

  screenshotAnsi(): string {
    return this.result.lastFrame() ?? "";
  }

  locator(): InkxLocator {
    return this.currentLocator;
  }

  renderResult(): RenderResult {
    return this.result;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Render a board with the given state and return a test helper
 */
export function renderBoard(
  state: BoardState,
  options: BoardTestOptions = {},
): BoardTest {
  const { columns = 80, rows = 24 } = options;

  const render = createTestRenderer({ columns, rows });
  const result = render(
    React.createElement(InkBoardTestable, {
      initialState: state,
      testWidth: columns,
      testHeight: rows,
    }),
  );

  return new BoardTestImpl(result);
}

// =============================================================================
// Fixture Builders - Concise DSL for creating test boards
// =============================================================================

/**
 * Create a column for the board DSL
 */
export function column(
  title: string,
  cards: (string | { title: string; children?: string[] })[],
) {
  const cardStates = cards.map((card, idx) => {
    if (typeof card === "string") {
      return createCardState({ content: card, parent_idx: idx });
    }
    const children = (card.children ?? []).map((childContent, childIdx) => ({
      id: `child-${idx}-${childIdx}`,
      type: "task" as const,
      parent_id: `card-${idx}`,
      parent_idx: childIdx,
      content: childContent,
      data: {},
      link_to: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }));
    return createCardState({ content: card.title, parent_idx: idx }, children);
  });

  return createColumnState({ content: title }, cardStates);
}

/**
 * Create a board fixture from columns
 *
 * @example
 * ```typescript
 * const SIMPLE_BOARD = board({
 *   columns: [
 *     column('To Do', ['Task 1', 'Task 2']),
 *     column('Done', ['Task 3']),
 *   ],
 * });
 * ```
 */
export function board(config: {
  columns: ReturnType<typeof column>[];
}): BoardState {
  return createBoardStateFixture(config.columns, {
    colIndex: 0,
    cardIndex: 0,
  });
}

// =============================================================================
// Common Fixtures
// =============================================================================

/**
 * Simple 2-column board with basic tasks
 */
export const SIMPLE_BOARD = board({
  columns: [column("To Do", ["Task 1", "Task 2"]), column("Done", ["Task 3"])],
});

/**
 * Board with nested sections
 */
export const NESTED_BOARD = board({
  columns: [
    column("Project", [
      { title: "Phase 1", children: ["Design", "Build"] },
      { title: "Phase 2", children: ["Test", "Deploy"] },
    ]),
  ],
});

/**
 * Board with many items for scroll testing
 */
export const LONG_BOARD = board({
  columns: [
    column(
      "Tasks",
      Array.from({ length: 20 }, (_, i) => `Task ${i + 1}`),
    ),
  ],
});

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { BoardTest, ContentAssertion, CursorPosition, BoardTestOptions };
