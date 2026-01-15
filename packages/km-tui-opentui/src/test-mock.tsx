/**
 * TUI2 Mock Data Test
 *
 * Tests the new architecture with fake data (storybook-style).
 * Run with: bun packages/km-tui-opentui/src/test-mock.tsx
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App.tsx";
import type { TreeNodeState } from "./types.ts";

// Mock child node data
function mockChild(
  id: string,
  title: string,
  isTask = false,
  taskStatus?: "todo" | "wip" | "blocked" | "done" | "dropped",
): TreeNodeState {
  return {
    nodeId: id,
    title,
    children: [],
    childCount: 0,
    isTask,
    taskStatus,
    color: undefined,
    icon: undefined,
    depth: 1,
  };
}

// Mock column/parent nodes (depth 0)
function mockColumn(
  id: string,
  title: string,
  children: TreeNodeState[],
): TreeNodeState {
  return {
    nodeId: id,
    title,
    children,
    childCount: children.length,
    isTask: false,
    depth: 0,
  };
}

// Mock tree nodes (columns with children)
const mockNodes: TreeNodeState[] = [
  mockColumn("col1", "Inbox", [
    mockChild("card1", "Review pull request #234"),
    mockChild("card2", "Update documentation"),
    mockChild("card3", "Fix login bug", true, "todo"),
    mockChild("card4", "Deploy to staging", true, "wip"),
    mockChild("card5", "Code review feedback"),
    mockChild("card6", "Meeting notes"),
    mockChild("card7", "Research new framework"),
    mockChild("card8", "Update dependencies"),
  ]),
  mockColumn("col2", "Next Actions", [
    mockChild("card9", "Implement dark mode", true, "todo"),
    mockChild("card10", "Write unit tests", true, "todo"),
    mockChild("card11", "Refactor auth module", true, "blocked"),
    mockChild("card12", "API documentation", true, "wip"),
    mockChild("card13", "Performance optimization", true, "todo"),
    mockChild("card14", "Fix memory leak", true, "todo"),
  ]),
  mockColumn("col3", "Waiting For", [
    mockChild("card15", "Client feedback on design"),
    mockChild("card16", "Legal review of ToS", true, "blocked"),
    mockChild("card17", "Hardware delivery"),
  ]),
  mockColumn("col4", "Done", [
    mockChild("card18", "Setup CI/CD pipeline", true, "done"),
    mockChild("card19", "Database migration", true, "done"),
    mockChild("card20", "User onboarding flow", true, "done"),
    mockChild("card21", "Bug fixes batch 1", true, "done"),
    mockChild("card22", "Security audit", true, "done"),
  ]),
];

// Run the app
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

createRoot(renderer).render(
  <App
    initialNodes={mockNodes}
    rootPath="/test/mock-board"
    initialViewMode="cards"
  />,
);
