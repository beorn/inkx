/**
 * Shell Executor Tests
 *
 * Tests for km-sh shell execution.
 */

import { describe, it, expect } from "bun:test";
import {
  runShell,
  executeCommand,
  serializeState,
  formatStateHuman,
  renderAsciiView,
} from "../src/shellExecutor.ts";
import { createInitialBoardState } from "../src/boardReducer.ts";
import type { ColumnState, CardState, BoardState } from "../src/types.ts";
import type { OutputEvent } from "../src/shellExecutor.ts";

// Helper to create test state
function createTestState(): BoardState {
  const columns: ColumnState[] = [
    {
      nodeId: "col-1",
      title: "Todo",
      cards: [
        {
          nodeId: "card-1",
          title: "Task 1",
          childCount: 0,
          isTask: true,
          taskStatus: "todo",
        },
        {
          nodeId: "card-2",
          title: "Task 2",
          childCount: 2,
          isTask: true,
          taskStatus: "wip",
        },
        {
          nodeId: "card-3",
          title: "Task 3",
          childCount: 0,
          isTask: true,
          taskStatus: "done",
        },
      ],
    },
    {
      nodeId: "col-2",
      title: "In Progress",
      cards: [
        {
          nodeId: "card-4",
          title: "Task 4",
          childCount: 0,
          isTask: true,
          taskStatus: "wip",
        },
      ],
    },
  ];

  return createInitialBoardState(columns, "root-1", "/test/vault");
}

describe("serializeState", () => {
  it("converts Sets to arrays", () => {
    const state = createTestState();
    state.selectedCards.add("card-1");
    state.selectedCards.add("card-2");
    state.foldedCards.add("card-3");
    state.collapsedColumns.add(1);

    const serialized = serializeState(state);

    expect(serialized.selectedCards).toEqual(["card-1", "card-2"]);
    expect(serialized.foldedCards).toEqual(["card-3"]);
    expect(serialized.collapsedColumns).toEqual([1]);
  });

  it("includes position info", () => {
    const state = createTestState();
    state.colIndex = 1;
    state.cardIndex = 0;

    const serialized = serializeState(state);

    expect(serialized.colIndex).toBe(1);
    expect(serialized.cardIndex).toBe(0);
    expect(serialized.columnCount).toBe(2);
    expect(serialized.cardCounts).toEqual([3, 1]);
  });
});

describe("formatStateHuman", () => {
  it("formats position", () => {
    const state = createTestState();
    const output = formatStateHuman(state);

    expect(output).toContain("col=0");
    expect(output).toContain("card=0");
    expect(output).toContain("Todo");
  });

  it("shows selected cards count", () => {
    const state = createTestState();
    state.selectedCards.add("card-1");
    state.selectedCards.add("card-2");

    const output = formatStateHuman(state);
    expect(output).toContain("selected: 2");
  });

  it("shows search mode", () => {
    const state = createTestState();
    state.searchMode = true;
    state.searchQuery = "test query";

    const output = formatStateHuman(state);
    expect(output).toContain("search:");
    expect(output).toContain("test query");
  });
});

describe("renderAsciiView", () => {
  it("renders columns and cards", () => {
    const state = createTestState();
    const view = renderAsciiView(state);

    expect(view).toContain("Todo");
    expect(view).toContain("In Progress");
    expect(view).toContain("Task 1");
    expect(view).toContain("Task 4");
  });

  it("marks selected column", () => {
    const state = createTestState();
    const view = renderAsciiView(state);

    // First column (selected) should have marker
    expect(view).toContain("▶");
  });

  it("shows task status icons", () => {
    const state = createTestState();
    const view = renderAsciiView(state);

    expect(view).toContain("○"); // todo
    expect(view).toContain("◐"); // wip
    expect(view).toContain("✓"); // done
  });

  it("shows child count", () => {
    const state = createTestState();
    const view = renderAsciiView(state);

    expect(view).toContain("(+2)"); // Task 2 has 2 children
  });

  it("shows folded marker", () => {
    const state = createTestState();
    state.foldedCards.add("card-2");
    const view = renderAsciiView(state);

    expect(view).toContain("▸"); // folded marker
  });
});

