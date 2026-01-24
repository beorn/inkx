/**
 * Board Test Helper - Smoke Tests
 *
 * Verifies the board-test helper works correctly.
 */

import { describe, test, expect } from "bun:test";
import { renderBoard, board, column, SIMPLE_BOARD } from "./board-test.ts";

describe("board-test helper", () => {
  test("renderBoard creates a board test instance", () => {
    const b = renderBoard(SIMPLE_BOARD);
    expect(b).toBeDefined();
    expect(typeof b.press).toBe("function");
    expect(typeof b.expectVisible).toBe("function");
    expect(typeof b.screenshot).toBe("function");
  });

  test("screenshot returns rendered text", () => {
    const b = renderBoard(SIMPLE_BOARD);
    const text = b.screenshot();
    expect(text).toContain("To Do");
    expect(text).toContain("Task 1");
  });

  test("board() fixture DSL creates valid board state", () => {
    const state = board({
      columns: [column("My Column", ["Task A", "Task B"])],
    });

    expect(state.columns).toHaveLength(1);
    expect(state.columns[0]?.cards).toHaveLength(2);
    expect(state.columns[0]?.node.content).toBe("My Column");
  });

  test("expectVisible asserts text is in output", () => {
    const b = renderBoard(SIMPLE_BOARD);
    // Should not throw
    b.expectVisible("Task 1");
    b.expectVisible("To Do");
  });

  test("press sends key but does not change state (InkBoardTestable limitation)", () => {
    const b = renderBoard(SIMPLE_BOARD);
    // NOTE: press() won't actually change navigation state because InkBoardTestable
    // is a static component. For interactive testing, the full Board component
    // needs to be refactored to not depend on @km/storage globals.
    b.press("l");
    // Should still render without crashing
    expect(b.screenshot()).toBeDefined();
  });
});
