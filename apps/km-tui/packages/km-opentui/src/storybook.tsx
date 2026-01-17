#!/usr/bin/env bun
/**
 * @jsxImportSource @opentui/react
 */
/**
 * OpenTUI Storybook - Visual Component Catalog
 *
 * Renders all TUI components in various states for visual inspection.
 * Uses actual OpenTUI components so styling matches the real TUI.
 *
 * Run: bun run storybook2
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Card, Column, TreeNode, Header, StatusBar } from "./components/index.ts";
import type { BreadcrumbSegment } from "./components/Header.tsx";
import { CardsView, ListView, ColumnsView, TabsView } from "./views/index.ts";
import type { NodeViewModel } from "./types.ts";

// TreeViewModel expected by views (nodes, cursor, selectedNodes)
interface TreeViewModel {
  nodes: NodeViewModel[];
  cursor: [number, number];
  selectedNodes: Set<string>;
  rootPath: string | null;
}

// ============================================================================
// Section Header Components
// ============================================================================

function SectionHeader({ title }: { title: string }) {
  const divider = "═".repeat(70);
  return (
    <box flexDirection="column" marginTop={1} marginBottom={1}>
      <text color="cyan" bold>
        {divider}
      </text>
      <text color="cyan" bold>
        {" "}
        {title}
      </text>
      <text color="cyan" bold>
        {divider}
      </text>
    </box>
  );
}

function SubsectionHeader({ title }: { title: string }) {
  const subDivider = "─".repeat(50);
  return (
    <box flexDirection="column" marginTop={1}>
      <text dim>{subDivider}</text>
      <text bold>{title}</text>
      <text> </text>
    </box>
  );
}

// ============================================================================
// Layer 3: Card Component Showcase
// ============================================================================

function Layer3Cards() {
  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 3: Card Component" />

      <SubsectionHeader title="Task Status States" />
      <box flexDirection="row">
        <box flexDirection="column" width={22} marginRight={1}>
          <text bold>Todo:</text>
          <Card title="Setup CI pipeline" isSelected={false} childCount={0} taskStatus="todo" />
        </box>
        <box flexDirection="column" width={22} marginRight={1}>
          <text bold>WIP:</text>
          <Card title="Review PR #42" isSelected={false} childCount={0} taskStatus="wip" />
        </box>
        <box flexDirection="column" width={22} marginRight={1}>
          <text bold>Blocked:</text>
          <Card title="Wait on API" isSelected={false} childCount={0} taskStatus="blocked" />
        </box>
      </box>
      <box flexDirection="row" marginTop={1}>
        <box flexDirection="column" width={22} marginRight={1}>
          <text bold>Done:</text>
          <Card title="Implement auth" isSelected={false} childCount={0} taskStatus="done" />
        </box>
        <box flexDirection="column" width={22} marginRight={1}>
          <text bold>Dropped:</text>
          <Card title="Old approach" isSelected={false} childCount={0} taskStatus="dropped" />
        </box>
      </box>

      <SubsectionHeader title="Selection States" />
      <box flexDirection="row">
        <box flexDirection="column" width={30} marginRight={1}>
          <text bold>Normal (not selected):</text>
          <Card title="Example task content" isSelected={false} childCount={0} taskStatus="todo" />
        </box>
        <box flexDirection="column" width={30} marginRight={1}>
          <text bold color="cyan">Selected (cyan bg):</text>
          <Card title="Example task content" isSelected={true} childCount={0} taskStatus="todo" />
        </box>
      </box>

      <SubsectionHeader title="With Children" />
      <box flexDirection="row">
        <box flexDirection="column" width={25} marginRight={1}>
          <text bold>No children:</text>
          <Card title="Leaf task" isSelected={false} childCount={0} taskStatus="todo" />
        </box>
        <box flexDirection="column" width={25} marginRight={1}>
          <text bold>With children:</text>
          <Card title="Parent task" isSelected={false} childCount={3} taskStatus="todo" />
        </box>
        <box flexDirection="column" width={25} marginRight={1}>
          <text bold>Folded:</text>
          <Card title="Folded task" isSelected={false} childCount={5} isFolded={true} taskStatus="todo" />
        </box>
      </box>

      <SubsectionHeader title="Rich Task Display" />
      <box flexDirection="row">
        <box flexDirection="column" width={30} marginRight={1}>
          <text bold>With Priority:</text>
          <Card title="High priority" isSelected={false} childCount={0} taskStatus="todo" priority={1} />
        </box>
        <box flexDirection="column" width={30} marginRight={1}>
          <text bold>With Due Date:</text>
          <Card title="Has deadline" isSelected={false} childCount={0} taskStatus="wip" dueDate="2025-01-20" />
        </box>
      </box>
    </box>
  );
}

// ============================================================================
// Layer 3: TreeNode Component Showcase
// ============================================================================

function Layer3TreeNodes() {
  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 3: TreeNode Component" />

      <SubsectionHeader title="Task Status States (width=45)" />
      <box flexDirection="column">
        <text bold>Todo:</text>
        <TreeNode
          node={{ id: "1", title: "Setup CI pipeline", isTask: true, taskStatus: "todo" }}
          depth={0}
          width={45}
          isSelected={false}
        />
        <text bold>WIP:</text>
        <TreeNode
          node={{ id: "2", title: "Review PR #42", isTask: true, taskStatus: "wip" }}
          depth={0}
          width={45}
          isSelected={false}
        />
        <text bold>Blocked:</text>
        <TreeNode
          node={{ id: "3", title: "Wait on API", isTask: true, taskStatus: "blocked" }}
          depth={0}
          width={45}
          isSelected={false}
        />
        <text bold>Done (dim):</text>
        <TreeNode
          node={{ id: "4", title: "Implement auth", isTask: true, taskStatus: "done" }}
          depth={0}
          width={45}
          isSelected={false}
        />
        <text bold>Dropped (dim):</text>
        <TreeNode
          node={{ id: "5", title: "Old approach", isTask: true, taskStatus: "dropped" }}
          depth={0}
          width={45}
          isSelected={false}
        />
      </box>

      <SubsectionHeader title="Selection States" />
      <box flexDirection="column">
        <text bold>Normal (not selected):</text>
        <TreeNode
          node={{ id: "n1", title: "Example task content", isTask: true, taskStatus: "todo" }}
          depth={0}
          width={45}
          isSelected={false}
        />
        <text bold color="cyan">Selected (cyan background):</text>
        <TreeNode
          node={{ id: "s1", title: "Example task content", isTask: true, taskStatus: "todo" }}
          depth={0}
          width={45}
          isSelected={true}
        />
        <text bold color="cyan">Multi-selected:</text>
        <TreeNode
          node={{ id: "m1", title: "Example task content", isTask: true, taskStatus: "todo" }}
          depth={0}
          width={45}
          isSelected={false}
          isMultiSelected={true}
        />
      </box>
    </box>
  );
}

// ============================================================================
// Layer 3: Column Component Showcase
// ============================================================================

function Layer3Columns() {
  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 3: Column Component" />

      <SubsectionHeader title="Column States" />
      <box flexDirection="row">
        <box marginRight={2}>
          <Column title="Active Column" count={3} isActive={true} isCollapsed={false} selectedIndex={0}>
            <Card title="Task in active column" isSelected={true} childCount={0} taskStatus="todo" />
            <Card title="Another task" isSelected={false} childCount={0} taskStatus="wip" />
            <Card title="Third task" isSelected={false} childCount={0} taskStatus="done" />
          </Column>
        </box>
        <box marginRight={2}>
          <Column title="Inactive Column" count={2} isActive={false} isCollapsed={false} selectedIndex={-1}>
            <Card title="Unselected task" isSelected={false} childCount={0} taskStatus="todo" />
            <Card title="Another unselected" isSelected={false} childCount={0} taskStatus="blocked" />
          </Column>
        </box>
        <box>
          <Column title="Collapsed" count={5} isActive={false} isCollapsed={true} selectedIndex={-1}>
            <text>Hidden when collapsed</text>
          </Column>
        </box>
      </box>
    </box>
  );
}

// ============================================================================
// Layer 3: All View Modes
// ============================================================================

function createMockViewModel(): TreeViewModel {
  // Helper to create a complete NodeViewModel
  const node = (
    id: string,
    title: string,
    children: NodeViewModel[] = [],
    opts: Partial<NodeViewModel> = {},
  ): NodeViewModel => ({
    id,
    name: id,
    title,
    childCount: children.length,
    isTask: opts.taskStatus !== undefined,
    isFolded: false,
    depth: 0,
    children,
    ...opts,
  });

  const nodes: NodeViewModel[] = [
    node("col1", "Backlog", [
      node("bl1", "Review architecture", [], { taskStatus: "todo", depth: 1 }),
      node("bl2", "Plan sprint goals", [], { taskStatus: "todo", depth: 1 }),
      node("bl3", "Update settings", [], { taskStatus: "todo", childCount: 2, depth: 1 }),
    ]),
    node("col2", "In Progress", [
      node("wip1", "Implement auth", [], { taskStatus: "wip", priority: 1, childCount: 3, depth: 1 }),
      node("wip2", "Fix bug #42", [], { taskStatus: "wip", dueDate: "2025-01-18", depth: 1 }),
      node("wip3", "Refactor DB layer", [], { taskStatus: "wip", childCount: 1, depth: 1 }),
    ]),
    node("col3", "Blocked", [
      node("blk1", "Deploy to staging", [], { taskStatus: "blocked", childCount: 1, depth: 1 }),
      node("blk2", "Payment integration", [], { taskStatus: "blocked", depth: 1 }),
    ]),
    node("col4", "Done", [
      node("done1", "Setup project", [], { taskStatus: "done", depth: 1 }),
      node("done2", "Create tests", [], { taskStatus: "done", childCount: 2, depth: 1 }),
      node("drop1", "Old migration", [], { taskStatus: "dropped", depth: 1 }),
    ]),
  ];

  return {
    nodes,
    cursor: [1, 0], // Select "In Progress" column, first card
    selectedNodes: new Set<string>(),
    rootPath: "/Projects/webapp",
  };
}

function Layer3AllViews() {
  const mockViewModel = createMockViewModel();
  const viewWidth = 85;
  const viewHeight = 10;

  // Mock breadcrumbs for header
  const breadcrumbs: BreadcrumbSegment[] = [
    { id: "col2", title: "In Progress", isWithinBoard: true },
    { id: "wip1", title: "Implement auth", isWithinBoard: true },
  ];

  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 3: All View Modes" />
      <text dim>Each view renders the same data with different layouts:</text>
      <text> </text>

      <SubsectionHeader title="View 1: Cards (Kanban-style)" />
      <box border borderColor="magenta" borderStyle="single" width={viewWidth}>
        <box flexDirection="column" width={viewWidth - 2}>
          <Header
            rootPath={mockViewModel.rootPath}
            breadcrumbs={breadcrumbs}
            searchQuery=""
            searchMode={false}
            width={viewWidth - 2}
          />
          <CardsView viewModel={mockViewModel} height={viewHeight} />
        </box>
      </box>

      <SubsectionHeader title="View 2: List (Full-width hierarchical)" />
      <box border borderColor="magenta" borderStyle="single" width={viewWidth}>
        <box flexDirection="column" width={viewWidth - 2} height={viewHeight + 2}>
          <Header
            rootPath={mockViewModel.rootPath}
            breadcrumbs={breadcrumbs}
            searchQuery=""
            searchMode={false}
            width={viewWidth - 2}
          />
          <ListView viewModel={mockViewModel} width={viewWidth - 4} />
        </box>
      </box>

      <SubsectionHeader title="View 3: Columns (Tree within columns)" />
      <box border borderColor="magenta" borderStyle="single" width={viewWidth}>
        <box flexDirection="column" width={viewWidth - 2}>
          <Header
            rootPath={mockViewModel.rootPath}
            breadcrumbs={breadcrumbs}
            searchQuery=""
            searchMode={false}
            width={viewWidth - 2}
          />
          <ColumnsView viewModel={mockViewModel} width={viewWidth - 2} height={viewHeight} />
        </box>
      </box>

      <SubsectionHeader title="View 4: Tabs (One column at a time)" />
      <box border borderColor="magenta" borderStyle="single" width={viewWidth}>
        <box flexDirection="column" width={viewWidth - 2}>
          <Header
            rootPath={mockViewModel.rootPath}
            breadcrumbs={breadcrumbs}
            searchQuery=""
            searchMode={false}
            width={viewWidth - 2}
          />
          <TabsView viewModel={mockViewModel} width={viewWidth - 2} height={viewHeight} />
        </box>
      </box>
    </box>
  );
}

// ============================================================================
// Visual Language Section
// ============================================================================

function VisualLanguageSection() {
  return (
    <box flexDirection="column">
      <SectionHeader title="Visual Language - Design System" />
      <text dim>Reference: docs/08-ui.md</text>
      <text> </text>

      <SubsectionHeader title="Selection = Cyan Background (RESERVED)" />
      <text dim>Cyan bg is ONLY for selection (cursor, focused, multi-select)</text>
      <text> </text>
      <box flexDirection="row">
        <box flexDirection="column" width={35}>
          <text bold>Normal:</text>
          <TreeNode
            node={{ id: "vl1", title: "Not selected", isTask: true, taskStatus: "todo" }}
            depth={0}
            width={30}
            isSelected={false}
          />
        </box>
        <box flexDirection="column" width={35}>
          <text bold color="cyan">Selected:</text>
          <TreeNode
            node={{ id: "vl2", title: "Selected item", isTask: true, taskStatus: "todo" }}
            depth={0}
            width={30}
            isSelected={true}
          />
        </box>
      </box>

      <SubsectionHeader title="Column Header Styling" />
      <box flexDirection="row">
        <box flexDirection="column" width={25}>
          <text bold color="yellow">Active Column (4)</text>
          <text dim>yellow + bold</text>
        </box>
        <box flexDirection="column" width={25}>
          <text color="yellowBright" dim>Inactive Column (2)</text>
          <text dim>yellowBright + dim</text>
        </box>
        <box flexDirection="column" width={25}>
          <text backgroundColor="cyan" color="black"> Cursor Level </text>
          <text dim>cyan bg</text>
        </box>
      </box>

      <SubsectionHeader title="Status Bar" />
      <StatusBar
        width={70}
        height={24}
        cursor={[1, 0]}
        nodeCount={4}
        viewMode="cards"
        rootPath="/Projects/webapp"
      />
    </box>
  );
}

// ============================================================================
// Summary
// ============================================================================

function Summary() {
  return (
    <box flexDirection="column">
      <SectionHeader title="Summary" />
      <text>All OpenTUI components rendered with actual styling.</text>
      <text> </text>
      <text>To run the interactive TUI with real data:</text>
      <text color="cyan"> bun km view @next --tui2</text>
      <text> </text>
      <text dim>Press Ctrl+C to exit this storybook.</text>
      <text> </text>
    </box>
  );
}

// ============================================================================
// Main Storybook Component
// ============================================================================

function Storybook() {
  return (
    <box flexDirection="column">
      <Layer3Cards />
      <Layer3TreeNodes />
      <Layer3Columns />
      <Layer3AllViews />
      <VisualLanguageSection />
      <Summary />
    </box>
  );
}

// ============================================================================
// Render
// ============================================================================

/**
 * Emergency terminal restore
 */
function emergencyTerminalRestore(): void {
  try {
    const stdout = process.stdout;
    stdout.write("\x1b[?25h"); // Show cursor
    stdout.write("\x1b[?1049l"); // Leave alternate screen
    stdout.write("\x1b[0m"); // Reset attributes
    stdout.write("\x1b[J"); // Clear to end
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
  } catch {
    // Ignore
  }
}

let isExiting = false;

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  onDestroy: () => {
    if (!isExiting) {
      isExiting = true;
      process.exit(0);
    }
  },
});

const handleUncaughtError = (error: Error) => {
  try {
    renderer.destroy();
  } catch {
    emergencyTerminalRestore();
  }
  console.error("Uncaught error:", error);
  process.exit(1);
};

process.on("uncaughtException", handleUncaughtError);
process.on("unhandledRejection", (reason) => {
  handleUncaughtError(reason instanceof Error ? reason : new Error(String(reason)));
});

process.on("SIGTRAP", () => {
  emergencyTerminalRestore();
  process.exit(128 + 5);
});

process.on("beforeExit", () => {
  emergencyTerminalRestore();
});

createRoot(renderer).render(<Storybook />);
