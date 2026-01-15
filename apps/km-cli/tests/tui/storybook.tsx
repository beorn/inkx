#!/usr/bin/env bun
/**
 * TUI Storybook - Visual Component Catalog
 *
 * Renders all TUI components in various states for visual inspection.
 * Run: bun run apps/km-cli/tests/tui/storybook.tsx
 *
 * Uses ink-testing-library to render actual React/Ink components,
 * ensuring the storybook exercises the real rendering pipeline.
 */

import React from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";
import chalk from "chalk";

import {
  renderRich,
  getStatusIcon,
  getTypeIcon,
  colorize,
  GTD_BOARD_COLORS,
} from "../../src/text/index.ts";
import {
  wrapText,
  truncateText,
  padText,
  constrainText,
  renderPath,
  renderParentPath,
  type PathSegment,
} from "../../src/tui/layout/index.ts";
import { TreeNode } from "../../src/tui/views/TreeNode.tsx";
import { ListView } from "../../src/tui/views/ListView.tsx";
import { ColumnsView } from "../../src/tui/views/ColumnsView.tsx";
import { TabsView } from "../../src/tui/views/TabsView.tsx";
import type { Node } from "@km/core";
import type {
  BoardState,
  ColumnState,
  CardState,
  SelectionKey,
} from "../../src/tui/types.ts";

// Force chalk colors
chalk.level = 3;

// ============================================================================
// Section Header Components
// ============================================================================

function SectionHeader({ title }: { title: string }): React.ReactElement {
  const divider = "═".repeat(60);
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="cyan">
        {divider}
      </Text>
      <Text bold color="cyan">
        {" "}
        {title}
      </Text>
      <Text bold color="cyan">
        {divider}
      </Text>
    </Box>
  );
}

function SubsectionHeader({ title }: { title: string }): React.ReactElement {
  const subDivider = "─".repeat(40);
  return (
    <Box flexDirection="column">
      <Text dimColor>{subDivider}</Text>
      <Text bold>{title}</Text>
      <Text> </Text>
    </Box>
  );
}

// ============================================================================
// Layer 1: Rich Text Rendering Component
// ============================================================================

function Layer1RichText(): React.ReactElement {
  const examples = {
    inlineFields: [
      { input: "Task with due date [due:: 2024-01-15]" },
      { input: "Task [priority:: 1] [status:: wip] with multiple fields" },
      { input: "No inline fields here" },
    ],
    wikiLinks: [
      { input: "See [[note]] for details" },
      { input: "Link to [[path/to/document|Document Title]]" },
      { input: "Multiple [[link1]] and [[link2|Second Link]]" },
    ],
    markdown: [
      { input: "This has **bold** text" },
      { input: "This has *italic* text" },
      { input: "This has `inline code` text" },
      { input: "This has ~~strikethrough~~ text" },
      { input: "**Bold** and *italic* and `code` together" },
    ],
  };

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 1: Rich Text Rendering" />

      <SubsectionHeader title="renderRich() - Inline Field Stripping" />
      {examples.inlineFields.map((ex, i) => (
        <Box key={i} flexDirection="column">
          <Text>
            <Text dimColor>input: </Text>
            {ex.input}
          </Text>
          <Text>
            <Text dimColor>output: </Text>
            {renderRich(ex.input)}
          </Text>
          <Text> </Text>
        </Box>
      ))}

      <SubsectionHeader title="renderRich() - Wiki Link Styling" />
      {examples.wikiLinks.map((ex, i) => (
        <Box key={i} flexDirection="column">
          <Text>
            <Text dimColor>input: </Text>
            {ex.input}
          </Text>
          <Text>
            <Text dimColor>output: </Text>
            {renderRich(ex.input)}
          </Text>
          <Text> </Text>
        </Box>
      ))}

      <SubsectionHeader title="renderRich() - Markdown Formatting" />
      {examples.markdown.map((ex, i) => (
        <Box key={i} flexDirection="column">
          <Text>
            <Text dimColor>input: </Text>
            {ex.input}
          </Text>
          <Text>
            <Text dimColor>output: </Text>
            {renderRich(ex.input)}
          </Text>
          <Text> </Text>
        </Box>
      ))}

      <SubsectionHeader title="displayLength() vs string.length" />
      <Text>
        Styled text: {chalk.bold.red("Hello")} {chalk.blue("World")}
      </Text>
      <Text>string.length: 40</Text>
      <Text>displayLength(): 11</Text>
    </Box>
  );
}