describe("executeCommand", () => {
  it("executes move_down", () => {
    const state = createTestState();
    const outputs: string[] = [];
    const ctx = {
      state,
      jsonMode: false,
      output: (e: OutputEvent | string) => {
        if (typeof e === "string") outputs.push(e);
      },
    };

    const result = executeCommand("move_down", ctx);

    expect(result.state.cardIndex).toBe(1);
    expect(result.quit).toBe(false);
  });

  it("executes quit command", () => {
    const state = createTestState();
    const ctx = {
      state,
      jsonMode: false,
      output: () => {},
    };

    const result = executeCommand("quit", ctx);

    expect(result.quit).toBe(true);
  });

  it("handles unknown command", () => {
    const state = createTestState();
    const outputs: string[] = [];
    const ctx = {
      state,
      jsonMode: false,
      output: (e: OutputEvent | string) => {
        if (typeof e === "string") outputs.push(e);
      },
    };

    const result = executeCommand("unknown_cmd", ctx);

    expect(result.state).toBe(state); // State unchanged
    expect(outputs.some((o) => o.includes("error"))).toBe(true);
  });

  it("handles key j as move_down", () => {
    const state = createTestState();
    const ctx = {
      state,
      jsonMode: false,
      output: () => {},
    };

    const result = executeCommand("key j", ctx);

    expect(result.state.cardIndex).toBe(1);
  });

  it("handles key k as move_up", () => {
    const state = createTestState();
    state.cardIndex = 1;
    const ctx = {
      state,
      jsonMode: false,
      output: () => {},
    };

    const result = executeCommand("key k", ctx);

    expect(result.state.cardIndex).toBe(0);
  });
});

describe("runShell", () => {
  it("executes multiple commands", () => {
    const state = createTestState();
    const outputs: (OutputEvent | string)[] = [];

    const finalState = runShell(
      ["move_down", "move_down"],
      state,
      { output: (e) => outputs.push(e) },
    );

    expect(finalState.cardIndex).toBe(2);
  });

  it("stops on quit", () => {
    const state = createTestState();

    const finalState = runShell(
      ["move_down", "quit", "move_down"],
      state,
      { output: () => {} },
    );

    // Should stop after quit, so only one move_down executed
    expect(finalState.cardIndex).toBe(1);
  });

  it("skips comments and empty lines", () => {
    const state = createTestState();

    const finalState = runShell(
      ["# comment", "", "move_down", "   ", "move_down"],
      state,
      { output: () => {} },
    );

    expect(finalState.cardIndex).toBe(2);
  });

  it("outputs JSON in json mode", () => {
    const state = createTestState();
    const outputs: OutputEvent[] = [];

    runShell(
      ["move_down"],
      state,
      {
        jsonMode: true,
        output: (e) => {
          if (typeof e !== "string") outputs.push(e);
        },
      },
    );

    // Should have init, action, and state events
    const events = outputs.map((o) => o.event);
    expect(events).toContain("init");
    expect(events).toContain("action");
    expect(events).toContain("state");
  });

  it("handles state command", () => {
    const state = createTestState();
    const outputs: string[] = [];

    runShell(
      ["state"],
      state,
      {
        jsonMode: false,
        output: (e) => {
          if (typeof e === "string") outputs.push(e);
        },
      },
    );

    expect(outputs.some((o) => o.includes("col=0"))).toBe(true);
  });

  it("handles view command", () => {
    const state = createTestState();
    const outputs: string[] = [];

    runShell(
      ["view"],
      state,
      {
        jsonMode: false,
        output: (e) => {
          if (typeof e === "string") outputs.push(e);
        },
      },
    );

    expect(outputs.some((o) => o.includes("Todo"))).toBe(true);
  });
});

describe("runShell - integration scenarios", () => {
  it("navigates around the board", () => {
    const state = createTestState();

    const finalState = runShell(
      [
        "move_down",      // card 0 -> 1
        "move_down",      // card 1 -> 2
        "move_right",     // col 0 -> 1, card resets to 0
        "jump_bottom",    // still card 0 (only 1 card in col 1)
      ],
      state,
      { output: () => {} },
    );

    expect(finalState.colIndex).toBe(1);
    expect(finalState.cardIndex).toBe(0);
  });

  it("manages selection", () => {
    const state = createTestState();

    const finalState = runShell(
      [
        "select_card_add card-1",
        "select_card_add card-2",
        "select_card_toggle card-1", // Remove card-1
      ],
      state,
      { output: () => {} },
    );

    expect(finalState.selectedCards.has("card-1")).toBe(false);
    expect(finalState.selectedCards.has("card-2")).toBe(true);
  });

  it("manages fold state", () => {
    const state = createTestState();

    const finalState = runShell(
      [
        "toggle_fold card-2",
        "fold_column 0",  // Fold all in column 0
      ],
      state,
      { output: () => {} },
    );

    expect(finalState.foldedCards.has("card-1")).toBe(true);
    expect(finalState.foldedCards.has("card-2")).toBe(true);
    expect(finalState.foldedCards.has("card-3")).toBe(true);
  });

  it("handles JSON input", () => {
    const state = createTestState();

    const finalState = runShell(
      [
        '{"type": "MOVE_DOWN"}',
        '{"type": "MOVE_DOWN"}',
      ],
      state,
      { jsonMode: true, output: () => {} },
    );

    expect(finalState.cardIndex).toBe(2);
  });
});
