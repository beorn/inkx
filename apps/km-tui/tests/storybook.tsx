#!/usr/bin/env bun
/**
 * TUI Storybook - Visual Component Catalog
 *
 * Renders all TUI components in various states for visual inspection.
 * Run: bun storybook
 *
 * ## IMPORTANT: Production Code Only
 *
 * This storybook MUST use production rendering code exclusively.
 * DO NOT use chalk or Ink primitives directly for styling.
 *
 * ✓ DO: Use production components (TreeNode, ListView, ColumnsView, etc.)
 * ✓ DO: Use production functions (renderRich, getStatusIcon, colorize, etc.)
 * ✓ DO: Use production layout helpers (wrapText, truncateText, etc.)
 *
 * ✗ DON'T: Use chalk.* for styling (except displayLength demo)
 * ✗ DON'T: Reimplement component styling with raw <Text> props
 * ✗ DON'T: Create custom rendering that doesn't match production
 *
 * Why? If storybook implements its own styling, it shows output that
 * doesn't match the actual app. Bugs in production rendering go undetected,
 * and the storybook gives false confidence that things work correctly.
 *
 * If a component is hard to use here, refactor it to be more reusable.
 * See: docs/dev/ink-patterns.md, bead km-board-2
 *
 * TODO: Several sections still use chalk directly and need refactoring.
 * See bead km-board-2 for the full plan.
 */

import React from "react"
import { createTestRenderer } from "inkx/testing"

const render = createTestRenderer({ columns: 120, rows: 500 })
import { Box, Text } from "inkx"
import chalk from "chalk"

import {
  renderRich,
  getStatusIcon,
  getFoldMarker,
  colorize,
  GTD_BOARD_COLORS,
  FOLDED_MARKER,
  UNFOLDED_MARKER,
  EMPTY_MARKER,
} from "../src/text/index.ts"
import {
  wrapText,
  truncateText,
  padText,
  constrainText,
  renderPath,
  renderParentPath,
  type PathSegment,
} from "../src/layout/index.ts"
import { TreeNode } from "../src/views/TreeNode.tsx"
import { ListView } from "../src/views/ListView.tsx"
import { ColumnsView } from "../src/views/ColumnsView.tsx"
import { TabsView } from "../src/views/TabsView.tsx"
import { TopBar } from "../src/views/TopBar.tsx"
import { BottomBar } from "../src/views/board-bottom-bar.tsx"
import { ToastStack } from "../src/views/ToastStack.tsx"
import type { KNode } from "@km/core"
import type { TUIBoardState, ColumnState, CardState } from "../src/types.ts"
import { UIProvider } from "../src/ui-context.tsx"
import { createInitialUIState, type UIState } from "../src/ui-reducer.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { createFakeRepo } from "@km/storage"
import type { Toast } from "@km/core"

// In-memory node store for storybook - supplements the DB for DI props
// TreeNode now accepts children/getChildren props for DI
const nodeStore = new Map<string, KNode>()
const childrenStore = new Map<string, KNode[]>() // parentId -> children

// Register a node in the store and track its parent relationship
function registerNode(node: KNode): void {
  nodeStore.set(node.id, node)
  if (node.parent_id) {
    const siblings = childrenStore.get(node.parent_id) ?? []
    // Avoid duplicates if called multiple times
    if (!siblings.find((n) => n.id === node.id)) {
      siblings.push(node)
      childrenStore.set(node.parent_id, siblings)
    }
  }
}

// Get children from the in-memory store
function getChildrenFromStore(id: string): KNode[] {
  return childrenStore.get(id) ?? []
}

// Get parent context for embedded tasks (simplified for storybook)
function getParentContextFromStore(node: KNode): string | null {
  if (!node.link_to) return null
  const linkedNode = nodeStore.get(node.link_to)
  if (!linkedNode?.parent_id) return null
  const parent = nodeStore.get(linkedNode.parent_id)
  return parent?.content ?? parent?.name ?? null
}

// Get board pills for a task (storybook returns empty - no board context)
function getBoardPillsFromStore(): [] {
  return []
}

// Create a mock UI state for storybook rendering
const mockUIState = createInitialUIState("cards", [], {
  columns: 120,
  rows: 40,
})
const noopDispatch = () => {}

// Force chalk colors
chalk.level = 3

// ============================================================================
// Section Header Components
// ============================================================================

function SectionHeader({ title }: { title: string }): React.ReactElement {
  const divider = "═".repeat(60)
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
  )
}

function SubsectionHeader({ title }: { title: string }): React.ReactElement {
  const subDivider = "─".repeat(40)
  return (
    <Box flexDirection="column">
      <Text dimColor>{subDivider}</Text>
      <Text bold>{title}</Text>
      <Text> </Text>
    </Box>
  )
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
  }

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
  )
}

// ============================================================================
// Layer 1: Status & Type Icons Component
// ============================================================================

