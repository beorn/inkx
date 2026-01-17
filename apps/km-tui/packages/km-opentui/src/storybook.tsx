#!/usr/bin/env bun
/**
 * OpenTUI Storybook - Visual Component Catalog
 *
 * Renders all TUI components in various states for visual inspection.
 * Uses the same structure as the Ink storybook but with OpenTUI components.
 *
 * Run: bun run storybook2
 *
 * Terminal cleanup: handles SIGTERM/SIGINT/SIGQUIT for proper cleanup.
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Column, Card, TreeNode } from "./components/index.ts";
import { CardsView, ListView, ColumnsView, TabsView } from "./views/index.ts";
import { getStatusIcon, GTD_BOARD_COLORS, colorize, getChalkColor } from "@km/ink";
import {
  wrapText,
  truncateText,
  padText,
  constrainText,
  renderPath,
  renderParentPath,
  type PathSegment,
} from "@km/ink";
import chalk from "chalk";
import type { TNode, ViewMode, NodeViewModel, TreeViewModel } from "./types.ts";
import type { TaskStatus } from "@km/board";

// Force chalk colors in terminal
chalk.level = 3;

// ============================================================================
// Section Header Components
// ============================================================================

function SectionHeader({ title }: { title: string }) {
  const divider = "═".repeat(60);
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
  const subDivider = "─".repeat(40);
  return (
    <box flexDirection="column" marginTop={1}>
      <text dim>{subDivider}</text>
      <text bold>{title}</text>
      <text> </text>
    </box>
  );
}

// Simple header for storybook demos (doesn't require breadcrumbs like actual Header)
function SimpleHeader({ rootPath }: { rootPath: string | null }) {
  return (
    <box width="100%" backgroundColor="white">
      <text backgroundColor="white" color="black" bold>
        {" "}
        {rootPath || "/"}
      </text>
    </box>
  );
}

// ============================================================================
// Layer 1: Rich Text Rendering
// ============================================================================

function Layer1RichText() {
  // Examples showing rich text capabilities
  // Note: OpenTUI uses JSX text components; chalk is for console output in storybook
  const examples = {
    inlineFields: [
      "Task with due date [due:: 2024-01-15]",
      "Task [priority:: 1] [status:: wip] with multiple fields",
      "No inline fields here",
    ],
    wikiLinks: [
      "See [[note]] for details",
      "Link to [[path/to/document|Document Title]]",
      "Multiple [[link1]] and [[link2|Second Link]]",
    ],
    markdown: [
      "This has **bold** text",
      "This has *italic* text",
      "This has `inline code` text",
      "This has ~~strikethrough~~ text",
      "**Bold** and *italic* and `code` together",
    ],
  };

  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 1: Rich Text Rendering" />

      <SubsectionHeader title="Inline Field Examples (stripped in display)" />
      {examples.inlineFields.map((text, i) => (
        <box key={i} flexDirection="column">
          <text dim>input: {text}</text>
          <text>output: [field-free version shown in Card/TreeNode]</text>
          <text> </text>
        </box>
      ))}

      <SubsectionHeader title="Wiki Link Examples (styled in display)" />
      {examples.wikiLinks.map((text, i) => (
        <box key={i} flexDirection="column">
          <text dim>input: {text}</text>
          <text color="blue">[links rendered in blue]</text>
          <text> </text>
        </box>
      ))}

      <SubsectionHeader title="Markdown Formatting Examples" />
      {examples.markdown.map((text, i) => (
        <box key={i} flexDirection="row">
          <text dim>input: </text>
          <text>{text}</text>
        </box>
      ))}
    </box>
  );
}

// ============================================================================
// Layer 1: Tag Pills / Board Colors
// ============================================================================

function Layer1TagPills() {
  const presetTags = [
    { name: "inbox", desc: "Uncategorized items" },
    { name: "next", desc: "Ready to work on" },
    { name: "waiting", desc: "Blocked on external" },
    { name: "someday", desc: "Future consideration" },
    { name: "done", desc: "Completed" },
    { name: "blocked", desc: "Cannot proceed" },
  ];

  const customTags = [
    { name: "Sprint", color: "magenta" },
    { name: "Urgent", color: "red" },
    { name: "Research", color: "blue" },
  ];

  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 1: Tag Pills / Board Colors" />

      <SubsectionHeader title="GTD Board Colors (preset tag colors)" />
      <text dim> Tag Name    Color    Description</text>
      <text dim> ──────────  ───────  ─────────────────────</text>
      {presetTags.map(({ name, desc }) => {
        const color = GTD_BOARD_COLORS[name] || "white";
        return (
          <box key={name} flexDirection="row">
            <text> </text>
            <text color={color as any}>@{name.padEnd(10)}</text>
            <text> </text>
            <text dim>{color.padEnd(7)}</text>
            <text dim> ← {desc}</text>
          </box>
        );
      })}
      <text> </text>

      <SubsectionHeader title="Custom Tag Colors (via color= attribute)" />
      <text dim> Custom colors override presets using color=value in headings</text>
      {customTags.map(({ name, color }) => (
        <box key={name} flexDirection="row">
          <text> </text>
          <text color={color as any}>@{name}</text>
          <text dim> ← color={color}</text>
        </box>
      ))}
    </box>
  );
}

// ============================================================================
// Layer 1: Task Status Styling
// ============================================================================

function Layer1TaskStyling() {
  const statusTable: Array<{
    mark: string;
    status: TaskStatus;
    desc: string;
  }> = [
    { mark: " ", status: "todo", desc: "Not started" },
    { mark: "/", status: "wip", desc: "Work in progress" },
    { mark: "!", status: "blocked", desc: "Blocked" },
    { mark: "x", status: "done", desc: "Completed" },
    { mark: "-", status: "dropped", desc: "Dropped" },
  ];

  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 1: Task Status Styling" />

      <SubsectionHeader title="Standard Status States" />
      <text dim> Plain  Icon  Description</text>
      <text dim> ─────  ────  ─────────────────────</text>
      {statusTable.map(({ mark, status, desc }) => {
        const icon = getStatusIcon(status);
        const isDoneOrDropped = status === "done" || status === "dropped";
        return (
          <box key={status} flexDirection="row">
            <text> [{mark}]   </text>
            <text color={icon.color as any}>{icon.char}</text>
            <text>     </text>
            <text dim={isDoneOrDropped}>{desc}</text>
          </box>
        );
      })}
      <text> </text>

      <SubsectionHeader title="Status Icons in Cards" />
      <box flexDirection="row">
        <box flexDirection="column" width={25}>
          <text bold>Todo (open):</text>
          <Card
            title="Setup CI pipeline"
            isSelected={false}
            childCount={0}
            taskStatus="todo"
          />
        </box>
        <box flexDirection="column" width={25}>
          <text bold>WIP (in progress):</text>
          <Card
            title="Review PR #42"
            isSelected={false}
            childCount={0}
            taskStatus="wip"
          />
        </box>
      </box>
      <box flexDirection="row">
        <box flexDirection="column" width={25}>
          <text bold>Blocked:</text>
          <Card
            title="Wait on API"
            isSelected={false}
            childCount={0}
            taskStatus="blocked"
          />
        </box>
        <box flexDirection="column" width={25}>
          <text bold>Done:</text>
          <Card
            title="Implement auth"
            isSelected={false}
            childCount={0}
            taskStatus="done"
          />
        </box>
      </box>
    </box>
  );
}

// ============================================================================
// Layer 2: Layout Functions
// ============================================================================

function Layer2Layout() {
  const longText =
    "This is a longer text that needs to be wrapped at a certain width to fit in a column";
  const truncText = "This is text that might be truncated";

  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 2: Layout Functions" />

      <SubsectionHeader title="wrapText() - Word Wrapping" />
      <text dim>Width 30:</text>
      {wrapText(longText, 30).map((line, i) => (
        <text key={i}> |{line}|</text>
      ))}
      <text> </text>

      <SubsectionHeader title="truncateText() - Truncation with Ellipsis" />
      <text> width=50: |{truncateText(truncText, 50)}|</text>
      <text> width=30: |{truncateText(truncText, 30)}|</text>
      <text> width=20: |{truncateText(truncText, 20)}|</text>
      <text> width=10: |{truncateText(truncText, 10)}|</text>
      <text> </text>

      <SubsectionHeader title="padText() - Padding to Width" />
      <text> |{padText("Hi", 15)}| (length 15)</text>
      <text> |{padText("Hello", 15)}| (length 15)</text>
      <text> |{padText("Hello World", 15)}| (length 15)</text>
      <text> </text>

      <SubsectionHeader title="constrainText() - Wrap + Truncate + Limit Lines" />
      <text dim>Width=25, maxLines=2:</text>
      {constrainText(
        "This is a longer piece of text that needs both wrapping and line limiting",
        25,
        2,
      ).lines.map((line, i) => (
        <text key={i}> |{line}|</text>
      ))}
      <text> truncated: true</text>
    </box>
  );
}

// ============================================================================
// Layer 3: TreeNode Component
// ============================================================================

function Layer3TreeNode() {
  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 3: TreeNode Component" />

      <SubsectionHeader title="TreeNode - Different Task States" />
      <text dim>Each node rendered at width=40:</text>
      <text> </text>

      <text bold>Todo (open):</text>
      <TreeNode
        node={{
          id: "todo-1",
          title: "Setup CI pipeline",
          isTask: true,
          taskStatus: "todo",
        }}
        depth={0}
        width={40}
        isSelected={false}
      />

      <text bold>WIP (in progress):</text>
      <TreeNode
        node={{
          id: "wip-1",
          title: "Review PR #42",
          isTask: true,
          taskStatus: "wip",
        }}
        depth={0}
        width={40}
        isSelected={false}
      />

      <text bold>Blocked:</text>
      <TreeNode
        node={{
          id: "blocked-1",
          title: "Wait on API",
          isTask: true,
          taskStatus: "blocked",
        }}
        depth={0}
        width={40}
        isSelected={false}
      />

      <text bold>Done (dim):</text>
      <TreeNode
        node={{
          id: "done-1",
          title: "Implement auth",
          isTask: true,
          taskStatus: "done",
        }}
        depth={0}
        width={40}
        isSelected={false}
      />

      <text bold>Dropped (dim):</text>
      <TreeNode
        node={{
          id: "dropped-1",
          title: "Old approach",
          isTask: true,
          taskStatus: "dropped",
        }}
        depth={0}
        width={40}
        isSelected={false}
      />

      <text> </text>
      <SubsectionHeader title="TreeNode - Selection States" />

      <text bold>Normal (not selected):</text>
      <TreeNode
        node={{
          id: "normal-1",
          title: "Example task content",
          isTask: true,
          taskStatus: "todo",
        }}
        depth={0}
        width={40}
        isSelected={false}
      />

      <text bold color="cyan">
        Selected (cyan background):
      </text>
      <TreeNode
        node={{
          id: "selected-1",
          title: "Example task content",
          isTask: true,
          taskStatus: "todo",
        }}
        depth={0}
        width={40}
        isSelected={true}
      />

      <text bold color="cyan">
        Multi-selected (also cyan background):
      </text>
      <TreeNode
        node={{
          id: "multi-1",
          title: "Example task content",
          isTask: true,
          taskStatus: "todo",
        }}
        depth={0}
        width={40}
        isSelected={false}
        isMultiSelected={true}
      />

      <text> </text>
      <SubsectionHeader title="TreeNode - Rich Task Display" />

      <text bold>With Priority:</text>
      <TreeNode
        node={{
          id: "priority-1",
          title: "High priority task",
          isTask: true,
          taskStatus: "todo",
          priority: 1,
        }}
        depth={0}
        width={50}
        isSelected={false}
        variant="wide"
      />

      <text bold>With Due Date:</text>
      <TreeNode
        node={{
          id: "due-1",
          title: "Task with deadline",
          isTask: true,
          taskStatus: "wip",
          dueDate: "2025-01-20",
        }}
        depth={0}
        width={50}
        isSelected={false}
        variant="wide"
      />

      <text bold>With Backlinks:</text>
      <TreeNode
        node={{
          id: "backlinks-1",
          title: "Referenced task",
          isTask: true,
          taskStatus: "todo",
          hasBacklinks: true,
          refsCount: 3,
        }}
        depth={0}
        width={50}
        isSelected={false}
        variant="wide"
      />
    </box>
  );
}

// ============================================================================
// Layer 3: All View Modes
// ============================================================================

// Helper to create mock view model
function createMockViewModel(): TreeViewModel {
  const nodes: NodeViewModel[] = [
    {
      id: "col1",
      title: "Backlog",
      children: [
        {
          id: "bl1",
          title: "Review architecture docs",
          children: [],
          childCount: 0,
          taskStatus: "todo",
        },
        {
          id: "bl2",
          title: "Plan Q2 sprint goals",
          children: [],
          childCount: 0,
          taskStatus: "todo",
        },
        {
          id: "bl3",
          title: "Update config settings",
          children: [],
          childCount: 2,
          taskStatus: "todo",
        },
      ],
      childCount: 3,
    },
    {
      id: "col2",
      title: "In Progress",
      children: [
        {
          id: "wip1",
          title: "Implement auth flow",
          children: [],
          childCount: 3,
          taskStatus: "wip",
          priority: 1,
        },
        {
          id: "wip2",
          title: "Fix critical bug #42",
          children: [],
          childCount: 0,
          taskStatus: "wip",
          dueDate: "2025-01-18",
        },
        {
          id: "wip3",
          title: "Refactor database layer",
          children: [],
          childCount: 1,
          taskStatus: "wip",
        },
      ],
      childCount: 3,
    },
    {
      id: "col3",
      title: "Blocked",
      children: [
        {
          id: "blk1",
          title: "Deploy to staging",
          children: [],
          childCount: 1,
          taskStatus: "blocked",
        },
        {
          id: "blk2",
          title: "Integrate payment system",
          children: [],
          childCount: 0,
          taskStatus: "blocked",
        },
      ],
      childCount: 2,
    },
    {
      id: "col4",
      title: "Done",
      children: [
        {
          id: "done1",
          title: "Setup project structure",
          children: [],
          childCount: 0,
          taskStatus: "done",
        },
        {
          id: "done2",
          title: "Create initial tests",
          children: [],
          childCount: 2,
          taskStatus: "done",
        },
        {
          id: "drop1",
          title: "Old migration script",
          children: [],
          childCount: 0,
          taskStatus: "dropped",
        },
      ],
      childCount: 3,
    },
  ];

  return {
    nodes,
    cursor: [1, 0], // Select "In Progress" column, first card
    selectedNodes: new Set<string>(),
    rootPath: "/Projects/webapp",
    searchQuery: "",
    searchMode: false,
    helpMode: false,
  };
}

function Layer3AllViews() {
  const mockViewModel = createMockViewModel();
  const viewWidth = 90;
  const viewHeight = 12;

  return (
    <box flexDirection="column">
      <SectionHeader title="Layer 3: All View Modes" />
      <text dim>Each view renders the same BoardState with varied content:</text>
      <text dim>• Tasks: todo ○, wip ◐, blocked ⊘, done ✓, dropped ∅</text>
      <text dim>• Rich text: **bold**, *italic*, `code`, ~~strike~~, [[links]]</text>
      <text dim>• Inline fields stripped: [due:: date] → (hidden)</text>
      <text dim>• Embedded children shown under parent tasks</text>
      <text> </text>

      <SubsectionHeader title="View 1: Cards (Kanban-style cards in columns)" />
      <box border borderColor="magenta" borderStyle="double" paddingX={1}>
        <box flexDirection="column" width={viewWidth}>
          <SimpleHeader rootPath={mockViewModel.rootPath} />
          <CardsView viewModel={mockViewModel} height={viewHeight} />
        </box>
      </box>

      <SubsectionHeader title="View 2: List (Full-width hierarchical)" />
      <box border borderColor="magenta" borderStyle="double" paddingX={1}>
        <box flexDirection="column" width={viewWidth} height={viewHeight}>
          <SimpleHeader rootPath={mockViewModel.rootPath} />
          <ListView viewModel={mockViewModel} width={viewWidth} />
        </box>
      </box>

      <SubsectionHeader title="View 3: Columns (Tree within columns)" />
      <box border borderColor="magenta" borderStyle="double" paddingX={1}>
        <box flexDirection="column" width={viewWidth}>
          <SimpleHeader rootPath={mockViewModel.rootPath} />
          <ColumnsView viewModel={mockViewModel} width={viewWidth} height={viewHeight} />
        </box>
      </box>

      <SubsectionHeader title="View 4: Tabs (One column at a time)" />
      <box border borderColor="magenta" borderStyle="double" paddingX={1}>
        <box flexDirection="column" width={viewWidth}>
          <SimpleHeader rootPath={mockViewModel.rootPath} />
          <TabsView viewModel={mockViewModel} width={viewWidth} height={viewHeight} />
        </box>
      </box>
    </box>
  );
}

// ============================================================================
// Visual Language Section - Design System Reference
// ============================================================================

function VisualLanguageSection() {
  return (
    <box flexDirection="column">
      <SectionHeader title="Visual Language - Design System" />
      <text dim>Reference: docs/08-ui.md</text>
      <text> </text>

      <SubsectionHeader title="Selection States (RESERVED COLOR)" />
      <text dim> Cyan bg = selection ONLY (cursor, focused, multi-select)</text>
      <text> </text>

      <box flexDirection="row">
        <box flexDirection="column" width={35}>
          <text bold>Normal (no selection):</text>
          <TreeNode
            node={{ id: "vl-1", title: "Example task content", isTask: true, taskStatus: "todo" }}
            depth={0}
            width={35}
            isSelected={false}
          />
        </box>
        <box flexDirection="column" width={35}>
          <text bold color="cyan">
            Selected (cyan bg):
          </text>
          <TreeNode
            node={{ id: "vl-2", title: "Example task content", isTask: true, taskStatus: "todo" }}
            depth={0}
            width={35}
            isSelected={true}
          />
        </box>
      </box>
      <text> </text>

      <SubsectionHeader title="Column Header States" />
      <box flexDirection="row">
        <box flexDirection="column" width={25}>
          <text bold color="yellow">
            Selected Column (4)
          </text>
          <text dim>color: yellow, bold: true</text>
        </box>
        <box flexDirection="column" width={25}>
          <text color="yellowBright" dim>
            Unselected Column (2)
          </text>
          <text dim>color: yellowBright, dim: true</text>
        </box>
        <box flexDirection="column" width={25}>
          <text backgroundColor="cyan" color="black">
            {" "}
            Header at Cursor{" "}
          </text>
          <text dim>bg: cyan (cursor level)</text>
        </box>
      </box>
      <text> </text>

      <SubsectionHeader title="Panel Focus States" />
      <box flexDirection="row">
        <box
          flexDirection="column"
          width={28}
          border
          borderStyle="single"
          borderColor="cyanBright"
          paddingX={1}
        >
          <text bold color="yellow">
            Active Panel
          </text>
          <text dim>borderColor: cyanBright</text>
          <text dim>header: yellow + bold</text>
        </box>
        <box width={2} />
        <box
          flexDirection="column"
          width={28}
          border
          borderStyle="single"
          borderColor="blackBright"
          paddingX={1}
        >
          <text bold color="yellowBright" dim>
            Inactive Panel
          </text>
          <text dim>borderColor: blackBright</text>
          <text dim>header: yellowBright + dim</text>
        </box>
      </box>
      <text> </text>

      <SubsectionHeader title="Task Status States" />
      <box flexDirection="row">
        <box flexDirection="column" width={30}>
          <text bold>Active states:</text>
          <TreeNode
            node={{ id: "vl-3", title: "Example task content", isTask: true, taskStatus: "todo" }}
            depth={0}
            width={28}
            isSelected={false}
          />
          <TreeNode
            node={{ id: "vl-4", title: "Work in progress task", isTask: true, taskStatus: "wip" }}
            depth={0}
            width={28}
            isSelected={false}
          />
        </box>
        <box flexDirection="column" width={35}>
          <text bold>Terminal states (dim):</text>
          <TreeNode
            node={{ id: "vl-5", title: "Completed task item", isTask: true, taskStatus: "done" }}
            depth={0}
            width={33}
            isSelected={false}
          />
          <TreeNode
            node={{ id: "vl-6", title: "Dropped task item", isTask: true, taskStatus: "dropped" }}
            depth={0}
            width={33}
            isSelected={false}
          />
        </box>
      </box>
      <text> </text>

      <SubsectionHeader title="Due Date Urgency Colors" />
      <text> </text>
      <text color="red"> Overdue: red</text>
      <text color="red"> Today/Tomorrow: red</text>
      <text color="yellow"> Within 3 days: yellow</text>
      <text color="gray"> Beyond 7 days: gray (no urgency)</text>
    </box>
  );
}

// ============================================================================
// Main Storybook Component
// ============================================================================

function Storybook() {
  return (
    <box flexDirection="column">
      <Layer1RichText />
      <Layer1TagPills />
      <Layer1TaskStyling />
      <Layer2Layout />
      <Layer3TreeNode />
      <Layer3AllViews />
      <VisualLanguageSection />

      <SectionHeader title="Summary" />
      <text>All OpenTUI components rendered successfully.</text>
      <text> </text>
      <text>To verify TUI components with real data, use:</text>
      <text color="cyan"> bun km view @next</text>
      <text> </text>
    </box>
  );
}

// ============================================================================
// Render and Signal Handling
// ============================================================================

// Create renderer with proper terminal cleanup
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

// Proper cleanup on signals
const cleanup = () => {
  renderer.unmount();
  process.exit(0);
};

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
process.on("SIGQUIT", cleanup);

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  renderer.unmount();
  console.error("Uncaught exception:", err);
  process.exit(1);
});

// Render the storybook
createRoot(renderer).render(<Storybook />);