// ============================================================================
// Layer 1: Status & Type Icons Component
// ============================================================================

function Layer1BoardPills(): React.ReactElement {
  // Demonstrate board pill colors
  const gtdBoards = [
    { name: "inbox", desc: "Default inbox" },
    { name: "next", desc: "Next actions" },
    { name: "waiting", desc: "Waiting for others" },
    { name: "someday", desc: "Someday/maybe" },
    { name: "done", desc: "Completed" },
    { name: "blocked", desc: "Blocked tasks" },
  ];

  const customBoards = [
    { name: "Sprint", color: "magenta" },
    { name: "Urgent", color: "red" },
    { name: "Research", color: "blue" },
  ];

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 1: Board Pills" />

      <SubsectionHeader title="GTD Default Board Colors" />
      <Text dimColor> Board Name Color Pill Example</Text>
      <Text dimColor> ────────── ────── ─────────────────────</Text>
      {gtdBoards.map(({ name, desc }) => {
        const color = GTD_BOARD_COLORS[name] || "white";
        return (
          <Text key={name}>
            {" "}
            {name.padEnd(10)} {color.padEnd(6)} {colorize(`@${name}`, color)}{" "}
            {chalk.dim(`← ${desc}`)}
          </Text>
        );
      })}
      <Text> </Text>

      <SubsectionHeader title="Custom Board Colors (via color= attribute)" />
      <Text dimColor>
        {" "}
        Custom colors override GTD defaults using color=value in headings
      </Text>
      <Text dimColor> Example: ## Sprint `color=magenta`</Text>
      <Text> </Text>
      {customBoards.map(({ name, color }) => (
        <Text key={name}>
          {" "}
          {colorize(`@${name}`, color)} {chalk.dim(`← color=${color}`)}
        </Text>
      ))}
      <Text> </Text>

      <SubsectionHeader title="Compact Mode (colored dots)" />
      <Text dimColor> In compact view, pills are shown as colored dots:</Text>
      <Text>
        {" "}
        ○ Task on multiple boards {colorize("●", "cyan")}
        {colorize("●", "yellow")}
        {colorize("●", "magenta")}
      </Text>
      <Text> </Text>

      <SubsectionHeader title="Wide Mode (full @name pills)" />
      <Text dimColor> In wide view, pills show the full board name:</Text>
      <Text>
        {" "}
        ○ Task on multiple boards {colorize("@next", "cyan")}{" "}
        {colorize("@waiting", "yellow")} {colorize("@Sprint", "magenta")}
      </Text>
    </Box>
  );
}