function Layer1TagPills(): React.ReactElement {
  // Demonstrate tag/pill colors
  // Some tags have preset colors (e.g., GTD workflow tags)
  const presetTags = [
    { name: "inbox", desc: "Uncategorized items" },
    { name: "next", desc: "Ready to work on" },
    { name: "waiting", desc: "Blocked on external" },
    { name: "someday", desc: "Future consideration" },
    { name: "done", desc: "Completed" },
    { name: "blocked", desc: "Cannot proceed" },
  ]

  const customTags = [
    { name: "Sprint", color: "magenta" },
    { name: "Urgent", color: "red" },
    { name: "Research", color: "blue" },
  ]

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 1: Tag Pills" />

      <SubsectionHeader title="Preset Tag Colors" />
      <Text dimColor> Tag Name Color Pill Example</Text>
      <Text dimColor> ────────── ────── ─────────────────────</Text>
      {presetTags.map(({ name, desc }) => {
        const color = GTD_BOARD_COLORS[name] || "white"
        return (
          <Text key={name}>
            {" "}
            {name.padEnd(10)} {color.padEnd(6)} {colorize(`@${name}`, color)}{" "}
            <Text dimColor>← {desc}</Text>
          </Text>
        )
      })}
      <Text> </Text>

      <SubsectionHeader title="Custom Tag Colors (via color= attribute)" />
      <Text dimColor>
        {" "}
        Custom colors override presets using color=value in headings
      </Text>
      <Text dimColor> Example: ## Sprint `color=magenta`</Text>
      <Text> </Text>
      {customTags.map(({ name, color }) => (
        <Text key={name}>
          {" "}
          {colorize(`@${name}`, color)} <Text dimColor>← color={color}</Text>
        </Text>
      ))}
      <Text> </Text>

      <SubsectionHeader title="Compact Mode (colored dots)" />
      <Text dimColor> In compact view, pills are shown as colored dots:</Text>
      <Text>
        {" "}
        ○ Task with multiple tags {colorize("●", "cyan")}
        {colorize("●", "yellow")}
        {colorize("●", "magenta")}
      </Text>
      <Text> </Text>

      <SubsectionHeader title="Wide Mode (full @name pills)" />
      <Text dimColor> In wide view, pills show the full tag name:</Text>
      <Text>
        {" "}
        ○ Task with multiple tags {colorize("@next", "cyan")}{" "}
        {colorize("@waiting", "yellow")} {colorize("@Sprint", "magenta")}
      </Text>
    </Box>
  )
}

function Layer1TaskStyling(): React.ReactElement {
  // Status data: marker (plain text), icon (TUI), description
  // New cards style uses SQUARE icons
  const statusTable = [
    { mark: " ", status: "todo", desc: "Not started", icon: "▢" },
    { mark: "/", status: "wip", desc: "Work in progress", icon: "◧" },
    { mark: "!", status: "blocked", desc: "Blocked", icon: "■" },
    { mark: "x", status: "done", desc: "Completed", icon: "▣" },
    { mark: "-", status: "dropped", desc: "Dropped", icon: "■" },
  ]

  const customMarkers = [
    { mark: "?", desc: "Question/unknown" },
    { mark: ">", desc: "Forwarded/delegated" },
    { mark: "<", desc: "Waiting on external" },
  ]

  // Helper to get marker color based on status (uses Ink color names)
  const getMarkerColor = (
    status?: string,
  ): "green" | "yellow" | "red" | undefined => {
    switch (status) {
      case "done":
        return "green"
      case "wip":
        return "yellow"
      case "blocked":
        return "red"
      default:
        return undefined
    }
  }

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 1: Task Styling (Square Icons)" />

      <SubsectionHeader title="Standard Status States" />
      <Text dimColor> Plain Icon Description</Text>
      <Text dimColor> ───── ──── ─────────────────────</Text>
      {statusTable.map(({ mark, status, desc }) => {
        const icon = getStatusIcon(status)
        const isDoneOrDropped = status === "done" || status === "dropped"
        const markerColor = getMarkerColor(status)

        return (
          <Text key={status}>
            {" "}
            <Text dimColor>[</Text>
            <Text color={markerColor} dimColor={!markerColor}>
              {mark}
            </Text>
            <Text dimColor>]</Text> <Text color={icon.color}>{icon.char}</Text>
            {"    "}
            <Text dimColor={isDoneOrDropped}>{desc}</Text>
          </Text>
        )
      })}
      <Text> </Text>

      <SubsectionHeader title="Custom Markers (inverted in TUI)" />
      <Text dimColor> Plain Icon Description</Text>
      <Text dimColor> ───── ──── ─────────────────────</Text>
      {customMarkers.map(({ mark, desc }) => (
        <Text key={mark}>
          {" "}
          <Text dimColor>[</Text>
          <Text dimColor>{mark}</Text>
          <Text dimColor>]</Text>{" "}
          <Text backgroundColor="white" color="black">
            {mark}
          </Text>
          {"    "}
          {desc}
        </Text>
      ))}
      <Text> </Text>

      <SubsectionHeader title="Error State" />
      <Text>
        {" "}
        <Text dimColor>[</Text>
        <Text dimColor>-</Text>
        <Text dimColor>]</Text> <Text color="red">⚠</Text>
        {"    "}
        Missing status (null/undefined)
      </Text>
    </Box>
  )
}

