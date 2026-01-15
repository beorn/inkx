/**
 * Transformers Tests
 *
 * Unit tests for the view model transformer functions.
 */

import { describe, test, expect } from "bun:test";
import {
  toCardViewModel,
  toColumnViewModel,
  toBoardViewModel,
} from "../src/index.ts";
import {
  createInitialBoardState,
  type ColumnState,
  type CardState,
} from "@km/tui-state";

describe("toCardViewModel", () => {
  test("transforms CardState to CardViewModel", () => {
    const card: CardState = {
      nodeId: "card-123",
      title: "Test Card",
      childCount: 3,
      isTask: true,
      taskStatus: "todo",
      color: "blue",
      icon: "star",
    };

    const vm = toCardViewModel(card, false);

    expect(vm.id).toBe("card-123");
    expect(vm.title).toBe("Test Card");
    expect(vm.childCount).toBe(3);
    expect(vm.isTask).toBe(true);
    expect(vm.taskStatus).toBe("todo");
    expect(vm.color).toBe("blue");
    expect(vm.icon).toBe("star");
    expect(vm.isFolded).toBe(false);
  });

  test("sets isFolded from parameter", () => {
    const card: CardState = {
      nodeId: "card-123",
      title: "Test Card",
      childCount: 0,
      isTask: false,
    };

    const vmFolded = toCardViewModel(card, true);
    expect(vmFolded.isFolded).toBe(true);

    const vmUnfolded = toCardViewModel(card, false);
    expect(vmUnfolded.isFolded).toBe(false);
  });

  test("handles card without optional fields", () => {
    const card: CardState = {
      nodeId: "card-123",
      title: "Simple Card",
      childCount: 0,
      isTask: false,
    };

    const vm = toCardViewModel(card, false);

    expect(vm.taskStatus).toBeUndefined();
    expect(vm.color).toBeUndefined();
    expect(vm.icon).toBeUndefined();
  });
});

describe("toColumnViewModel", () => {
  test("transforms ColumnState to ColumnViewModel", () => {
    const column: ColumnState = {
      nodeId: "col-123",
      title: "Test Column",
      wipLimit: 5,
      cards: [
        { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
        {
          nodeId: "card2",
          title: "Card 2",
          childCount: 2,
          isTask: true,
          taskStatus: "wip",
        },
      ],
    };

    const vm = toColumnViewModel(column, new Set(), false);

    expect(vm.id).toBe("col-123");
    expect(vm.title).toBe("Test Column");
    expect(vm.count).toBe(2);
    expect(vm.wipLimit).toBe(5);
    expect(vm.isOverLimit).toBe(false);
    expect(vm.isCollapsed).toBe(false);
    expect(vm.cards).toHaveLength(2);
    expect(vm.cards[0].title).toBe("Card 1");
    expect(vm.cards[1].title).toBe("Card 2");
  });

  test("sets isOverLimit when cards exceed wipLimit", () => {
    const column: ColumnState = {
      nodeId: "col-123",
      title: "Over Limit",
      wipLimit: 1,
      cards: [
        { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
        { nodeId: "card2", title: "Card 2", childCount: 0, isTask: false },
      ],
    };

    const vm = toColumnViewModel(column, new Set(), false);
    expect(vm.isOverLimit).toBe(true);
  });

  test("isOverLimit false when no wipLimit", () => {
    const column: ColumnState = {
      nodeId: "col-123",
      title: "No Limit",
      cards: [
        { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
        { nodeId: "card2", title: "Card 2", childCount: 0, isTask: false },
      ],
    };

    const vm = toColumnViewModel(column, new Set(), false);
    expect(vm.isOverLimit).toBe(false);
  });

  test("applies folded state to cards", () => {
    const column: ColumnState = {
      nodeId: "col-123",
      title: "Column",
      cards: [
        { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
        { nodeId: "card2", title: "Card 2", childCount: 0, isTask: false },
        { nodeId: "card3", title: "Card 3", childCount: 0, isTask: false },
      ],
    };

    const foldedCards = new Set(["card1", "card3"]);
    const vm = toColumnViewModel(column, foldedCards, false);

    expect(vm.cards[0].isFolded).toBe(true);
    expect(vm.cards[1].isFolded).toBe(false);
    expect(vm.cards[2].isFolded).toBe(true);
  });

  test("sets isCollapsed from parameter", () => {
    const column: ColumnState = {
      nodeId: "col-123",
      title: "Column",
      cards: [],
    };

    const vmCollapsed = toColumnViewModel(column, new Set(), true);
    expect(vmCollapsed.isCollapsed).toBe(true);

    const vmExpanded = toColumnViewModel(column, new Set(), false);
    expect(vmExpanded.isCollapsed).toBe(false);
  });
});

describe("toBoardViewModel", () => {
  function createTestColumns(): ColumnState[] {
    return [
      {
        nodeId: "col1",
        title: "Column 1",
        cards: [
          { nodeId: "card1", title: "Card 1", childCount: 0, isTask: false },
          {
            nodeId: "card2",
            title: "Card 2",
            childCount: 2,
            isTask: true,
            taskStatus: "todo",
          },
        ],
      },
      {
        nodeId: "col2",
        title: "Column 2",
        wipLimit: 3,
        cards: [
          {
            nodeId: "card3",
            title: "Card 3",
            childCount: 1,
            isTask: true,
            taskStatus: "wip",
          },
        ],
      },
    ];
  }

  test("transforms BoardState to BoardViewModel", () => {
    const state = createInitialBoardState(
      createTestColumns(),
      "root-123",
      "/path/to/board",
    );
    state.colIndex = 1;
    state.cardIndex = 0;

    const vm = toBoardViewModel(state, "cards");

    expect(vm.rootPath).toBe("/path/to/board");
    expect(vm.columns).toHaveLength(2);
    expect(vm.selectedCol).toBe(1);
    expect(vm.selectedCard).toBe(0);
    expect(vm.viewMode).toBe("cards");
    expect(vm.searchQuery).toBe("");
    expect(vm.searchMode).toBe(false);
    expect(vm.helpMode).toBe(false);
  });

  test("transforms columns with folded and collapsed state", () => {
    const state = createInitialBoardState(createTestColumns());
    state.foldedCards.add("card1");
    state.collapsedColumns.add(1);

    const vm = toBoardViewModel(state, "list");

    expect(vm.columns[0].cards[0].isFolded).toBe(true);
    expect(vm.columns[0].cards[1].isFolded).toBe(false);
    expect(vm.columns[0].isCollapsed).toBe(false);
    expect(vm.columns[1].isCollapsed).toBe(true);
  });

  test("includes search and help mode state", () => {
    const state = createInitialBoardState(createTestColumns());
    state.searchQuery = "test query";
    state.searchMode = true;
    state.helpMode = true;

    const vm = toBoardViewModel(state, "columns");

    expect(vm.searchQuery).toBe("test query");
    expect(vm.searchMode).toBe(true);
    expect(vm.helpMode).toBe(true);
  });

  test("passes viewMode from parameter", () => {
    const state = createInitialBoardState(createTestColumns());

    const cardsVm = toBoardViewModel(state, "cards");
    expect(cardsVm.viewMode).toBe("cards");

    const listVm = toBoardViewModel(state, "list");
    expect(listVm.viewMode).toBe("list");

    const columnsVm = toBoardViewModel(state, "columns");
    expect(columnsVm.viewMode).toBe("columns");

    const tabsVm = toBoardViewModel(state, "tabs");
    expect(tabsVm.viewMode).toBe("tabs");
  });
});