function Layer1Icons(): React.ReactElement {
  const statusTable = [
    { marker: "[ ]", status: "todo", desc: "Not started" },
    { marker: "[/]", status: "wip", desc: "Work in progress" },
    { marker: "[!]", status: "blocked", desc: "Blocked by something" },
    { marker: "[x]", status: "done", desc: "Completed" },
    { marker: "[-]", status: "dropped", desc: "Dropped" },
  ];

  const customMarkers = [
    { marker: "[?]", status: "?", desc: "Question/unknown" },
    { marker: "[>]", status: ">", desc: "Forwarded/delegated" },
    { marker: "[<]", status: "<", desc: "Waiting on external" },
  ];

  const typeExamples = [
    { type: "folder", raw: "My Project", desc: "Folder name" },
    { type: "file", raw: "README.md", desc: "File name" },
    { type: "section", raw: "## Getting Started", desc: "Section header" },
    {
      type: "paragraph",
      raw: "Regular text with **bold** and *italic*",
      desc: "Formatted text",
    },
    { type: "code", raw: "const x = 42;", desc: "Code block (shown in cyan)" },
    { type: "quote", raw: "A wise saying", desc: "Quote (with «» markers)" },
    {
      type: "list-item",
      raw: "First item with [[link]]",
      desc: "List item with wiki link",
    },
  ];

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 1: Status & Type Icons" />

      <SubsectionHeader title="Status Icons (Tasks)" />
      <Text dimColor> Marker Rendered Task</Text>
      <Text dimColor> ──────── ─────────────────────────────────────────</Text>
      {statusTable.map(({ marker, status, desc }) => {
        const icon = getStatusIcon(status);
        const isDoneOrDropped = status === "done" || status === "dropped";
        const styledDesc = isDoneOrDropped
          ? chalk.dim.strikethrough(desc)
          : desc;
        return (
          <Text key={status}>
            {" "}
            {marker.padEnd(8)}{" "}
            {chalk[icon.color as keyof typeof chalk](icon.char)} {styledDesc}
          </Text>
        );
      })}
      <Text> </Text>

      <Text dimColor> Error States</Text>
      <Text dimColor> ──────── ─────────────────────────────────────────</Text>
      <Text>
        {" "}
        {chalk.dim("(none)")} {chalk.red("⚠")} Missing status (null/undefined)
      </Text>
      <Text> </Text>

      <Text dimColor> Custom Markers (inverted display)</Text>
      <Text dimColor> ──────── ─────────────────────────────────────────</Text>
      {customMarkers.map(({ marker, status, desc }) => (
        <Text key={status}>
          {" "}
          {marker.padEnd(8)} {chalk.bgWhite.black(status)} {desc}
        </Text>
      ))}
      <Text> </Text>

      <SubsectionHeader title="Type Icons & Rich Text Rendering" />
      <Text dimColor> Icon Type Example Rendering</Text>
      <Text dimColor> ──── ────────── ───────────────────────────────────</Text>
      {typeExamples.map(({ type, raw, desc }) => {
        const icon = getTypeIcon(type);
        const iconDisplay = (icon || " ").padEnd(2);

        let rendered: string;
        if (type === "code") {
          rendered = chalk.cyan(raw);
        } else if (type === "quote") {
          rendered = chalk.italic(`«${raw}»`);
        } else if (type === "section") {
          rendered = chalk.bold(raw.replace(/^#+\s*/, ""));
        } else {
          rendered = renderRich(raw);
        }

        return (
          <Text key={type}>
            {" "}
            {iconDisplay} {type.padEnd(10)} {rendered} {chalk.dim(`← ${desc}`)}
          </Text>
        );
      })}
    </Box>
  );
}

// ============================================================================
// Layer 2: Layout Functions Component
// ============================================================================

function Layer2Layout(): React.ReactElement {
  const longText =
    "This is a longer text that needs to be wrapped at a certain width to fit in a column";
  const truncText = "This is text that might be truncated";

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 2: Layout Functions" />

      <SubsectionHeader title="wrapText() - Word Wrapping" />
      <Text dimColor>Width 30:</Text>
      {wrapText(longText, 30).map((line, i) => (
        <Text key={i}> |{line}|</Text>
      ))}
      <Text> </Text>

      <Text dimColor>Width 20:</Text>
      {wrapText(longText, 20).map((line, i) => (
        <Text key={i}> |{line}|</Text>
      ))}
      <Text> </Text>

      <SubsectionHeader title="truncateText() - Truncation with Ellipsis" />
      <Text> width=50: |{truncateText(truncText, 50)}|</Text>
      <Text> width=30: |{truncateText(truncText, 30)}|</Text>
      <Text> width=20: |{truncateText(truncText, 20)}|</Text>
      <Text> width=10: |{truncateText(truncText, 10)}|</Text>
      <Text> </Text>

      <SubsectionHeader title="padText() - Padding to Width" />
      <Text> |{padText("Hi", 15)}| (length 15)</Text>
      <Text> |{padText("Hello", 15)}| (length 15)</Text>
      <Text> |{padText("Hello World", 15)}| (length 15)</Text>
      <Text> </Text>

      <SubsectionHeader title="constrainText() - Wrap + Truncate + Limit Lines" />
      <Text dimColor>Width=25, maxLines=2:</Text>
      {constrainText(
        "This is a longer piece of text that needs both wrapping and line limiting",
        25,
        2,
      ).lines.map((line, i) => (
        <Text key={i}> |{line}|</Text>
      ))}
      <Text> truncated: true</Text>
      <Text> </Text>

      <SubsectionHeader title="renderPath() - Breadcrumb Truncation" />
      {(() => {
        const segments: PathSegment[] = [
          {
            id: "proj-1",
            name: "Projects",
            sep: "/",
            isWithinBoard: false,
            node: null,
          },
          {
            id: "work-1",
            name: "Work",
            sep: "/",
            isWithinBoard: false,
            node: null,
          },
          {
            id: "q1-2024",
            name: "Q1-2024",
            sep: ">",
            isWithinBoard: true,
            node: null,
          },
          {
            id: "sprint-1",
            name: "Sprint 1",
            sep: ">",
            isWithinBoard: true,
            node: null,
          },
          {
            id: "tasks-1",
            name: "Tasks",
            sep: "",
            isWithinBoard: true,
            node: null,
          },
        ];
        // Helper to convert segments to string
        const segsToStr = (segs: PathSegment[]): string =>
          segs.map((s) => s.name + (s.sep ? ` ${s.sep} ` : "")).join("");
        return (
          <>
            <Text dimColor>Full path (length=44):</Text>
            <Text> |{segsToStr(renderPath(segments, 60))}|</Text>
            <Text> </Text>
            <Text dimColor>
              Width=60: |{segsToStr(renderPath(segments, 60))}|
            </Text>
            <Text dimColor>
              Width=40: |{segsToStr(renderPath(segments, 40))}|
            </Text>
            <Text dimColor>
              Width=25: |{segsToStr(renderPath(segments, 25))}|
            </Text>
          </>
        );
      })()}
      <Text> </Text>

      <SubsectionHeader title="renderParentPath() - Separate Line Context" />
      <Text dimColor>Input: "Projects/Work/Tasks/Subtask" (len=27)</Text>
      <Text> </Text>
      <Text dimColor>
        Width=30: |{renderParentPath("Projects/Work/Tasks/Subtask", 30)}|
      </Text>
      <Text dimColor>
        Width=25: |{renderParentPath("Projects/Work/Tasks/Subtask", 25)}|
      </Text>
      <Text dimColor>
        Width=20: |{renderParentPath("Projects/Work/Tasks/Subtask", 20)}|
      </Text>
    </Box>
  );
}