function Layer1FoldMarkers(): React.ReactElement {
  // Fold marker system - new cards style
  // Single marker indicates fold state, not task status
  const foldStates = [
    { hasChildren: true, isFolded: true, desc: "Folded (has hidden children)" },
    { hasChildren: true, isFolded: false, desc: "Unfolded (children visible)" },
    { hasChildren: false, isFolded: false, desc: "Empty (no children)" },
  ]

  const colors = ["white", "cyan", "red", "green", "yellow", "magenta", "blue"]

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 1: Fold Markers (Cards Style)" />

      <SubsectionHeader title="Fold State Indicators" />
      <Text dimColor> Marker Description</Text>
      <Text dimColor> ────── ─────────────────────────────</Text>
      {foldStates.map(({ hasChildren, isFolded, desc }, i) => {
        const marker = getFoldMarker(hasChildren, isFolded)
        return (
          <Text key={i}>
            {" "}
            <Text color={marker.color}>{marker.char}</Text>
            {"      "}
            {desc}
          </Text>
        )
      })}
      <Text> </Text>

      <SubsectionHeader title="Marker Constants" />
      <Text>
        {" "}
        <Text color={FOLDED_MARKER.color}>{FOLDED_MARKER.char}</Text>{" "}
        FOLDED_MARKER (● U+25CF) - big filled circle
      </Text>
      <Text>
        {" "}
        <Text color={UNFOLDED_MARKER.color}>{UNFOLDED_MARKER.char}</Text>{" "}
        UNFOLDED_MARKER (• U+2022) - medium bullet
      </Text>
      <Text>
        {" "}
        <Text color={EMPTY_MARKER.color}>{EMPTY_MARKER.char}</Text> EMPTY_MARKER
        (· U+00B7) - tiny dot
      </Text>
      <Text> </Text>

      <SubsectionHeader title="Colored Fold Markers (node color inheritance)" />
      <Text dimColor> When a node has a color, the marker inherits it:</Text>
      <Text> </Text>
      {colors.map((color) => {
        const folded = getFoldMarker(true, true, color)
        const unfolded = getFoldMarker(true, false, color)
        const empty = getFoldMarker(false, false, color)
        return (
          <Text key={color}>
            {" "}
            <Text color={folded.color}>{folded.char}</Text>{" "}
            <Text color={unfolded.color}>{unfolded.char}</Text>{" "}
            <Text color={empty.color}>{empty.char}</Text>
            {"  "}
            <Text dimColor>color={color}</Text>
          </Text>
        )
      })}
      <Text> </Text>

      <SubsectionHeader title="Combined: Fold Marker + Task Status" />
      <Text dimColor>
        {" "}
        New cards style: marker indicates fold, status in title
      </Text>
      <Text> </Text>
      <Text>
        {" "}
        <Text>{FOLDED_MARKER.char}</Text> <Text color="gray">▢</Text> Folded
        todo task (5)
      </Text>
      <Text>
        {" "}
        <Text>{UNFOLDED_MARKER.char}</Text> <Text color="yellow">◧</Text>{" "}
        Unfolded WIP task
      </Text>
      <Text>
        {" "}
        <Text color="gray">{EMPTY_MARKER.char}</Text>{" "}
        <Text color="green">▣</Text> Leaf done task
      </Text>
      <Text>
        {" "}
        <Text color="gray">{EMPTY_MARKER.char}</Text> Regular note (no status)
      </Text>
    </Box>
  )
}

// ============================================================================
// Layer 2: Layout Functions Component
// ============================================================================

function Layer2Layout(): React.ReactElement {
  const longText =
    "This is a longer text that needs to be wrapped at a certain width to fit in a column"
  const truncText = "This is text that might be truncated"

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
        ]
        // Helper to convert segments to string
        const segsToStr = (segs: PathSegment[]): string =>
          segs.map((s) => s.name + (s.sep ? ` ${s.sep} ` : "")).join("")
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
        )
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
  )
}

// ============================================================================
// Layer 3: View Components using actual TreeNode
// ============================================================================

// Helper to create mock nodes for demonstration
// Options: { parentId, linkTo, linkAlias } for embedded/linked tasks
function mockNode(
  id: string,
  content: string,
  status?: string,
  type: string = "task",
  options?: { parentId?: string; linkTo?: string; linkAlias?: string },
): KNode {
  const node: KNode = {
    id,
    type: type as KNode["type"],
    parent_id: options?.parentId ?? null,
    parent_idx: 0,
    link_to: options?.linkTo ?? null,
    link_alias: options?.linkAlias,
    content,
    task_status: status as KNode["task_status"],
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "1",
  }

  // Register in the in-memory store so getChildrenFromStore() works
  registerNode(node)

  return node
}

function Layer3Views(): React.ReactElement {
  // Create sample nodes for TreeNode rendering
  const todoTask = mockNode("todo-1", "Setup CI pipeline", "todo")
  const wipTask = mockNode("wip-1", "Review PR #42", "wip")
  const doneTask = mockNode("done-1", "Implement auth", "done")
  const blockedTask = mockNode("blocked-1", "Wait on API", "blocked")
  const droppedTask = mockNode("dropped-1", "Old approach", "dropped")

  // TreeNode now gets foldedNodes, maxDepth, maxContentLines, inOutlineMode,
  // currentSubIndex, variant, and multiSelected from context.
  // DI props (getChildren, getParentContext) use the in-memory store.
  const commonProps = {
    depth: 0,
    width: 40,
    colIndex: 0,
    cardIndex: 0,
    subIndex: 0,
    dimInactiveChildren: false,
    getChildren: getChildrenFromStore,
    getParentContext: getParentContextFromStore,
    getBoardPills: getBoardPillsFromStore,
  }

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 3: TreeNode Component" />

      <SubsectionHeader title="TreeNode - Different Task States" />
      <Text dimColor>Each node rendered at width=40:</Text>
      <Text> </Text>

      <Text bold>Todo (open):</Text>
      <TreeNode {...commonProps} node={todoTask} isSelected={false} />

      <Text bold>WIP (in progress):</Text>
      <TreeNode {...commonProps} node={wipTask} isSelected={false} />

      <Text bold>Blocked:</Text>
      <TreeNode {...commonProps} node={blockedTask} isSelected={false} />

      <Text bold>Done (strikethrough + dim):</Text>
      <TreeNode {...commonProps} node={doneTask} isSelected={false} />

      <Text bold>Dropped (strikethrough + dim):</Text>
      <TreeNode {...commonProps} node={droppedTask} isSelected={false} />

      <Text> </Text>
      <SubsectionHeader title="TreeNode - Selection States" />

      <Text bold>Normal (not selected):</Text>
      <TreeNode {...commonProps} node={todoTask} isSelected={false} />

      <Text bold>Selected (cyan background):</Text>
      <TreeNode {...commonProps} node={todoTask} isSelected={true} />

      <Text bold>Multi-selected (also cyan background):</Text>
      <TreeNode {...commonProps} node={todoTask} isSelected={false} />
    </Box>
  )
}

