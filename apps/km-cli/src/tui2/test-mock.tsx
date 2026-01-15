/**
 * TUI2 Mock Data Test
 *
 * Tests the new architecture with fake data (storybook-style).
 * Run with: bun apps/km-cli/src/tui2/test-mock.tsx
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App.tsx";
import type { ColumnState, CardState } from "./types.ts";

// Mock card data
function mockCard(
  id: string,
  title: string,
  childCount = 0,
  isTask = false,
  taskStatus?: "todo" | "wip" | "blocked" | "done" | "dropped",
): CardState {
  return {
    nodeId: id,
    title,
    childCount,
    isTask,
    taskStatus,
    color: undefined,
    icon: undefined,
  };
}

// Mock columns
const mockColumns: ColumnState[] = [
  {
    nodeId: "col1",
    title: "Inbox",
    wipLimit: undefined,
    cards: [
      mockCard("card1", "Review pull request #234"),
      mockCard("card2", "Update documentation", 3),
      mockCard("card3", "Fix login bug", 0, true, "todo"),
      mockCard("card4", "Deploy to staging", 0, true, "wip"),
      mockCard("card5", "Code review feedback"),
      mockCard("card6", "Meeting notes"),
      mockCard("card7", "Research new framework", 5),
      mockCard("card8", "Update dependencies"),
    ],
  },
  {
    nodeId: "col2",
    title: "Next Actions",
    wipLimit: 5,
    cards: [
      mockCard("card9", "Implement dark mode", 2, true, "todo"),
      mockCard("card10", "Write unit tests", 0, true, "todo"),
      mockCard("card11", "Refactor auth module", 0, true, "blocked"),
      mockCard("card12", "API documentation", 0, true, "wip"),
      mockCard("card13", "Performance optimization", 4, true, "todo"),
      mockCard("card14", "Fix memory leak", 0, true, "todo"),
    ],
  },
  {
    nodeId: "col3",
    title: "Waiting For",
    wipLimit: undefined,
    cards: [
      mockCard("card15", "Client feedback on design"),
      mockCard("card16", "Legal review of ToS", 0, true, "blocked"),
      mockCard("card17", "Hardware delivery"),
    ],
  },
  {
    nodeId: "col4",
    title: "Done",
    wipLimit: undefined,
    cards: [
      mockCard("card18", "Setup CI/CD pipeline", 0, true, "done"),
      mockCard("card19", "Database migration", 0, true, "done"),
      mockCard("card20", "User onboarding flow", 3, true, "done"),
      mockCard("card21", "Bug fixes batch 1", 0, true, "done"),
      mockCard("card22", "Security audit", 0, true, "done"),
    ],
  },
];

// Run the app
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

createRoot(renderer).render(
  <App
    initialColumns={mockColumns}
    rootPath="/test/mock-board"
    initialViewMode="cards"
  />,
);
