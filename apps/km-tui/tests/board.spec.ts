import { describe, test, expect } from "bun:test";
import { item, testEnv } from "./helpers/board-test.ts";

describe("Board Spec - Structural Tests", () => {
  test.todo("node shifting (move to different column)", () => {
    // TODO: Column-to-column move not implemented via keybindings
    // SHIFT_LEFT/RIGHT are for indent/outdent, not column moves
    // ENTER_MOVE_MODE/CONFIRM_MOVE/CANCEL_MOVE return beepUnimplemented()
    // Function moveCardToColumn() exists but no command triggers it for columns
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    );

    // BEFORE: 1a is descendant of col1
    board.expect("#col1 #1a").toExist();
    board.expect("#1b").toExist();

    // Would need move mode or column shift command
    // board.press(...);

    // AFTER: 1a should be child of col2
    board.expect("#col2 #1a").toExist();
    board.expect("#col1 #1a").not.toExist();
  });

  test("cursor movement with j/k", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    );

    // Cursor starts on 1a
    board.expect("#1a[data-cursor]").toExist();

    // Move down
    board.press("j");
    board.expect("#1b[data-cursor]").toExist();

    // Move down again
    board.press("j");
    board.expect("#1c[data-cursor]").toExist();

    // Move up
    board.press("k");
    board.expect("#1b[data-cursor]").toExist();
  });
});

describe("Board Spec - Visual Layout Tests", () => {
  test("columns are horizontal", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    );

    const col1Box = board.q("#col1").boundingBox();
    const col2Box = board.q("#col2").boundingBox();

    // col2 is to the right of col1
    expect(col2Box!.x).toBeGreaterThan(col1Box!.x);
    // Both columns aligned top
    expect(col2Box!.y).toBe(col1Box!.y);
  });

  test("cards stack vertically", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    );

    const aBox = board.q("#1a").boundingBox();
    const bBox = board.q("#1b").boundingBox();

    // 1b below 1a
    expect(bBox!.y).toBeGreaterThan(aBox!.y);
    // aligned left
    expect(bBox!.x).toBe(aBox!.x);
  });
});

describe("Board Spec - Zoom Navigation", () => {
  test("Enter zooms into card with children", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("subcard")))),
    );

    // Start at root, card is visible
    board.expect("#card").toExist();
    board.expect("#subcard").toExist();

    // Press Enter to zoom into card
    board.press("\r");

    // Now viewing card as root - subcard still visible
    board.expect("#subcard").toExist();
  });

  test("Escape zooms out to parent", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("subcard")))),
    );

    // Zoom into card first by pressing Enter
    board.press("\r");
    board.expect("#subcard").toExist();

    // Zoom back out with Escape
    board.press("\x1B");

    // Should be back at board level
    board.expect("#col").toExist();
    board.expect("#card").toExist();
  });
});

describe("Board Spec - Display and Rendering", () => {
  test("board shows header path on first render", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))));

    const output = board.screenshot();

    // Header should show the path immediately on first render
    expect(output).toContain("board");
    expect(output).toContain("task");

    // First non-empty line should contain the path
    const lines = output.split("\n").filter((l) => l.trim().length > 0);
    expect(lines[0]).toContain("board");
  });

  test("card content does not overflow into borders", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("Stretching exercises for morning routine")),
      ),
    );

    const output = board.screenshot();
    const lines = output.split("\n");

    // Check that text doesn't bleed into box-drawing border characters
    for (const line of lines) {
      const hasOverflow = /[a-zA-Z]\u2500|\u2500[a-zA-Z]/.test(line);
      expect(hasOverflow).toBe(false);
    }
  });

  test.todo("columns show side by side", () => {
    // TODO: Layout width constraints - 3 columns may not fit in 80 columns
    // Either increase test width or reduce number of columns
    const { board } = testEnv(() =>
      item("board", item("Todo"), item("InProgress"), item("Done")),
    );

    const output = board.screenshot();

    // All column names should appear
    expect(output).toContain("Todo");
    expect(output).toContain("InProgress");
    expect(output).toContain("Done");

    // Find the lines with column headers - they should be on same line
    const lines = output.split("\n");
    const headerLine = lines.find(
      (l) =>
        l.includes("Todo") && l.includes("InProgress") && l.includes("Done"),
    );
    expect(headerLine).toBeDefined();
  });

  test("column headers show card count", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("task1"), item("task2"), item("task3"))),
    );

    const output = board.screenshot();
    expect(output).toContain("(3)");
  });
});

describe("Board Spec - Navigation History", () => {
  test("back navigation with [ after zoom", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("card1"), item("card2", item("sub1"), item("sub2"))),
      ),
    );

    // Move to card2
    board.press("j");
    board.expect("#card2[data-cursor]").toExist();

    // Zoom in
    board.press("\r");
    board.expect("#sub1").toExist();

    // Navigate back with [
    board.press("[");

    // Should be back at root with card2 selected
    board.expect("#card1").toExist();
    board.expect("#card2[data-cursor]").toExist();
  });

  test("forward navigation with ] restores zoom", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("childA"), item("childB")))),
    );

    // Zoom into card
    board.press("\r");
    board.expect("#childA").toExist();

    // Navigate back
    board.press("[");
    board.expect("#card").toExist();

    // Navigate forward with ]
    board.press("]");

    // Should be back in zoomed view
    board.expect("#childA").toExist();
    board.expect("#childB").toExist();
  });
});

describe("Board Spec - Content Display", () => {
  test("wiki links render without brackets", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("Check out [[my note]] for details"))),
    );

    const output = board.screenshot();

    // Link text should appear without brackets
    expect(output).toContain("my note");
    expect(output).not.toContain("[[");
    expect(output).not.toContain("]]");
  });

  test("aliased wiki links show only the alias", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("See [[MDTasks/tasks-system|task-system]] for info")),
      ),
    );

    const output = board.screenshot();

    // Should show the alias, not the path
    expect(output).toContain("task-system");
    expect(output).not.toContain("MDTasks");
    expect(output).not.toContain("[[");
    expect(output).not.toContain("]]");
  });
});

describe("Board Spec - Dialog Interactions", () => {
  test("new item dialog shows on 'n' key", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))));

    // Press 'n' to open new item dialog
    board.press("n");

    const output = board.screenshot();

    // Should show dialog
    expect(output).toContain("New");
    expect(output).toContain("Enter:create");
    expect(output).toContain("Esc:cancel");
  });

  test("new item dialog closes on Escape", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))));

    // Open dialog with 'n'
    board.press("n");
    let output = board.screenshot();
    expect(output).toContain("New");

    // Close with Escape
    board.press("\x1b");
    output = board.screenshot();

    // Dialog should be gone (check for absence of dialog-specific text)
    expect(output).not.toContain("Enter:create");
  });
});