// ============================================================================
// Layer 3: All Four View Modes
// ============================================================================

// Helper to create mock CardState with children
// Children are created with proper parent_id for getChildren() to work
function mockCard(
  node: KNode,
  childDefs: Array<{ content: string; status?: string }> = [],
): CardState {
  const children = childDefs.map((def, i) =>
    mockNode(`${node.id}-child-${i}`, def.content, def.status, "task", {
      parentId: node.id,
    }),
  )
  return { node, children }
}

// Helper to create mock ColumnState
function mockColumn(name: string, cards: CardState[]): ColumnState {
  return {
    node: mockNode(`col-${name}`, name, undefined, "section"),
    cards,
  }
}

// Create a rich mock TUIBoardState with varied content for view demos
// This demonstrates ALL styling scenarios:
// - Task statuses: todo, wip, blocked, done, dropped
// - Done/dropped tasks: dimmed styling
// - Inactive children: dimmed when parent card not selected (depth > 0)
// - Parent context: italic + dim on separate line for embedded/linked tasks
// - Rich text: **bold**, *italic*, `code`, [[wiki links]], ~~strike~~
function createMockTUIBoardState(): TUIBoardState {
  // Create a source hierarchy for embedded tasks to link to
  // The parent context shows the PARENT of the linked task, so we need:
  //   source-file (file) → source-section (section) → source-task (task)
  // When we link to source-task, it shows "source-section" as the parent context

  // File level (grandparent - not shown in context)
  mockNode("source-file-api", "projects/api.md", undefined, "file")
  mockNode("source-file-design", "projects/design.md", undefined, "file")
  mockNode("source-file-infra", "projects/infra.md", undefined, "file")

  // Section level (parent - THIS is shown in context as "{section name}")
  mockNode("source-api", "API Integration Project", undefined, "section", {
    parentId: "source-file-api",
  })
  mockNode("source-design", "Design System Work", undefined, "section", {
    parentId: "source-file-design",
  })
  mockNode("source-infra", "Infrastructure Tasks", undefined, "section", {
    parentId: "source-file-infra",
  })

  // Original tasks (these are what we link TO from the board)
  // The embedded tasks in the board will link to these, and show their parent (section) as context
  mockNode("orig-api-endpoints", "Implement REST endpoints", "wip", "task", {
    parentId: "source-api",
  })
  mockNode("orig-design-buttons", "Create button components", "todo", "task", {
    parentId: "source-design",
  })
  mockNode("orig-infra-cicd", "Setup CI/CD pipeline", "done", "task", {
    parentId: "source-infra",
  })
  mockNode("orig-infra-db", "Database migrations", "wip", "task", {
    parentId: "source-infra",
  })
  mockNode("orig-infra-logging", "Configure logging", "done", "task", {
    parentId: "source-infra",
  })
  mockNode("orig-api-review", "Review PR #42", "todo", "task", {
    parentId: "source-api",
  })

  // Column 1 - Active Tasks with CHILDREN (shows inactive children dimming)
  // When this column is NOT selected, children at depth > 0 are dimmed
  const activeCards: CardState[] = [
    // WIP task WITH CHILDREN - children show inactive dimming when not selected
    mockCard(mockNode("act1", "Implement **auth flow**", "wip"), [
      { content: "Setup OAuth provider", status: "done" }, // done = always dimmed
      { content: "Add login endpoint", status: "wip" },
      { content: "Create session middleware", status: "todo" },
    ]),
    // Another task with children
    mockCard(mockNode("act2", "Build user dashboard", "todo"), [
      { content: "Create layout components", status: "todo" },
      { content: "Add data fetching", status: "todo" },
    ]),
    // Simple task without children
    mockCard(mockNode("act3", "Review [[architecture]] docs", "todo")),
    // Blocked task
    mockCard(mockNode("act4", "Deploy to staging", "blocked")),
  ]

  // Column 2 - EMBEDDED/LINKED Tasks (shows parent context with prefix)
  // These tasks have link_to set, pointing to ORIGINAL tasks in other files
  // The parent context shows the PARENT of the original task (the section)
  const embeddedCards: CardState[] = [
    // Embedded task from API project - shows "API Integration Project"
    mockCard(
      mockNode("emb1", "Implement REST endpoints", "wip", "task", {
        linkTo: "orig-api-endpoints", // Links to original task, shows its parent section
      }),
    ),
    // Embedded task from Design System - shows "Design System Work"
    mockCard(
      mockNode("emb2", "Create button components", "todo", "task", {
        linkTo: "orig-design-buttons",
      }),
    ),
    // Embedded task from Infrastructure - shows "Infrastructure Tasks"
    mockCard(
      mockNode("emb3", "Setup CI/CD pipeline", "done", "task", {
        linkTo: "orig-infra-cicd",
      }),
    ),
    // Embedded task with children AND parent context
    mockCard(
      mockNode("emb4", "Database migrations", "wip", "task", {
        linkTo: "orig-infra-db",
      }),
      [
        { content: "Create schema", status: "done" },
        { content: "Write seed data", status: "wip" },
      ],
    ),
    // Another embedded with alias
    mockCard(
      mockNode("emb5", "Review PR #42", "todo", "task", {
        linkTo: "orig-api-review",
        linkAlias: "API Review",
      }),
    ),
  ]

  // Column 3 - Completed (done/dropped = ALL dimmed)
  const completedCards: CardState[] = [
    mockCard(mockNode("cmp1", "Setup project structure", "done")),
    mockCard(mockNode("cmp2", "Create initial tests", "done"), [
      { content: "Unit tests for `utils.ts`", status: "done" },
      { content: "Integration tests", status: "done" },
    ]),
    mockCard(mockNode("cmp3", "Old migration script", "dropped")),
    // Embedded + done = dimmed with parent context
    mockCard(
      mockNode("cmp4", "Configure logging", "done", "task", {
        linkTo: "orig-infra-logging",
      }),
    ),
  ]

  // Column 4 - Rich Text formatting showcase
  const formattingCards: CardState[] = [
    mockCard(mockNode("fmt1", "Task with **bold** text", "todo")),
    mockCard(mockNode("fmt2", "Task with *italic* text", "todo")),
    mockCard(mockNode("fmt3", "Task with `inline code`", "todo")),
    mockCard(mockNode("fmt4", "Task with [[wiki link]]", "todo")),
    mockCard(mockNode("fmt5", "~~Strikethrough~~ in markdown", "todo")),
    mockCard(
      mockNode("fmt6", "**Bold** and *italic* and `code` together", "wip"),
    ),
  ]

  // Note: colIndex/cardIndex are now in ColumnsLayout, not TUIBoardState
  return {
    rootId: "board-root",
    rootPath: "/Projects/webapp",
    columns: [
      mockColumn("Active", activeCards),
      mockColumn("Embedded", embeddedCards), // NEW: Shows parent context
      mockColumn("Completed", completedCards),
      mockColumn("Formatting", formattingCards),
    ],
    selectedCards: new Set<string>(),
    visualMode: false,
    foldedCards: new Set<string>(),
    collapsedColumns: new Set<number>(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
  }
}

// Sample path segments for TopBar demos - uses production TopBar component
// Separators per production Board.tsx getPathSegments():
//   "/" = filesystem path (folder/file)
//   "#" = section (markdown heading)
//   tasks/other types also use "/" when in path
const demoPathSegments: PathSegment[] = [
  { id: "proj", name: "Projects", sep: "", isWithinBoard: false, node: null },
  { id: "webapp", name: "webapp", sep: "/", isWithinBoard: false, node: null },
  {
    id: "inprog",
    name: "In Progress",
    sep: "#",
    isWithinBoard: true,
    node: null,
  },
]

// Wrapper component with border and title
function ViewBox({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      width={100}
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
  )
}

// Cards View - render cards in columns (simplified version of Board's Card/Column)
// Uses vertical line separators between columns like production Board.tsx
function CardsViewDemo({
  state,
  width,
  colIndex = 0,
  cardIndex = 0,
}: {
  state: TUIBoardState
  width: number
  colIndex?: number
  cardIndex?: number
}): React.ReactElement {
  const numCols = Math.min(state.columns.length, 4)
  // Account for separator lines (1 char each) between columns
  const separatorWidth = numCols - 1
  const colWidth = Math.floor((width - separatorWidth) / numCols)

  // NOTE: Do NOT use height={height} on the row Box!
  // Ink clips bordered Box content from TOP (not bottom) when height is constrained.
  // See bead km-2yys for details on this Ink quirk.
  return (
    <Box flexDirection="column" width={width}>
      <TopBar segments={demoPathSegments} width={width} />
      <Box flexDirection="row" width={width}>
        {state.columns.slice(0, 4).map((column, cIdx) => {
          const isColSelected = cIdx === colIndex
          const isLastCol = cIdx === numCols - 1
          return (
            <React.Fragment key={column.node.id}>
              <Box flexDirection="column" width={colWidth}>
                <Text bold color={isColSelected ? "yellow" : "yellowBright"}>
                  {column.node.content} ({column.cards.length})
                </Text>
                {column.cards.slice(0, 3).map((card, cardIdx) => {
                  const isCardSelected = isColSelected && cardIdx === cardIndex
                  return (
                    <Box
                      key={card.node.id}
                      borderStyle="round"
                      borderColor={
                        isCardSelected ? "cyanBright" : "blackBright"
                      }
                      paddingLeft={1}
                    >
                      <TreeNode
                        node={card.node}
                        depth={0}
                        isSelected={isCardSelected}
                        colIndex={cIdx}
                        cardIndex={cardIdx}
                        subIndex={0}
                        dimInactiveChildren={!isCardSelected}
                        getChildren={getChildrenFromStore}
                        getParentContext={getParentContextFromStore}
                      />
                    </Box>
                  )
                })}
              </Box>
              {/* Vertical separator between columns */}
              {!isLastCol && (
                <Box flexDirection="column" width={1}>
                  <Text color="gray">│</Text>
                </Box>
              )}
            </React.Fragment>
          )
        })}
      </Box>
    </Box>
  )
}

function Layer3AllViews(): React.ReactElement {
  const mockState = createMockTUIBoardState()
  // ViewBox has: border (2 chars) + paddingX (2 chars) = 4 chars overhead
  // Inner content width is outerWidth - 4
  const viewWidth = 96 // Fits within ViewBox (100 - 4 for border/padding)
  const viewHeight = 16

  // Different selection levels to show variety across views:
  // - View 1 (Cards): card level - shows card selection + inactive children dimming
  // - View 2 (Columns): column level - shows column header selection
  // - View 3 (Tabs): card level in tab view
  // - View 4 (List): outline level - shows sub-item selection within card

  // Card-level selection (column 0, card 0 selected)
  const cardLevelProps = {
    state: mockState,
    width: viewWidth,
    height: viewHeight,
    colIndex: 0,
    cardIndex: 0,
    subIndex: 0,
    selectionLevel: "card" as const,
  }

  // Column-level selection (selecting column header, not specific card)
  const columnLevelProps = {
    state: mockState,
    width: viewWidth,
    height: viewHeight,
    colIndex: 1, // Select "Embedded" column to show linked tasks
    cardIndex: 0,
    subIndex: 0,
    selectionLevel: "column" as const,
  }

  // List view with card selection in different column
  const listViewProps = {
    state: mockState,
    width: viewWidth,
    height: viewHeight,
    colIndex: 2, // Select "Completed" column to show done/dropped dimming
    cardIndex: 1, // Select second card (has children)
    subIndex: 0,
    selectionLevel: "card" as const,
  }

  // ColumnsView needs these extra props
  const columnsViewProps = {
    ...columnLevelProps,
    effectiveScrollOffset: 0,
    effectiveMaxCols: 4,
    effectiveVisibleColumns: mockState.columns,
  }

  return (
    <Box flexDirection="column">
      <SectionHeader title="Layer 3: All View Modes" />
      <Text dimColor>
        Each view renders the same TUIBoardState with varied content:
      </Text>
      <Text dimColor>
        • Fold markers: ● folded, • unfolded, · empty (size variation)
      </Text>
      <Text dimColor>
        • Task status: ▢ todo, ◧ wip, ■ blocked, ▣ done (square style)
      </Text>
      <Text dimColor>
        • Rich text: **bold**, *italic*, `code`, ~~strike~~, [[links]]
      </Text>
      <Text dimColor>• Inactive children: dimmed when card not selected</Text>
      <Text dimColor>• Embedded tasks: show parent context prefix</Text>
      <Text dimColor>
        • Selection levels: column → card → outline (sub-items)
      </Text>

      <ViewBox title="View 1: Cards (card level - first card selected)">
        <CardsViewDemo state={mockState} width={viewWidth} />
      </ViewBox>

      <ViewBox title="View 2: Columns (column level - 'Embedded' column selected)">
        <TopBar segments={demoPathSegments} width={viewWidth} />
        <ColumnsView {...columnsViewProps} />
      </ViewBox>

      <ViewBox title="View 3: Tabs (card level - shows Active column)">
        <TopBar segments={demoPathSegments} width={viewWidth} />
        <TabsView {...cardLevelProps} />
      </ViewBox>

      <ViewBox title="View 4: List (card level - 'Completed' column, 2nd card)">
        <TopBar segments={demoPathSegments} width={viewWidth} />
        <ListView {...listViewProps} />
      </ViewBox>
    </Box>
  )
}

// ============================================================================
// Visual Language Section - Design System Reference
// ============================================================================

function VisualLanguageSection(): React.ReactElement {
  const todoTask = mockNode("vl-1", "Example task content", "todo")
  const wipTask = mockNode("vl-2", "Work in progress task", "wip")
  const doneTask = mockNode("vl-3", "Completed task item", "done")

  // TreeNode now gets most props from context.
  // DI props (getChildren, getParentContext) use the in-memory store.
  const commonProps = {
    depth: 0,
    width: 35,
    colIndex: 0,
    cardIndex: 0,
    subIndex: 0,
    dimInactiveChildren: false,
    getChildren: getChildrenFromStore,
    getParentContext: getParentContextFromStore,
    getBoardPills: getBoardPillsFromStore,
  }

  return (
    <Box flexDirection="column">
      <SectionHeader title="Visual Language - Design System" />
      <Text dimColor>Reference: specs/km-design-system.md</Text>
      <Text> </Text>

      <SubsectionHeader title="Selection States (RESERVED COLOR)" />
      <Text dimColor>
        {" "}
        Cyan bg = selection ONLY (cursor, focused, multi-select)
      </Text>
      <Text> </Text>

      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" width={38}>
          <Text bold>Normal (no selection):</Text>
          <TreeNode {...commonProps} node={todoTask} isSelected={false} />
        </Box>
        <Box flexDirection="column" width={38}>
          <Text bold color="cyan">
            Selected (cyan bg):
          </Text>
          <TreeNode {...commonProps} node={todoTask} isSelected={true} />
        </Box>
      </Box>
      <Text> </Text>

      <SubsectionHeader title="Panel Focus States" />
      <Box flexDirection="row" gap={2}>
        <Box
          flexDirection="column"
          width={30}
          borderStyle="round"
          borderColor="cyanBright"
          paddingX={1}
        >
          <Text bold color="yellow">
            Active Panel
          </Text>
          <Text dimColor>borderColor: cyanBright</Text>
          <Text dimColor>header: yellow + bold</Text>
        </Box>
        <Box
          flexDirection="column"
          width={30}
          borderStyle="round"
          borderColor="blackBright"
          paddingX={1}
        >
          <Text bold color="yellowBright" dimColor>
            Inactive Panel
          </Text>
          <Text dimColor>borderColor: blackBright</Text>
          <Text dimColor>header: yellowBright + dim</Text>
        </Box>
      </Box>
      <Text> </Text>

      <SubsectionHeader title="Column Header States" />
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column">
          <Text bold color="yellow">
            Selected Column (4)
          </Text>
          <Text dimColor>color: yellow, bold: true</Text>
        </Box>
        <Box flexDirection="column">
          <Text color="yellowBright" dimColor>
            Unselected Column (2)
          </Text>
          <Text dimColor>color: yellowBright, dimColor: true</Text>
        </Box>
        <Box flexDirection="column">
          <Text backgroundColor="cyan" color="black">
            {" "}
            Header at Cursor{" "}
          </Text>
          <Text dimColor>bg: cyan (cursor level)</Text>
        </Box>
      </Box>
      <Text> </Text>

      <SubsectionHeader title="Task Status States" />
      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" width={30}>
          <Text bold>Active states:</Text>
          <TreeNode {...commonProps} node={todoTask} isSelected={false} />
          <TreeNode {...commonProps} node={wipTask} isSelected={false} />
        </Box>
        <Box flexDirection="column" width={38}>
          <Text bold>Terminal states (dim only):</Text>
          <TreeNode {...commonProps} node={doneTask} isSelected={false} />
          <TreeNode
            {...commonProps}
            node={mockNode("vl-4", "Dropped task item", "dropped")}
            isSelected={false}
          />
        </Box>
      </Box>
      <Text> </Text>

      <SubsectionHeader title="Input & Mode Indicators" />
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column">
          <Text>
            Text input cursor: [search
            <Text inverse> </Text>]
          </Text>
          <Text dimColor>Uses inverse video</Text>
        </Box>
        <Box flexDirection="column">
          <Text>
            Mode badge: <Text inverse> CARDS </Text>
          </Text>
          <Text dimColor>Uses inverse video</Text>
        </Box>
        <Box flexDirection="column">
          <Text>
            Selection prefix: <Text color="cyan">▸</Text> Selected item
          </Text>
          <Text dimColor>Arrow indicates focus</Text>
        </Box>
      </Box>
      <Text> </Text>

      <SubsectionHeader title="Due Date Urgency (underlines)" />
      <Text dimColor>
        {" "}
        Uses 24-bit RGB colors - may not render in all terminals
      </Text>
      <Text> </Text>
      <Text>
        {" "}
        <Text color="red">Overdue</Text>: red curly underline [255,80,80]
      </Text>
      <Text>
        {" "}
        <Text color="#FFA500">Today/Tomorrow</Text>: orange curly underline
        [255,165,0]
      </Text>
      <Text>
        {" "}
        <Text color="yellow">This week</Text>: yellow single underline
        [255,255,0]
      </Text>
      <Text> Beyond 7 days: no underline</Text>
    </Box>
  )
}

// ============================================================================
// Toast & Status Bar Section
// ============================================================================

function ToastAndStatusSection(): React.ReactElement {
  // Create mock toasts for demonstration
  const mockToasts: Toast[] = [
    {
      id: "toast-1",
      level: "info",
      message: "3 tasks selected",
      duration: 4000,
      dismissible: true,
    },
    {
      id: "toast-2",
      level: "success",
      message: "Synced 5 files",
      duration: 2000,
      dismissible: true,
    },
    {
      id: "toast-3",
      level: "warning",
      message: "Disk space low",
      description: "Less than 10% remaining",
      duration: 4000,
      dismissible: true,
    },
    {
      id: "toast-4",
      level: "error",
      message: "Failed to save",
      description: "Network connection lost",
      duration: 4000,
      dismissible: true,
    },
    {
      id: "toast-5",
      level: "info",
      message: "Task archived",
      action: { label: "Undo", trigger: "z" },
      duration: 4000,
      dismissible: true,
    },
  ]

  function getToast(index: number): Toast {
    const toast = mockToasts[index]
    if (!toast) throw new Error(`mockToasts[${index}] is undefined`)
    return toast
  }

  const demoTermWidth = 100
  const demoTermHeight = 30

  // Create mock UI state with status message
  const uiStateWithStatus: UIState = {
    ...mockUIState,
    status: { level: "info", message: "Move mode active" },
  }

  const mockState = createMockTUIBoardState()

  return (
    <Box flexDirection="column">
      <SectionHeader title="Toast Stack & Status Bar" />

      <SubsectionHeader title="Single Toast - All Levels" />
      <Text dimColor>
        Toasts appear in bottom-right corner with border and black background
      </Text>
      <Text> </Text>

      <ViewBox title="Info Toast">
        <Box width={demoTermWidth} height={10} position="relative">
          <ToastStack
            toasts={[getToast(0)]}
            termWidth={demoTermWidth}
            termHeight={10}
          />
        </Box>
      </ViewBox>

      <ViewBox title="Success Toast">
        <Box width={demoTermWidth} height={10} position="relative">
          <ToastStack
            toasts={[getToast(1)]}
            termWidth={demoTermWidth}
            termHeight={10}
          />
        </Box>
      </ViewBox>

      <ViewBox title="Warning Toast with Description">
        <Box width={demoTermWidth} height={10} position="relative">
          <ToastStack
            toasts={[getToast(2)]}
            termWidth={demoTermWidth}
            termHeight={10}
          />
        </Box>
      </ViewBox>

      <ViewBox title="Error Toast with Description">
        <Box width={demoTermWidth} height={10} position="relative">
          <ToastStack
            toasts={[getToast(3)]}
            termWidth={demoTermWidth}
            termHeight={10}
          />
        </Box>
      </ViewBox>

      <ViewBox title="Toast with Action Button">
        <Box width={demoTermWidth} height={10} position="relative">
          <ToastStack
            toasts={[getToast(4)]}
            termWidth={demoTermWidth}
            termHeight={10}
          />
        </Box>
      </ViewBox>

      <SubsectionHeader title="Stacked Toasts (shadcn/ui pattern)" />
      <Text dimColor>Multiple toasts stack vertically, newest at bottom</Text>
      <Text dimColor>Shows latest 5 toasts maximum</Text>
      <Text> </Text>

      <ViewBox title="3 Stacked Toasts">
        <Box width={demoTermWidth} height={20} position="relative">
          <ToastStack
            toasts={mockToasts.slice(0, 3)}
            termWidth={demoTermWidth}
            termHeight={20}
          />
        </Box>
      </ViewBox>

      <ViewBox title="All 5 Toasts Stacked">
        <Box width={demoTermWidth} height={demoTermHeight} position="relative">
          <ToastStack
            toasts={mockToasts}
            termWidth={demoTermWidth}
            termHeight={demoTermHeight}
          />
        </Box>
      </ViewBox>

      <SubsectionHeader title="Status Bar with Messages" />
      <Text dimColor>
        Bottom bar shows watcher status and optional messages
      </Text>
      <Text> </Text>

      <Text bold>Normal state (no status message):</Text>
      <BottomBar
        ui={mockUIState}
        state={mockState}
        layout={{ colIndex: 0, cardIndex: 0 }}
        termWidth={demoTermWidth}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />
      <Text> </Text>

      <Text bold>With status message:</Text>
      <BottomBar
        ui={uiStateWithStatus}
        state={mockState}
        layout={{ colIndex: 0, cardIndex: 0 }}
        termWidth={demoTermWidth}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />
      <Text> </Text>

      <SubsectionHeader title="Complete Layout: Toasts + Bottom Bar" />
      <Text dimColor>Shows how toasts appear above the bottom bar</Text>
      <Text> </Text>

      <ViewBox title="Full Layout with Toasts">
        <Box
          width={demoTermWidth}
          height={demoTermHeight}
          flexDirection="column"
          position="relative"
        >
          {/* Content area */}
          <Box flexGrow={1} flexShrink={1}>
            <Text dimColor>Board content area...</Text>
          </Box>

          {/* Toast stack in bottom-right */}
          <ToastStack
            toasts={mockToasts.slice(0, 3)}
            termWidth={demoTermWidth}
            termHeight={demoTermHeight}
          />

          {/* Bottom bar at bottom */}
          <BottomBar
            ui={uiStateWithStatus}
            state={mockState}
            layout={{ colIndex: 0, cardIndex: 0 }}
            termWidth={demoTermWidth}
            storageMode="disk"
            nodeCount={42}
            moveMode={false}
          />
        </Box>
      </ViewBox>
    </Box>
  )
}

// ============================================================================
// Main Storybook Component
// ============================================================================

// Create a minimal mock repo for storybook
const mockRepo = createFakeRepo()

function Storybook(): React.ReactElement {
  return (
    <RepoProvider repo={mockRepo}>
      <UIProvider state={mockUIState} dispatch={noopDispatch}>
        <Box flexDirection="column">
          <Layer1RichText />
          <Layer1TagPills />
          <Layer1TaskStyling />
          <Layer1FoldMarkers />
          <Layer2Layout />
          <Layer3Views />
          <Layer3AllViews />
          <VisualLanguageSection />
          <ToastAndStatusSection />

          <SectionHeader title="Summary" />
          <Text>All components rendered successfully.</Text>
          <Text> </Text>
          <Text>To verify TUI components with real data, use:</Text>
          <Text color="cyan"> bun km view @next</Text>
        </Box>
      </UIProvider>
    </RepoProvider>
  )
}

// ============================================================================
// Render and Output
// ============================================================================

// Run rendering (the RepoProvider handles db context now)
const { lastFrame } = render(<Storybook />)
// Clean up output from 500-row buffer:
// 1. Remove trailing whitespace from each line
// 2. Remove trailing blank/ANSI-only lines
const ANSI_REGEX = /\x1b\[[0-9;]*m/g
const rawOutput = lastFrame() ?? ""
const lines = rawOutput.split("\n").map((line) => line.replace(/\s+$/, "")) // trim trailing whitespace
// Find last line with visible content (not just ANSI codes and whitespace)
let lastContentLine = lines.length - 1
while (lastContentLine >= 0) {
  const line = lines[lastContentLine]
  if (line && line.replace(ANSI_REGEX, "").trim() !== "") break
  lastContentLine--
}
const output = lines.slice(0, lastContentLine + 1).join("\n")
console.log(output)