// ============================================================================
// Layer 3: View Components using actual TreeNode
// ============================================================================

// Helper to create mock nodes for demonstration
function mockNode(
  id: string,
  content: string,
  status?: string,
  type: string = "task",
): Node {
  return {
    id,
    type: type as Node["type"],
    parent_id: null,
    parent_idx: 0,
    symlink_to: null,
    content,
    task_status: status as Node["task_status"],
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "1",
  };
}

function Layer3Views(): React.ReactElement {
  // Create sample nodes for TreeNode rendering
  const todoTask = mockNode("todo-1", "Setup CI pipeline", "todo");
  const wipTask = mockNode("wip-1", "Review PR #42", "wip");
  const doneTask = mockNode("done-1", "Implement auth", "done");
  const blockedTask = mockNode("blocked-1", "Wait on API", "blocked");
  const droppedTask = mockNode("dropped-1", "Old approach", "dropped");

  const commonProps = {
    depth: 0,
    width: 40,
    foldedNodes: new Set<string>(),
    maxDepth: 3,
    colIndex: 0,
    cardIndex: 0,
    subIndex: 0,
    currentSubIndex: 0,
    multiSelected: new Set<string>(),
    inOutlineMode: false,
    variant: "wide" as const,
    maxContentLines: 1,
    dimInactiveChildren: false,
  };

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 3: TreeNode Component" />

      <SubsectionHeader title="TreeNode - Different Task States" />
      <Text dimColor>Each node rendered at width=40:</Text>
      <Text> </Text>

      <Text bold>Todo (open):</Text>
      <TreeNode
        {...commonProps}
        node={todoTask}
        isSelected={false}
        isMultiSelected={false}
      />

      <Text bold>WIP (in progress):</Text>
      <TreeNode
        {...commonProps}
        node={wipTask}
        isSelected={false}
        isMultiSelected={false}
      />

      <Text bold>Blocked:</Text>
      <TreeNode
        {...commonProps}
        node={blockedTask}
        isSelected={false}
        isMultiSelected={false}
      />

      <Text bold>Done (strikethrough + dim):</Text>
      <TreeNode
        {...commonProps}
        node={doneTask}
        isSelected={false}
        isMultiSelected={false}
      />

      <Text bold>Dropped (strikethrough + dim):</Text>
      <TreeNode
        {...commonProps}
        node={droppedTask}
        isSelected={false}
        isMultiSelected={false}
      />

      <Text> </Text>
      <SubsectionHeader title="TreeNode - Selection States" />

      <Text bold>Normal (not selected):</Text>
      <TreeNode
        {...commonProps}
        node={todoTask}
        isSelected={false}
        isMultiSelected={false}
      />

      <Text bold>Selected (blue background):</Text>
      <TreeNode
        {...commonProps}
        node={todoTask}
        isSelected={true}
        isMultiSelected={false}
      />

      <Text bold>Multi-selected (cyan background):</Text>
      <TreeNode
        {...commonProps}
        node={todoTask}
        isSelected={false}
        isMultiSelected={true}
      />
    </Box>
  );
}

