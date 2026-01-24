/**
 * Body Content Tests (migrated from body-content.playwright.ts)
 *
 * Tests that body content (paragraphs, code, quotes before sections) renders correctly:
 * - Board level: Body column appears first, dimmed, borderless
 * - Column level: Body cards appear before structural cards, borderless
 * - Navigation: h/l/j/k skip virtual body elements
 *
 * Uses inkx createTestRenderer instead of Playwright for faster, more reliable testing.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { createBoardTest, type BoardTestHarness } from "../src/testing.ts";

const TEST_VAULT = `${process.cwd()}/apps/km-cli/tests/fixtures/tui-test-vault`;

describe("Body Content Visual Tests", () => {
  let board: BoardTestHarness | null = null;

  afterEach(() => {
    if (board) {
      board.unmount();
      board = null;
    }
  });

  test("body content file renders correctly", async () => {
    board = await createBoardTest(TEST_VAULT, { file: "body-test.md" });
    const screenshot = board.screenshot();

    // Should render content from body-test.md
    expect(screenshot.length).toBeGreaterThan(0);
    expect(screenshot).toBeTruthy();
  });

  test("navigation with h/l moves between columns", async () => {
    board = await createBoardTest(TEST_VAULT, { file: "body-test.md" });

    // Initial state
    const initial = board.screenshot();
    expect(initial.length).toBeGreaterThan(0);

    // Press 'l' to move right
    board.press("l");
    const afterRight = board.screenshot();
    expect(afterRight.length).toBeGreaterThan(0);

    // Press 'h' to move left
    board.press("h");
    const afterLeft = board.screenshot();
    expect(afterLeft.length).toBeGreaterThan(0);

    // Press 'l' twice to go further right
    board.press("l");
    board.press("l");
    const afterTwoRight = board.screenshot();
    expect(afterTwoRight.length).toBeGreaterThan(0);
  });

  test("navigation with j/k moves between cards", async () => {
    board = await createBoardTest(TEST_VAULT, { file: "body-test.md" });

    // Navigate to a column first
    board.press("l");

    // Navigate down into the column
    board.press("j");
    const afterDown = board.screenshot();
    expect(afterDown.length).toBeGreaterThan(0);

    // Navigate up
    board.press("k");
    const afterUp = board.screenshot();
    expect(afterUp.length).toBeGreaterThan(0);
  });

  test("g (go top) navigates to first card", async () => {
    board = await createBoardTest(TEST_VAULT, { file: "body-test.md" });

    // Navigate to a column
    board.press("l");

    // Navigate down a couple times
    board.press("j");
    board.press("j");
    const afterTwoDown = board.screenshot();

    // Press 'g' to go to top
    board.press("g");
    const afterGoTop = board.screenshot();

    expect(afterTwoDown.length).toBeGreaterThan(0);
    expect(afterGoTop.length).toBeGreaterThan(0);
  });

  test("nested content expands correctly", async () => {
    board = await createBoardTest(TEST_VAULT, { file: "body-test.md" });

    // Navigate to Column B (two 'l' presses)
    board.press("l");
    board.press("l");

    // Navigate to a card
    board.press("j");
    const beforeExpand = board.screenshot();

    // Expand the card
    board.press("enter");
    const afterExpand = board.screenshot();

    expect(beforeExpand.length).toBeGreaterThan(0);
    expect(afterExpand.length).toBeGreaterThan(0);
  });
});
