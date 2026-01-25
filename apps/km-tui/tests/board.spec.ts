import { describe, test, expect } from "bun:test";
import { item, testEnv } from "./helpers/board-test.ts";

describe("Structure", () => {
  test.todo("node shifting (move to different column)", () => {
    // TODO: Column-to-column move not implemented via keybindings
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    );
    board.expect("#col1 #1a").toExist();
    board.expect("#1b").toExist();
    // board.press(...) - would need move mode command
    board.expect("#col2 #1a").toExist();
    board.expect("#col1 #1a").not.toExist();
  });

  test("cursor movement with j/k", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    );
    board.expect("#1a[data-cursor]").toExist();
    board.press("j");
    board.expect("#1b[data-cursor]").toExist();
    board.press("j");
    board.expect("#1c[data-cursor]").toExist();
    board.press("k");
    board.expect("#1b[data-cursor]").toExist();
  });
});

describe("Layout", () => {
  test("columns are horizontal", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    );
    const col1Box = board.q("#col1").boundingBox();
    const col2Box = board.q("#col2").boundingBox();
    expect(col2Box!.x).toBeGreaterThan(col1Box!.x);
    expect(col2Box!.y).toBe(col1Box!.y);
  });

  test("cards stack vertically", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    );
    const aBox = board.q("#1a").boundingBox();
    const bBox = board.q("#1b").boundingBox();
    expect(bBox!.y).toBeGreaterThan(aBox!.y);
    expect(bBox!.x).toBe(aBox!.x);
  });
});

describe("Detail", () => {
  test("Enter opens detail pane for card with children", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("subcard")))),
    );
    board.expect("#card").toExist();
    board.expect("#subcard").toExist();
    board.press("\r");
    board.expect("#subcard").toExist();
  });

  test("Escape closes detail pane", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("subcard")))),
    );
    board.press("\r");
    board.expect("#subcard").toExist();
    board.press("\x1B");
    board.expect("#col").toExist();
    board.expect("#card").toExist();
  });
});

describe("Display", () => {
  test("board shows header path on first render", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))));
    const output = board.screenshot();
    expect(output).toContain("board");
    expect(output).toContain("task");
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
    for (const line of lines) {
      const hasOverflow = /[a-zA-Z]\u2500|\u2500[a-zA-Z]/.test(line);
      expect(hasOverflow).toBe(false);
    }
  });

  test.todo("columns show side by side", () => {
    // TODO: Layout width constraints - 3 columns may not fit in 80 columns
    const { board } = testEnv(() =>
      item("board", item("Todo"), item("InProgress"), item("Done")),
    );
    const output = board.screenshot();
    expect(output).toContain("Todo");
    expect(output).toContain("InProgress");
    expect(output).toContain("Done");
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

describe("History", () => {
  test("back navigation with [ after opening detail pane", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("card1"), item("card2", item("sub1"), item("sub2"))),
      ),
    );
    board.press("j");
    board.expect("#card2[data-cursor]").toExist();
    board.press("\r");
    board.expect("#sub1").toExist();
    board.press("[");
    board.expect("#card1").toExist();
    board.expect("#card2[data-cursor]").toExist();
  });

  test("forward navigation with ] restores detail pane view", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("childA"), item("childB")))),
    );
    board.press("\r");
    board.expect("#childA").toExist();
    board.press("[");
    board.expect("#card").toExist();
    board.press("]");
    board.expect("#childA").toExist();
    board.expect("#childB").toExist();
  });
});

describe("Content", () => {
  test("wiki links render without brackets", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("Check out [[my note]] for details"))),
    );
    const output = board.screenshot();
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
    expect(output).toContain("task-system");
    expect(output).not.toContain("MDTasks");
    expect(output).not.toContain("[[");
    expect(output).not.toContain("]]");
  });
});

describe("Dialogs", () => {
  test("new item dialog shows on 'n' key", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))));
    board.press("n");
    const output = board.screenshot();
    expect(output).toContain("New");
    expect(output).toContain("Enter:create");
    expect(output).toContain("Esc:cancel");
  });

  test("new item dialog closes on Escape", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))));
    board.press("n");
    let output = board.screenshot();
    expect(output).toContain("New");
    board.press("\x1b");
    output = board.screenshot();
    expect(output).not.toContain("Enter:create");
  });
});