// ============================================================================
// Layer 3: All Four View Modes
// ============================================================================

// Helper to create mock CardState with children
function mockCard(node: Node, children: Node[] = []): CardState {
  return { node, children };
}

// Helper to create mock ColumnState
function mockColumn(name: string, cards: CardState[]): ColumnState {
  return {
    node: mockNode(`col-${name}`, name, undefined, "section"),
    cards,
  };
}

// Create a rich mock BoardState with varied content for view demos
function createMockBoardState(): BoardState {
  // Backlog column: tasks with wiki links, inline fields, rich text
  const backlogCards: CardState[] = [
    mockCard(
      mockNode(
        "bl1",
        "Review [[architecture]] docs [due:: 2024-02-15]",
        "todo",
      ),
    ),
    mockCard(mockNode("bl2", "Plan **Q2** sprint goals", "todo")),
    mockCard(mockNode("bl3", "Update `config.ts` settings", "todo"), [
      mockNode("bl3-1", "Add new env vars", "todo"),
      mockNode("bl3-2", "Document changes in [[README]]", "todo"),
    ]),
    mockCard(mockNode("bl4", "~~Old approach~~ Try new method", "todo")),
  ];

  // In Progress column: WIP tasks with children and various types
  const wipCards: CardState[] = [
    mockCard(mockNode("wip1", "Implement auth flow [priority:: 1]", "wip"), [
      mockNode("wip1-1", "Setup OAuth provider", "done"),
      mockNode("wip1-2", "Add login endpoint", "wip"),
      mockNode("wip1-3", "Create session middleware", "todo"),
    ]),
    mockCard(mockNode("wip2", "Fix **critical** bug #42", "wip")),
    mockCard(mockNode("wip3", "Refactor [[database]] layer", "wip"), [
      mockNode(
        "wip3-note",
        "Consider using *connection pooling*",
        undefined,
        "paragraph",
      ),
    ]),
  ];

  // Blocked column: blocked tasks with reasons
  const blockedCards: CardState[] = [
    mockCard(
      mockNode("blk1", "Deploy to staging [blocked:: API down]", "blocked"),
      [mockNode("blk1-1", "Waiting on infra team", "blocked")],
    ),
    mockCard(mockNode("blk2", "Integrate payment system", "blocked")),
  ];

  // Done column: completed and dropped tasks
  const doneCards: CardState[] = [
    mockCard(mockNode("done1", "Setup project structure", "done")),
    mockCard(mockNode("done2", "Create initial tests", "done"), [
      mockNode("done2-1", "Unit tests for `utils.ts`", "done"),
      mockNode("done2-2", "Integration tests", "done"),
    ]),
    mockCard(mockNode("drop1", "Old migration script", "dropped")),
    mockCard(mockNode("done3", "Configure [[CI/CD]] pipeline", "done")),
  ];

  return {
    rootId: "board-root",
    rootPath: "/Projects/webapp",
    columns: [
      mockColumn("Backlog", backlogCards),
      mockColumn("In Progress", wipCards),
      mockColumn("Blocked", blockedCards),
      mockColumn("Done", doneCards),
    ],
    colIndex: 1, // Select "In Progress" column
    cardIndex: 0, // Select first card
    selectedCards: new Set<string>(),
    visualMode: false,
    foldedCards: new Set<string>(),
    collapsedColumns: new Set<number>(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
  };
}

// Top bar component showing breadcrumb path with proper board/item path styling
function TopBar({ width }: { width: number }): React.ReactElement {
  // Simulate path segments like the real Board.tsx does
  // Board path: Projects / webapp (gray separators, black text)
  // Item path: # In Progress > Implement auth flow (blue separator at boundary)
  const segments: Array<{ name: string; sep: string; isWithinBoard: boolean }> =
    [
      { name: "Projects", sep: "", isWithinBoard: false },
      { name: "webapp", sep: "/", isWithinBoard: false },
      { name: "In Progress", sep: "#", isWithinBoard: true }, // boundary - blue separator
      { name: "Implement auth flow", sep: ">", isWithinBoard: true },
    ];

  // Build styled path like Board.tsx does
  const topBarContent = segments
    .map((seg, i) => {
      const prevSeg = i > 0 ? segments[i - 1] : null;
      const isBoardBoundary =
        prevSeg && !prevSeg.isWithinBoard && seg.isWithinBoard;

      // White background, varying foreground colors
      const sepPart = seg.sep
        ? isBoardBoundary
          ? chalk.bgWhite.blue.bold(` ${seg.sep} `) // Blue separator at boundary
          : chalk.bgWhite.gray(` ${seg.sep} `) // Gray separators elsewhere
        : "";
      // Board path: black text, Item path (within board): blue text
      const namePart = seg.isWithinBoard
        ? chalk.bgWhite.blue(seg.name)
        : chalk.bgWhite.black.bold(seg.name);
      return sepPart + namePart;
    })
    .join("");

  // Calculate visible length for padding
  const visibleLen =
    1 +
    segments.reduce(
      (acc, seg) => acc + seg.name.length + (seg.sep ? seg.sep.length + 2 : 0),
      0,
    );
  const padding = " ".repeat(Math.max(0, width - visibleLen));

  return (
    <Box height={1} width={width}>
      <Text>
        {chalk.bgWhite.black(" ") + topBarContent + chalk.bgWhite(padding)}
      </Text>
    </Box>
  );
}

// Wrapper component with border and title
function ViewBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="magenta"
      marginY={1}
      paddingX={1}
    >
      <Text bold color="magenta">
        {title}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}

// Cards View - render cards in columns (simplified version of Board's Card/Column)
function CardsViewDemo({
  state,
  width,
  height,
}: {
  state: BoardState;
  width: number;
  height: number;
}): React.ReactElement {
  const colWidth = Math.floor(width / Math.min(state.columns.length, 4));

  return (
    <Box flexDirection="column" width={width}>
      <TopBar width={width} />
      <Box flexDirection="row" width={width} height={height}>
        {state.columns.slice(0, 4).map((column, cIdx) => {
          const isColSelected = cIdx === state.colIndex;
          return (
            <Box
              key={column.node.id}
              flexDirection="column"
              width={colWidth}
              borderStyle="single"
              borderColor={isColSelected ? "blueBright" : "blackBright"}
            >
              <Text bold color="yellow">
                {column.node.content} ({column.cards.length})
              </Text>
              {column.cards.slice(0, 3).map((card, cardIdx) => {
                const isCardSelected =
                  isColSelected && cardIdx === state.cardIndex;
                return (
                  <Box
                    key={card.node.id}
                    borderStyle="round"
                    borderColor={isCardSelected ? "cyanBright" : "blackBright"}
                    marginY={0}
                  >
                    <TreeNode
                      node={card.node}
                      depth={0}
                      width={colWidth - 6}
                      isSelected={isCardSelected}
                      isMultiSelected={false}
                      foldedNodes={new Set<string>()}
                      maxDepth={2}
                      colIndex={cIdx}
                      cardIndex={cardIdx}
                      subIndex={0}
                      currentSubIndex={0}
                      multiSelected={new Set<SelectionKey>()}
                      inOutlineMode={isCardSelected}
                      variant="compact"
                      maxContentLines={2}
                      dimInactiveChildren={!isCardSelected}
                    />
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function Layer3AllViews(): React.ReactElement {
  const mockState = createMockBoardState();
  const viewWidth = 100; // Wider to accommodate 4 columns with readable card text
  const viewHeight = 16;

  // Shared props for view components
  const commonViewProps = {
    state: mockState,
    width: viewWidth,
    height: viewHeight,
    foldedNodes: new Set<string>(),
    maxOutlineDepth: 2,
    multiSelected: new Set<SelectionKey>(),
    colIndex: mockState.colIndex,
    cardIndex: mockState.cardIndex,
    subIndex: 0,
    inOutlineMode: false,
    selectionLevel: "card" as const,
    maxContentLines: 2,
  };

  // ColumnsView needs these extra props
  const columnsViewProps = {
    ...commonViewProps,
    effectiveScrollOffset: 0,
    effectiveMaxCols: 4,
    effectiveVisibleColumns: mockState.columns,
  };

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 3: All View Modes" />
      <Text dimColor>
        Each view renders the same BoardState with varied content:
      </Text>
      <Text dimColor>• Tasks: todo ○, wip ◐, blocked ⊘, done ✓, dropped ∅</Text>
      <Text dimColor>
        • Rich text: **bold**, *italic*, `code`, ~~strike~~, [[links]]
      </Text>
      <Text dimColor>• Inline fields stripped: [due:: date] → (hidden)</Text>
      <Text dimColor>• Embedded children shown under parent tasks</Text>

      <ViewBox title="View 1: Cards (Kanban-style cards in columns)">
        <CardsViewDemo
          state={mockState}
          width={viewWidth}
          height={viewHeight}
        />
      </ViewBox>

      <ViewBox title="View 2: Columns (Tree within columns)">
        <TopBar width={viewWidth} />
        <ColumnsView {...columnsViewProps} />
      </ViewBox>

      <ViewBox title="View 3: Tabs (One column at a time)">
        <TopBar width={viewWidth} />
        <TabsView {...commonViewProps} />
      </ViewBox>

      <ViewBox title="View 4: List (Full-width hierarchical)">
        <TopBar width={viewWidth} />
        <ListView {...commonViewProps} />
      </ViewBox>
    </Box>
  );
}

// ============================================================================
// Main Storybook Component
// ============================================================================

function Storybook(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Layer1RichText />
      <Layer1BoardPills />
      <Layer1Icons />
      <Layer2Layout />
      <Layer3Views />
      <Layer3AllViews />

      <SectionHeader title="Summary" />
      <Text>All components rendered successfully.</Text>
      <Text> </Text>
      <Text>To verify TUI components with real data, use:</Text>
      <Text color="cyan"> bun km view @next</Text>
    </Box>
  );
}

// ============================================================================
// Render and Output
// ============================================================================

const { lastFrame } = render(<Storybook />);
console.log(lastFrame());
