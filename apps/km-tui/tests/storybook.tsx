#!/usr/bin/env bun
/**
 * TUI Storybook - Visual Component Catalog
 *
 * Renders all TUI components in various states for visual inspection.
 *
 * ## Usage
 *
 *   bun storybook                   # fullscreen (default) — alternate screen
 *   bun storybook --inline          # inline mode — terminal scrolling works
 *   bun storybook --fullscreen-nonalt  # fullscreen positioning, no alt screen
 *
 *   Keyboard: j/k to navigate sections, ↑↓ to scroll content, q to quit
 *
 * ## Storybook Rules
 *
 * 1. **Use BoardCore for view demos** — never reimplement card/column rendering.
 *    Render `BoardCore` with different `ui.viewMode` values.
 *
 * 2. **Production components only** — Layer 1-2 sections use production functions
 *    (InlineText, getStatusIcon, etc.). Layer 3 uses BoardCore.
 *
 * 3. **Follow testing.ts pattern** — `BoardCore` wrapped in `RepoProvider`, with
 *    mock state from `createInitialUIState` + `createGridNavigator`.
 *    See `src/testing.ts:169-194`.
 *
 * 4. **Test all modes** — `bun storybook` (inline), `--fullscreen`, `--fullscreen-nonalt`.
 *
 * 5. **Height handling** — BoardCore receives `dimensions` and handles height
 *    internally. ViewBox just needs enough space for the board.
 */

import React, { useState } from "react"
import {
  render as silverytRender,
  useInput,
  useApp,
  useStdout,
  Box,
  Text,
  createTerm,
  useTerm,
} from "@silvery/ag-react"

import {
  InlineText,
  getStatusIcon,
  getFoldMarker,
  colorize,
  GTD_BOARD_COLORS,
  FOLDED_MARKER,
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
import { DateBadge } from "../src/views/tree-node-helpers.tsx"
import { TreeNode } from "../src/views/TreeNode.tsx"
import { BoardCore, type BoardCoreProps } from "../src/views/Board.tsx"
import { CommandBox } from "../src/views/CommandBox.tsx"
import { ToastStack } from "../src/views/ToastStack.tsx"
import type { KNode, TaskStatus, TaskMarker } from "@km/core"
import type { ColumnView } from "../src/types.ts"

/** Local type for storybook mock board state (TUIBoardState was removed from types.ts) */
interface TUIBoardState {
  rootId: string | null
  rootPath: string | null
  columns: ColumnView[]
  visualMode: boolean
  foldDepths: Map<string, number>
  collapsedColumns: Set<number>
  collapsedNodeIds: Set<string>
  searchQuery: string
  searchMode: boolean
  helpMode: boolean
}
import { TreeRenderProvider, deriveTreeConfig } from "../src/state/ui-context.tsx"
import { StoreContext } from "@silvery/create/create-app"
import { createSignalStore } from "../src/state/signal-store.ts"
import { createSelection } from "@silvery/selection"
import { ReactiveNodeStore, ReactiveNodeStoreProvider } from "../src/state/reactive.ts"
import { createInitialUIState, createInitialPaneUI, type PaneUI } from "../src/state/ui-reducer.ts"
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
  const embedSrc = node.symlink_to
  if (!embedSrc) return null
  const linkedNode = nodeStore.get(embedSrc)
  if (!linkedNode?.parent_id) return null
  const parent = nodeStore.get(linkedNode.parent_id)
  return parent?.content ?? parent?.name ?? null
}

// Get board pills for a task (storybook returns empty - no board context)
function getBoardPillsFromStore(): [] {
  return []
}

// Create a mock UI state for storybook rendering
const mockUIState = createInitialPaneUI("cards", [], { columns: 120, rows: 40 })

// Mock Zustand store satisfying TreeNode's useAppStore/useAppShallow requirements
const mockSel = createSelection({
  tree: { walkOrder: () => [], parent: () => undefined, children: () => [] },
})
const mockZustandStore = createSignalStore(() => ({
  ui: {
    ...mockUIState,
    multiSelected: new Set<string>(),
    inlineEditBlock: null,
  },
  foldDepths: new Map<string, number>(),
  jobRunner: { submit: () => ({ cancel() {} }) },
  setUI: () => {},
  sel: mockSel,
  textEditHints: null,
}))

// Wrap children with all providers TreeNode needs
const storybookNodeStore = new ReactiveNodeStore()
const noopUndoHandle = {
  startBatch: () => {},
  endBatch: () => {},
  setCursor: () => {},
  setCursorAfter: () => {},
  undo: () => ({ success: false }),
  redo: () => ({ success: false }),
  canUndo: () => false,
  canRedo: () => false,
}

export function StorybookProviders({ children }: { children: React.ReactNode }): React.ReactElement {
  const treeConfig = deriveTreeConfig(mockUIState.viewMode, mockUIState.maxContentLines, mockUIState)
  return (
    <StoreContext.Provider value={mockZustandStore as import("@silvery/create/signal-store").StoreApi<unknown>}>
      <ReactiveNodeStoreProvider value={storybookNodeStore}>
        <TreeRenderProvider
          treeConfig={treeConfig}
          setUI={() => {}}
          sel={
            {
              text: Object.assign(() => null, { edit() {}, select() {}, deselect() {} }),
              node: {
                cursor: () => null,
                anchor: () => null,
                ids: () => Object.assign([] as any, { has: () => false }),
                select() {},
                extend() {},
                collapse() {},
                remove() {},
              },
            } as any
          }
          rootBoardId={null}
          jobRunner={{ submit: () => ({ cancel() {} }) } as any}
          undoHandle={noopUndoHandle as any}
          taskStatusFilter={new Set<string>()}
          boardFocused={true}
        >
          {children}
        </TreeRenderProvider>
      </ReactiveNodeStoreProvider>
    </StoreContext.Provider>
  )
}

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
    <>
      <SectionHeader title="Layer 1: Rich Text Rendering" />

      <SubsectionHeader title="InlineText - Inline Field Stripping" />
      {examples.inlineFields.map((ex, i) => (
        <Box key={i} flexDirection="column">
          <Text>
            <Text dimColor>input: </Text>
            {ex.input}
          </Text>
          <Text>
            <Text dimColor>output: </Text>
            <InlineText text={ex.input} />
          </Text>
          <Text> </Text>
        </Box>
      ))}

      <SubsectionHeader title="InlineText - Wiki Link Styling" />
      {examples.wikiLinks.map((ex, i) => (
        <Box key={i} flexDirection="column">
          <Text>
            <Text dimColor>input: </Text>
            {ex.input}
          </Text>
          <Text>
            <Text dimColor>output: </Text>
            <InlineText text={ex.input} />
          </Text>
          <Text> </Text>
        </Box>
      ))}

      <SubsectionHeader title="InlineText - Markdown Formatting" />
      {examples.markdown.map((ex, i) => (
        <Box key={i} flexDirection="column">
          <Text>
            <Text dimColor>input: </Text>
            {ex.input}
          </Text>
          <Text>
            <Text dimColor>output: </Text>
            <InlineText text={ex.input} />
          </Text>
          <Text> </Text>
        </Box>
      ))}

      <SubsectionHeader title="displayLength() vs string.length" />
      <DisplayLengthDemo />
    </>
  )
}

// Demo component for displayLength - uses useTerm() for styling
function DisplayLengthDemo(): React.ReactElement {
  const term = useTerm()
  const style = term
  return (
    <>
      <Text>
        Styled text: {style.bold.red("Hello")} {style.blue("World")}
      </Text>
      <Text>string.length: 40</Text>
      <Text>displayLength(): 11</Text>
    </>
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
    <>
      <SectionHeader title="Layer 1: Tag Pills" />

      <SubsectionHeader title="Preset Tag Colors" />
      <Text dimColor> Tag Name Color Pill Example</Text>
      <Text dimColor> ────────── ────── ─────────────────────</Text>
      {presetTags.map(({ name, desc }) => {
        const color = GTD_BOARD_COLORS[name] || "white"
        return (
          <Text key={name}>
            {" "}
            {name.padEnd(10)} {color.padEnd(6)} {colorize(`@${name}`, color)} <Text dimColor>← {desc}</Text>
          </Text>
        )
      })}
      <Text> </Text>

      <SubsectionHeader title="Custom Tag Colors (via km.color:: attribute)" />
      <Text dimColor> Custom colors override presets using km.color:: value in headings</Text>
      <Text dimColor> Example: ## Sprint km.color:: magenta</Text>
      <Text> </Text>
      {customTags.map(({ name, color }) => (
        <Text key={name}>
          {" "}
          {colorize(`@${name}`, color)} <Text dimColor>← km.color:: {color}</Text>
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
        ○ Task with multiple tags {colorize("@next", "cyan")} {colorize("@waiting", "yellow")}{" "}
        {colorize("@Sprint", "magenta")}
      </Text>
    </>
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
  const getMarkerColor = (status?: string): "green" | "yellow" | "red" | undefined => {
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
    <>
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
      <Text> </Text>

      <SubsectionHeader title="Date Badges (formatDateBadge)" />
      <Text dimColor> Right-aligned badge: priority, start → due, recurrence</Text>
      <Text dimColor> Format: P2 Mar 10 → Mar 15 ↻ (each part optional)</Text>
      <Text> </Text>
      <DateBadgeDemo />
    </>
  )
}

function DateBadgeDemo(): React.ReactElement {
  const now = Date.now()
  const day = 86400000

  const d = (offset: number) => {
    const date = new Date(now + offset * day)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${dd}`
  }

  const examples: { label: string; node: KNode }[] = [
    // Due date relative formatting + urgency coloring
    { label: "Overdue (3 days ago)", node: { due_at: d(-3) } as KNode },
    { label: "Overdue (yesterday)", node: { due_at: d(-1) } as KNode },
    { label: "Due today", node: { due_at: d(0) } as KNode },
    { label: "Due tomorrow", node: { due_at: d(1) } as KNode },
    { label: "Due in 2 days", node: { due_at: d(2) } as KNode },
    { label: "Due in 4 days", node: { due_at: d(4) } as KNode },
    { label: "Due in 6 days", node: { due_at: d(6) } as KNode },
    { label: "Due in 10 days", node: { due_at: d(10) } as KNode },

    // With priority
    { label: "P1 overdue", node: { priority: "P1", due_at: d(-3) } as KNode },
    { label: "P2 due today", node: { priority: "P2", due_at: d(0) } as KNode },

    // With recurrence
    { label: "Due tomorrow ↻", node: { due_at: d(1), rrule: "weekly" } as KNode },
    { label: "Future ↻", node: { due_at: d(14), rrule: "monthly" } as KNode },

    // Start date
    { label: "Start only (future)", node: { start_at: d(3) } as KNode },
    { label: "Start → due", node: { start_at: d(2), due_at: d(7) } as KNode },
    {
      label: "Start past, WIP (hidden)",
      node: { start_at: d(-5), due_at: d(3), item: { task: { status: "wip", marker: "[/]" } } } as KNode,
    },
    {
      label: "Start past, todo (shown)",
      node: { start_at: d(-5), due_at: d(3), item: { task: { status: "todo", marker: "[ ]" } } } as KNode,
    },

    // Full combo
    {
      label: "P2 start → due ↻",
      node: { priority: "P2", start_at: d(1), due_at: d(7), rrule: "monthly" } as KNode,
    },

    // Edge cases
    { label: "P4 only (dim)", node: { priority: "P4" } as KNode },
    { label: "No metadata", node: {} as KNode },
  ]

  return (
    <>
      <Text dimColor> {"Description".padEnd(34)} Badge Output</Text>
      <Text dimColor>
        {" "}
        {"─".repeat(34)} {"─".repeat(30)}
      </Text>
      {examples.map(({ label, node }, i) => (
        <Text key={i}>
          {" "}
          {label.padEnd(34)} <DateBadge node={node} />{" "}
          {!node.due_at && !node.start_at && !node.priority && !node.rrule && <Text dimColor>(empty)</Text>}
        </Text>
      ))}
    </>
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
    <>
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
        <Text color={FOLDED_MARKER.color}>{FOLDED_MARKER.char}</Text> FOLDED_MARKER (▸ U+25B8) - small right-pointing
        triangle
      </Text>
      <Text>
        {" "}
        <Text color={"white"}>{"•"}</Text> UNFOLDED_MARKER (• U+2022) - medium bullet
      </Text>
      <Text>
        {" "}
        <Text color={"gray"}>{"·"}</Text> EMPTY_MARKER (· U+00B7) - tiny dot
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
            <Text color={folded.color}>{folded.char}</Text> <Text color={unfolded.color}>{unfolded.char}</Text>{" "}
            <Text color={empty.color}>{empty.char}</Text>
            {"  "}
            <Text dimColor>km.color:: {color}</Text>
          </Text>
        )
      })}
      <Text> </Text>

      <SubsectionHeader title="Combined: Fold Marker + Task Status" />
      <Text dimColor> New cards style: marker indicates fold, status in title</Text>
      <Text> </Text>
      <Text>
        {" "}
        <Text>{FOLDED_MARKER.char}</Text> <Text color="gray">▢</Text> Folded todo task (5)
      </Text>
      <Text>
        {" "}
        <Text>{"•"}</Text> <Text color="yellow">◧</Text> Unfolded WIP task
      </Text>
      <Text>
        {" "}
        <Text color="gray">{"·"}</Text> <Text color="green">▣</Text> Leaf done task
      </Text>
      <Text>
        {" "}
        <Text color="gray">{"·"}</Text> Regular note (no status)
      </Text>
    </>
  )
}

// ============================================================================
// Layer 2: Layout Functions Component
// ============================================================================

function Layer2Layout(): React.ReactElement {
  const longText = "This is a longer text that needs to be wrapped at a certain width to fit in a column"
  const truncText = "This is text that might be truncated"

  return (
    <>
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
      {constrainText("This is a longer piece of text that needs both wrapping and line limiting", 25, 2).lines.map(
        (line, i) => (
          <Text key={i}> |{line}|</Text>
        ),
      )}
      <Text> truncated: true</Text>
      <Text> </Text>

      <SubsectionHeader title="renderPath() - Breadcrumb Truncation" />
      <RenderPathDemo />
      <Text> </Text>

      <SubsectionHeader title="renderParentPath() - Separate Line Context" />
      <Text dimColor>Input: "Projects/Work/Tasks/Subtask" (len=27)</Text>
      <Text> </Text>
      <Text dimColor>Width=30: |{renderParentPath("Projects/Work/Tasks/Subtask", 30)}|</Text>
      <Text dimColor>Width=25: |{renderParentPath("Projects/Work/Tasks/Subtask", 25)}|</Text>
      <Text dimColor>Width=20: |{renderParentPath("Projects/Work/Tasks/Subtask", 20)}|</Text>
    </>
  )
}

const pathDemoSegments: PathSegment[] = [
  {
    id: "proj-1",
    name: "Projects",
    sep: "/",
    isWithinBoard: false,
    node: null,
  },
  { id: "work-1", name: "Work", sep: "/", isWithinBoard: false, node: null },
  { id: "q1-2024", name: "Q1-2024", sep: ">", isWithinBoard: true, node: null },
  {
    id: "sprint-1",
    name: "Sprint 1",
    sep: ">",
    isWithinBoard: true,
    node: null,
  },
  { id: "tasks-1", name: "Tasks", sep: "", isWithinBoard: true, node: null },
]

function segsToStr(segs: PathSegment[]): string {
  return segs.map((s) => s.name + (s.sep ? ` ${s.sep} ` : "")).join("")
}

function RenderPathDemo(): React.ReactElement {
  return (
    <>
      <Text dimColor>Full path (length=44):</Text>
      <Text> |{segsToStr(renderPath(pathDemoSegments, 60))}|</Text>
      <Text> </Text>
      {[60, 40, 25].map((w) => (
        <Text key={w} dimColor>
          Width={w}: |{segsToStr(renderPath(pathDemoSegments, w))}|
        </Text>
      ))}
    </>
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
  type: string = "p",
  options?: {
    parentId?: string
    linkTo?: string
    linkAlias?: string
    due_at?: string
    start_at?: string
    priority?: string
    rrule?: string
    fstype?: KNode["fstype"]
  },
): KNode {
  const node: KNode = {
    id,
    type: type as KNode["type"],
    ...(type === "h" && options?.fstype ? { fstype: options.fstype } : {}),
    ...(type === "p" ? { list_marker: "-" as const } : {}),
    ...(type === "h" || type === "p" ? { item: {} } : {}),
    parent_id: options?.parentId ?? null,
    parent_idx: 0,
    symlink_to: options?.linkTo ?? null,
    name: options?.linkAlias,
    content,
    ...(status
      ? {
          item: {
            task: {
              status: status as TaskStatus,
              marker: (status === "done"
                ? "[x]"
                : status === "wip"
                  ? "[/]"
                  : status === "blocked"
                    ? "[!]"
                    : status === "dropped"
                      ? "[-]"
                      : "[ ]") as TaskMarker,
            },
          },
        }
      : {}),
    due_at: options?.due_at,
    start_at: options?.start_at,
    priority: options?.priority,
    rrule: options?.rrule,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "1",
  }

  // Register in the in-memory store so getChildrenFromStore() works
  registerNode(node)

  return node
}

// Shared TreeNode props for storybook demos (DI uses in-memory store)
const treeNodeDIProps = {
  depth: 0,
  colIndex: 0,
  cardIndex: 0,
  dimInactiveChildren: false,
  getChildren: getChildrenFromStore,
  getParentContext: getParentContextFromStore,
  getBoardPills: getBoardPillsFromStore,
}

/** Width-constrained TreeNode wrapper for storybook demos */
function DemoTreeNode({
  maxWidth = 40,
  ...props
}: { maxWidth?: number } & React.ComponentProps<typeof TreeNode>): React.ReactElement {
  return (
    <Box width={maxWidth}>
      <TreeNode {...props} />
    </Box>
  )
}

function Layer3Views(): React.ReactElement {
  // Create sample nodes for TreeNode rendering
  const todoTask = mockNode("todo-1", "Setup CI pipeline", "todo")
  const wipTask = mockNode("wip-1", "Review PR #42", "wip")
  const doneTask = mockNode("done-1", "Implement auth", "done")
  const blockedTask = mockNode("blocked-1", "Wait on API", "blocked")
  const droppedTask = mockNode("dropped-1", "Old approach", "dropped")
  const commonProps = treeNodeDIProps

  // Tasks with date badges
  const overdueTask = mockNode("dated-1", "Overdue payment", "todo", "p", {
    priority: "P1",
    due_at: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
  })
  const dueTodayTask = mockNode("dated-2", "Submit report", "wip", "p", {
    priority: "P2",
    due_at: `${new Date().toISOString().slice(0, 10)}T17:00`,
  })
  const dueWeekTask = mockNode("dated-3", "Review design docs", "todo", "p", {
    due_at: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
  })
  const recurringTask = mockNode("dated-4", "Weekly standup", "todo", "p", {
    due_at: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    rrule: "weekly",
  })
  const fullBadgeTask = mockNode("dated-5", "Launch feature", "wip", "p", {
    priority: "P2",
    start_at: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    rrule: "monthly",
  })

  return (
    <>
      <SectionHeader title="Layer 3: TreeNode Component" />

      <SubsectionHeader title="TreeNode - Different Task States" />
      <Text dimColor>Each node rendered at width=40:</Text>
      <Text> </Text>

      <Text bold>Todo (open):</Text>
      <DemoTreeNode {...commonProps} node={todoTask} isSelected={false} />

      <Text bold>WIP (in progress):</Text>
      <DemoTreeNode {...commonProps} node={wipTask} isSelected={false} />

      <Text bold>Blocked:</Text>
      <DemoTreeNode {...commonProps} node={blockedTask} isSelected={false} />

      <Text bold>Done (dim):</Text>
      <DemoTreeNode {...commonProps} node={doneTask} isSelected={false} />

      <Text bold>Dropped (dim):</Text>
      <DemoTreeNode {...commonProps} node={droppedTask} isSelected={false} />

      <Text> </Text>
      <SubsectionHeader title="TreeNode - Date Badges (right-aligned)" />
      <Text dimColor>Priority, recurrence, scheduled/due dates shown after title:</Text>
      <Text> </Text>

      <Text bold>P1 Overdue (red curly underline):</Text>
      <DemoTreeNode {...commonProps} node={overdueTask} isSelected={false} />

      <Text bold>P2 Due today (orange curly underline):</Text>
      <DemoTreeNode {...commonProps} node={dueTodayTask} isSelected={false} />

      <Text bold>Due this week (yellow underline):</Text>
      <DemoTreeNode {...commonProps} node={dueWeekTask} isSelected={false} />

      <Text bold>Recurring + future due:</Text>
      <DemoTreeNode {...commonProps} node={recurringTask} isSelected={false} />

      <Text bold>Full badge (P2 + recurrence + scheduled + due):</Text>
      <DemoTreeNode {...commonProps} node={fullBadgeTask} isSelected={false} />

      <Text> </Text>
      <SubsectionHeader title="TreeNode - Selection States" />

      <Text bold>Normal (not selected):</Text>
      <DemoTreeNode {...commonProps} node={todoTask} isSelected={false} />

      <Text bold>Selected (yellow background):</Text>
      <DemoTreeNode {...commonProps} node={todoTask} isSelected={true} />

      <Text bold>Selected with date badge:</Text>
      <DemoTreeNode {...commonProps} node={overdueTask} isSelected={true} />
    </>
  )
}

// ============================================================================
// Layer 3: All Four View Modes
// ============================================================================

// Helper to create a card KNode and register its children.
// Children are created with proper parent_id for getChildren() to work.
// Cards are CardView (KNode + resolved embed data).
function mockCard(node: KNode, childDefs: Array<{ content: string; status?: string }> = []): KNode {
  // Register children so getChildrenFromStore() works
  childDefs.forEach((def, i) =>
    mockNode(`${node.id}-child-${i}`, def.content, def.status, "p", {
      parentId: node.id,
    }),
  )
  return node
}

/** Create individual body content card KNodes (p, code, table, quote — each navigable) */
function mockBodyCards(id: string, bodyDefs: Array<{ type: string; content: string }>): KNode[] {
  return bodyDefs.map((def, i) => {
    const bNode: KNode = {
      id: `${id}-body-${i}`,
      type: def.type as KNode["type"],
      parent_id: id,
      parent_idx: i,
      symlink_to: null,
      content: def.content,
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "1",
    }
    registerNode(bNode)
    return bNode
  })
}

// Helper to create mock ColumnView
function mockColumn(name: string, cardNodes: KNode[]): ColumnView {
  return {
    node: mockNode(`col-${name}`, name, undefined, "h", { fstype: "mdsection" }),
    cardNodes: cardNodes.map((c) => ({
      ...c,
      __cardView: true as const,
      isBody: false,
      isBrokenEmbed: false,
      hasBodyChildren: false,
    })),
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
  mockNode("source-file-api", "projects/api.md", undefined, "h", { fstype: "mdfile" })
  mockNode("source-file-design", "projects/design.md", undefined, "h", { fstype: "mdfile" })
  mockNode("source-file-infra", "projects/infra.md", undefined, "h", { fstype: "mdfile" })

  // Section level (parent - THIS is shown in context as "{section name}")
  mockNode("source-api", "API Integration Project", undefined, "h", {
    fstype: "mdsection",
    parentId: "source-file-api",
  })
  mockNode("source-design", "Design System Work", undefined, "h", {
    fstype: "mdsection",
    parentId: "source-file-design",
  })
  mockNode("source-infra", "Infrastructure Tasks", undefined, "h", {
    fstype: "mdsection",
    parentId: "source-file-infra",
  })

  // Original tasks (these are what we link TO from the board)
  // The embedded tasks in the board will link to these, and show their parent (section) as context
  mockNode("orig-api-endpoints", "Implement REST endpoints", "wip", "p", {
    parentId: "source-api",
  })
  mockNode("orig-design-buttons", "Create button components", "todo", "p", {
    parentId: "source-design",
  })
  mockNode("orig-infra-cicd", "Setup CI/CD pipeline", "done", "p", {
    parentId: "source-infra",
  })
  mockNode("orig-infra-db", "Database migrations", "wip", "p", {
    parentId: "source-infra",
  })
  mockNode("orig-infra-logging", "Configure logging", "done", "p", {
    parentId: "source-infra",
  })
  mockNode("orig-api-review", "Review PR #42", "todo", "p", {
    parentId: "source-api",
  })

  // Column 1 - Active Tasks with CHILDREN (shows inactive children dimming)
  // When this column is NOT selected, children at depth > 0 are dimmed
  const activeCards: KNode[] = [
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
  // These tasks have symlink_to set, pointing to ORIGINAL tasks in other files
  // The parent context shows the PARENT of the original task (the section)
  const embeddedCards: KNode[] = [
    // Embedded task from API project - shows "API Integration Project"
    mockCard(
      mockNode("emb1", "Implement REST endpoints", "wip", "p", {
        linkTo: "orig-api-endpoints", // Links to original task, shows its parent section
      }),
    ),
    // Embedded task from Design System - shows "Design System Work"
    mockCard(
      mockNode("emb2", "Create button components", "todo", "p", {
        linkTo: "orig-design-buttons",
      }),
    ),
    // Embedded task from Infrastructure - shows "Infrastructure Tasks"
    mockCard(
      mockNode("emb3", "Setup CI/CD pipeline", "done", "p", {
        linkTo: "orig-infra-cicd",
      }),
    ),
    // Embedded task with children AND parent context
    mockCard(
      mockNode("emb4", "Database migrations", "wip", "p", {
        linkTo: "orig-infra-db",
      }),
      [
        { content: "Create schema", status: "done" },
        { content: "Write seed data", status: "wip" },
      ],
    ),
    // Another embedded with alias
    mockCard(
      mockNode("emb5", "Review PR #42", "todo", "p", {
        linkTo: "orig-api-review",
        linkAlias: "API Review",
      }),
    ),
  ]

  // Column 3 - Completed (done/dropped = ALL dimmed)
  const completedCards: KNode[] = [
    mockCard(mockNode("cmp1", "Setup project structure", "done")),
    mockCard(mockNode("cmp2", "Create initial tests", "done"), [
      { content: "Unit tests for `utils.ts`", status: "done" },
      { content: "Integration tests", status: "done" },
    ]),
    mockCard(mockNode("cmp3", "Old migration script", "dropped")),
    // Embedded + done = dimmed with parent context
    mockCard(
      mockNode("cmp4", "Configure logging", "done", "p", {
        linkTo: "orig-infra-logging",
      }),
    ),
  ]

  // Column 4 - Rich Text formatting showcase
  const formattingCards: KNode[] = [
    mockCard(mockNode("fmt1", "Task with **bold** text", "todo")),
    mockCard(mockNode("fmt2", "Task with *italic* text", "todo")),
    mockCard(mockNode("fmt3", "Task with `inline code`", "todo")),
    mockCard(mockNode("fmt4", "Task with [[wiki link]]", "todo")),
    mockCard(mockNode("fmt5", "~~Strikethrough~~ in markdown", "todo")),
    mockCard(mockNode("fmt6", "**Bold** and *italic* and `code` together", "wip")),
  ]

  // Column 5 - Markdown body content (p, code, table, quote, etc.)
  const markdownCards: KNode[] = [
    // Paragraph body cards
    ...mockBodyCards("md-p", [
      { type: "p", content: "This is a paragraph with **bold** and *italic* text." },
      { type: "p", content: "Second paragraph below the first, separated naturally." },
    ]),
    // Code block body card
    ...mockBodyCards("md-code", [
      {
        type: "code",
        content: 'const greeting = "Hello, world!"\nfunction add(a: number, b: number): number {\n  return a + b\n}',
      },
    ]),
    // Table body card (pipe-delimited markdown)
    ...mockBodyCards("md-table", [
      {
        type: "table",
        content:
          "| Name    | Role      | Status |\n| ------- | --------- | ------ |\n| Alice   | Engineer  | Active |\n| Bob     | Designer  | Away   |\n| Charlie | PM        | Active |",
      },
    ]),
    // Blockquote body card
    ...mockBodyCards("md-quote", [
      { type: "quote", content: "The best way to predict the future is to invent it. — Alan Kay" },
    ]),
    // Mixed body content cards
    ...mockBodyCards("md-mixed", [
      { type: "p", content: "A project description with **key points**:" },
      { type: "code", content: "npm install && npm run build" },
      { type: "table", content: "| Metric | Value |\n| ------ | ----- |\n| Users  | 1.2k  |\n| DAU    | 340   |" },
      { type: "quote", content: "Ship early, ship often." },
    ]),
  ]

  // Note: colIndex/cardIndex are now flat props, not in TUIBoardState
  return {
    rootId: "board-root",
    rootPath: "/Projects/webapp",
    columns: [
      mockColumn("Active", activeCards),
      mockColumn("Embedded", embeddedCards), // Shows parent context
      mockColumn("Completed", completedCards),
      mockColumn("Formatting", formattingCards),
      mockColumn("Markdown", markdownCards), // Shows body content types
    ],
    visualMode: false,
    foldDepths: new Map<string, number>(),
    collapsedColumns: new Set<number>(),
    collapsedNodeIds: new Set<string>(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
  }
}

// Max width for storybook content areas (consistent across all sections).
// Inner content is this minus border (2) and paddingX (2) = STORYBOOK_MAX_WIDTH - 4.
const STORYBOOK_MAX_WIDTH = 80

// Wrapper component with border and title
// height prop is used for BoardCore renders — set to dimensions.rows so BoardCore has space
function ViewBox({
  title,
  children,
  height,
}: {
  title: string
  children: React.ReactNode
  height?: number
}): React.ReactElement {
  // ViewBox overhead: border (2 rows top/bottom) + title (1 row) + marginTop (1 row) = 4 rows
  const outerHeight = height ? height + 4 : undefined
  return (
    <Box
      flexDirection="column"
      maxWidth={STORYBOOK_MAX_WIDTH}
      height={outerHeight}
      borderStyle="double"
      borderColor="magenta"
      marginY={1}
      paddingX={1}
    >
      <Text bold color="magenta">
        {title}
      </Text>
      <Box marginTop={1} flexDirection="column" flexGrow={height ? 1 : undefined}>
        {children}
      </Box>
    </Box>
  )
}

// Helper to create BoardCore props for a given view mode
function makeBoardCoreProps(
  state: TUIBoardState,
  viewMode: "cards" | "columns" | "tabs" | "list",
  colIndex: number,
  cardIndex: number,
  dims: { columns: number; rows: number },
  cursorDepth: "board" | "column" | "card" = "card",
): BoardCoreProps {
  const ui = createInitialPaneUI(viewMode, [], dims)

  return {
    rootId: state.rootId,
    columns: state.columns,
    colIndex,
    cardIndex,
    ui,
    cursorDepth,
    dimensions: dims,
    collapsedNodes: new Set<string>(),
    hasDetailPane: false,
  }
}

// Lazy singleton — populated once, reused across sections
let _mockBoardState: TUIBoardState | undefined
function getMockBoardState(): TUIBoardState {
  return (_mockBoardState ??= createMockTUIBoardState())
}

// Create a fake repo populated with all nodes from the nodeStore.
// Must be called AFTER getMockBoardState() populates nodeStore.
function createPopulatedRepo() {
  return createFakeRepo({ nodes: [...nodeStore.values()] })
}

function Layer3AllViews(): React.ReactElement {
  const mockState = getMockBoardState()
  const populatedRepo = createPopulatedRepo()

  // BoardCore receives dimensions and handles all internal layout.
  // Dimensions must match ViewBox inner content area.
  // ViewBox maxWidth=STORYBOOK_MAX_WIDTH, border=2+2, paddingX=1+1 → inner=STORYBOOK_MAX_WIDTH-6
  const viewCols = STORYBOOK_MAX_WIDTH - 6
  const viewRows = 20

  return (
    <RepoProvider repo={populatedRepo}>
      <StorybookProviders>
        <>
          <SectionHeader title="Layer 3: All View Modes (via BoardCore)" />
          <Text dimColor>Each view renders the same TUIBoardState via BoardCore:</Text>
          <Text dimColor>• Fold markers: ● folded, • unfolded, · empty (size variation)</Text>
          <Text dimColor>• Task status: ▢ todo, ◧ wip, ■ blocked, ▣ done (square style)</Text>
          <Text dimColor>• Rich text: **bold**, *italic*, `code`, ~~strike~~, [[links]]</Text>
          <Text dimColor>• Inactive children: dimmed when card not selected</Text>
          <Text dimColor>• Embedded tasks: show parent context prefix</Text>
          <Text dimColor>• Selection levels: column → card → outline (sub-items)</Text>

          <ViewBox title="View 1: Cards (card level - first card selected)" height={viewRows}>
            <BoardCore
              {...makeBoardCoreProps(mockState, "cards", 0, 0, {
                columns: viewCols,
                rows: viewRows,
              })}
            />
          </ViewBox>

          <ViewBox title="View 2: Columns (column level - 'Embedded' column selected)" height={viewRows}>
            <BoardCore
              {...makeBoardCoreProps(mockState, "columns", 1, 0, { columns: viewCols, rows: viewRows }, "column")}
            />
          </ViewBox>

          <ViewBox title="View 3: Tabs (card level - shows Active column)" height={viewRows}>
            <BoardCore
              {...makeBoardCoreProps(mockState, "tabs", 0, 0, {
                columns: viewCols,
                rows: viewRows,
              })}
            />
          </ViewBox>

          <ViewBox title="View 4: List (card level - 'Completed' column, 2nd card)" height={viewRows}>
            <BoardCore
              {...makeBoardCoreProps(mockState, "list", 2, 1, {
                columns: viewCols,
                rows: viewRows,
              })}
            />
          </ViewBox>
        </>
      </StorybookProviders>
    </RepoProvider>
  )
}

// ============================================================================
// Visual Language Section - Design System Reference
// ============================================================================

function VisualLanguageSection(): React.ReactElement {
  const todoTask = mockNode("vl-1", "Example task content", "todo")
  const wipTask = mockNode("vl-2", "Work in progress task", "wip")
  const doneTask = mockNode("vl-3", "Completed task item", "done")

  const commonProps = treeNodeDIProps

  return (
    <>
      <SectionHeader title="Visual Language - Design System" />
      <Text dimColor>Reference: specs/km-design-system.md</Text>
      <Text> </Text>

      <SubsectionHeader title="Selection States (RESERVED COLOR)" />
      <Text dimColor> Yellow bg = selection (cursor, focused, multi-select)</Text>
      <Text> </Text>

      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" width={38}>
          <Text bold>Normal (no selection):</Text>
          <DemoTreeNode {...commonProps} node={todoTask} isSelected={false} />
        </Box>
        <Box flexDirection="column" width={38}>
          <Text bold color="yellow">
            Selected (yellow bg):
          </Text>
          <DemoTreeNode {...commonProps} node={todoTask} isSelected={true} />
        </Box>
      </Box>
      <Text> </Text>

      <SubsectionHeader title="Card Border States (Cards View)" />
      <Text dimColor> Three visual states via card border color:</Text>
      <Text> </Text>

      <Box flexDirection="row" gap={1}>
        <Box flexDirection="column" width={28} borderStyle="round" borderColor="blackBright">
          <Text> · Normal card</Text>
        </Box>
        <Box flexDirection="column" width={28} borderStyle="round" borderColor="yellow">
          <Text backgroundColor="yellow" color="black">
            {" "}
            · Selected card
          </Text>
        </Box>
        <Box flexDirection="column" width={28} borderStyle="round" borderColor="cyan">
          <Text>
            {" "}
            · Editing ca<Text inverse>r</Text>d
          </Text>
        </Box>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Box width={28}>
          <Text dimColor> gray border</Text>
        </Box>
        <Box width={28}>
          <Text dimColor> yellow border + bg</Text>
        </Box>
        <Box width={28}>
          <Text dimColor> cyan border + cursor</Text>
        </Box>
      </Box>
      <Text> </Text>

      <SubsectionHeader title="Panel Focus States" />
      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" width={30} borderStyle="round" borderColor="cyanBright" paddingX={1}>
          <Text bold color="yellow">
            Active Panel
          </Text>
          <Text dimColor>borderColor: cyanBright</Text>
          <Text dimColor>header: yellow + bold</Text>
        </Box>
        <Box flexDirection="column" width={30} borderStyle="round" borderColor="blackBright" paddingX={1}>
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
          <DemoTreeNode {...commonProps} node={todoTask} isSelected={false} />
          <DemoTreeNode {...commonProps} node={wipTask} isSelected={false} />
        </Box>
        <Box flexDirection="column" width={38}>
          <Text bold>Terminal states (dim only):</Text>
          <DemoTreeNode {...commonProps} node={doneTask} isSelected={false} />
          <DemoTreeNode {...commonProps} node={mockNode("vl-4", "Dropped task item", "dropped")} isSelected={false} />
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

      <SubsectionHeader title="Date Badges (right-aligned on cards)" />
      <Text dimColor> Priority, recurrence, scheduled/due dates shown right-aligned</Text>
      <Text dimColor> Uses 24-bit RGB underlines for due date urgency</Text>
      <Text> </Text>

      <Text bold>Overdue task (red curly underline):</Text>
      <TreeNode
        {...commonProps}
        node={mockNode("db-1", "Overdue payment", "todo", "p", {
          priority: "P1",
          due_at: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
        })}
        isSelected={false}
      />
      <Text> </Text>

      <Text bold>Due today (orange curly underline):</Text>
      <TreeNode
        {...commonProps}
        node={mockNode("db-2", "Submit report", "wip", "p", {
          priority: "P2",
          due_at: `${new Date().toISOString().slice(0, 10)}T17:00`,
        })}
        isSelected={false}
      />
      <Text> </Text>

      <Text bold>Due this week (yellow single underline):</Text>
      <TreeNode
        {...commonProps}
        node={mockNode("db-3", "Review design docs", "todo", "p", {
          due_at: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
        })}
        isSelected={false}
      />
      <Text> </Text>

      <Text bold>Future date (no underline) + recurrence:</Text>
      <TreeNode
        {...commonProps}
        node={mockNode("db-4", "Weekly standup", "todo", "p", {
          due_at: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          rrule: "weekly",
        })}
        isSelected={false}
      />
      <Text> </Text>

      <Text bold>Scheduled + due + priority:</Text>
      <TreeNode
        {...commonProps}
        node={mockNode("db-5", "Launch feature", "wip", "p", {
          priority: "P2",
          start_at: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
          due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          rrule: "monthly",
        })}
        isSelected={false}
      />
      <Text> </Text>

      <Text bold>P4 backlog item (dim priority):</Text>
      <TreeNode
        {...commonProps}
        node={mockNode("db-6", "Nice to have feature", "todo", "p", {
          priority: "P4",
        })}
        isSelected={false}
      />
    </>
  )
}

// ============================================================================
// Toast & Status Bar Section
// ============================================================================

function ToastAndStatusSection(): React.ReactElement {
  // Mock toasts matching actual app usage (board-effects.ts, board-actions.ts)
  const mockToasts: Toast[] = [
    // Most common: file sync success (board-effects.ts:119)
    {
      id: "toast-1",
      level: "success",
      message: "Synced 5 files",
      duration: 2000,
      dismissible: true,
    },
    // Info toast from command box (CommandBox.tsx)
    {
      id: "toast-2",
      level: "info",
      message: "12 log messages — press ` to see",
      duration: 4000,
      dismissible: true,
    },
    // Error with description: parse error (board-effects.ts:144)
    {
      id: "toast-3",
      level: "error",
      message: "Parse error in notes/todo.md:42",
      description: "Unexpected token at column 8",
      duration: 4000,
      dismissible: true,
    },
    // Warning with description: validation (board-effects.ts:160)
    {
      id: "toast-4",
      level: "warning",
      message: "Validation warning",
      description: "Duplicate heading in projects/api.md",
      duration: 4000,
      dismissible: true,
    },
    // Error from open command (board-actions.ts:627)
    {
      id: "toast-5",
      level: "error",
      message: "Failed to open: ENOENT",
      duration: 4000,
      dismissible: true,
    },
  ]

  function getToast(index: number): Toast {
    const toast = mockToasts[index]
    if (!toast) throw new Error(`mockToasts[${index}] is undefined`)
    return toast
  }

  const demoTermWidth = STORYBOOK_MAX_WIDTH - 4 // inner content width
  const demoTermHeight = 30

  // Create mock UI state with status message
  const uiStateWithStatus: PaneUI = {
    ...mockUIState,
    status: { level: "info", message: "Move mode active" },
  }

  return (
    <>
      <SectionHeader title="Toast Stack & Status Bar" />

      <SubsectionHeader title="Single Toast - All Levels" />
      <Text dimColor>Toasts appear in bottom-right corner with border and black background</Text>
      <Text> </Text>

      {[
        { title: "Success: File Sync", idx: 0 },
        { title: "Info: Log Messages", idx: 1 },
        { title: "Error with Description: Parse Error", idx: 2 },
        { title: "Warning with Description: Validation", idx: 3 },
        { title: "Error: Open Failed", idx: 4 },
      ].map(({ title, idx }) => (
        <ViewBox key={idx} title={title}>
          <Box width={demoTermWidth} height={10} position="relative">
            <ToastStack toasts={[getToast(idx)]} termWidth={demoTermWidth} termHeight={10} />
          </Box>
        </ViewBox>
      ))}

      <SubsectionHeader title="Stacked Toasts (shadcn/ui pattern)" />
      <Text dimColor>Multiple toasts stack vertically, newest at bottom</Text>
      <Text dimColor>Shows latest 5 toasts maximum</Text>
      <Text> </Text>

      <ViewBox title="3 Stacked Toasts">
        <Box width={demoTermWidth} height={20} position="relative">
          <ToastStack toasts={mockToasts.slice(0, 3)} termWidth={demoTermWidth} termHeight={20} />
        </Box>
      </ViewBox>

      <ViewBox title="All 5 Toasts Stacked">
        <Box width={demoTermWidth} height={demoTermHeight} position="relative">
          <ToastStack toasts={mockToasts} termWidth={demoTermWidth} termHeight={demoTermHeight} />
        </Box>
      </ViewBox>

      <SubsectionHeader title="Status Bar with Messages" />
      <Text dimColor>Bottom bar shows watcher status and optional messages</Text>
      <Text> </Text>

      <Text bold>Normal state (no status message):</Text>
      <CommandBox
        ui={mockUIState}
        rootPath="/tmp/test"
        termWidth={demoTermWidth}
        storageMode="disk"
        nodeCount={42}
        moveMode={false}
      />
      <Text> </Text>

      <Text bold>With status message:</Text>
      <CommandBox
        ui={uiStateWithStatus}
        rootPath="/tmp/test"
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
        <Box width={demoTermWidth} height={demoTermHeight} flexDirection="column" position="relative">
          {/* Content area */}
          <Box flexGrow={1} flexShrink={1}>
            <Text dimColor>Board content area...</Text>
          </Box>

          {/* Toast stack in bottom-right */}
          <ToastStack toasts={mockToasts.slice(0, 3)} termWidth={demoTermWidth} termHeight={demoTermHeight} />

          {/* Command box at bottom */}
          <CommandBox
            ui={uiStateWithStatus}
            rootPath="/tmp/test"
            termWidth={demoTermWidth}
            storageMode="disk"
            nodeCount={42}
            moveMode={false}
          />
        </Box>
      </ViewBox>
    </>
  )
}

// ============================================================================
// Main Storybook Component
// ============================================================================

// Create a minimal mock repo for storybook
export const mockRepo = createFakeRepo()

// Section definitions for interactive mode
export interface Section {
  id: string
  title: string
  component: () => React.ReactElement
}

export const sections: Section[] = [
  { id: "rich-text", title: "Layer 1: Rich Text", component: Layer1RichText },
  { id: "tag-pills", title: "Layer 1: Tag Pills", component: Layer1TagPills },
  {
    id: "task-styling",
    title: "Layer 1: Task Styling",
    component: Layer1TaskStyling,
  },
  {
    id: "fold-markers",
    title: "Layer 1: Fold Markers",
    component: Layer1FoldMarkers,
  },
  { id: "layout", title: "Layer 2: Layout", component: Layer2Layout },
  { id: "tree-node", title: "Layer 3: TreeNode", component: Layer3Views },
  { id: "all-views", title: "Layer 3: All Views", component: Layer3AllViews },
  {
    id: "visual-language",
    title: "Visual Language",
    component: VisualLanguageSection,
  },
  {
    id: "toast-status",
    title: "Toast & Status Bar",
    component: ToastAndStatusSection,
  },
]

type StorybookMode = "inline" | "fullscreen" | "fullscreen-nonalt"

// Interactive Storybook with keyboard navigation
function InteractiveStorybook({ mode }: { mode: StorybookMode }): React.ReactElement {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)

  const termWidth = stdout?.columns ?? 120
  const termHeight = stdout?.rows ?? 40
  const sidebarWidth = 28
  const isInline = mode === "inline"
  const scrollStep = 3
  // Header: 1 content row + 2 border rows = 3. Content area = remaining.
  const contentHeight = termHeight - 3

  useInput((input, key) => {
    if (input === "j") {
      setSelectedIndex((prev) => Math.min(prev + 1, sections.length - 1))
      setScrollOffset(0)
    } else if (input === "k") {
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      setScrollOffset(0)
    } else if (key.downArrow) {
      setScrollOffset((prev) => prev + scrollStep)
    } else if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - scrollStep))
    } else if (input === "q" || key.escape) {
      exit()
    }
  })

  const currentSection = sections[selectedIndex]

  return (
    <RepoProvider repo={mockRepo}>
      <StorybookProviders>
        <Box flexDirection="column" width={termWidth} height={isInline ? undefined : termHeight}>
          {/* Header */}
          {isInline ? (
            <Box paddingX={1} gap={2}>
              <Text bold color="cyan">
                TUI Storybook
              </Text>
              <Text bold>
                {currentSection?.title} ({selectedIndex + 1}/{sections.length})
              </Text>
              <Text dimColor>j/k:nav ↑↓:scroll q:quit</Text>
            </Box>
          ) : (
            <Box borderStyle="double" borderColor="cyan" paddingX={1}>
              <Text bold color="cyan">
                TUI Storybook
              </Text>
              <Text>{"  "}</Text>
              <Text dimColor>j/k:nav ↑↓:scroll q:quit</Text>
            </Box>
          )}

          {/* Main content area */}
          <Box flexDirection="row" flexGrow={isInline ? undefined : 1}>
            {/* Sidebar */}
            <Box flexDirection="column" width={sidebarWidth} borderStyle="single" borderColor="gray" paddingX={1}>
              <Text bold color="yellow">
                Sections
              </Text>
              <Text dimColor>────────────────────────</Text>
              {sections.map((section, idx) => {
                const isSelected = idx === selectedIndex
                return (
                  <Text
                    key={section.id}
                    backgroundColor={isSelected ? "cyan" : undefined}
                    color={isSelected ? "black" : "white"}
                  >
                    {isSelected ? "▸" : " "} {section.title.slice(0, sidebarWidth - 5)}
                  </Text>
                )
              })}
            </Box>

            {/* Content area — scrollable in fullscreen */}
            <Box
              flexDirection="column"
              flexGrow={isInline ? undefined : 1}
              height={isInline ? undefined : contentHeight}
              paddingX={1}
              overflow={isInline ? undefined : "scroll"}
              scrollOffset={isInline ? undefined : scrollOffset}
            >
              {currentSection && <currentSection.component />}
            </Box>
          </Box>
        </Box>
      </StorybookProviders>
    </RepoProvider>
  )
}

// ============================================================================
// Render and Output
// ============================================================================

if (import.meta.main) {
  // Render mode: --inline (default), --fullscreen, --fullscreen-nonalt
  const mode: StorybookMode = process.argv.includes("--inline")
    ? "inline"
    : process.argv.includes("--fullscreen-nonalt")
      ? "fullscreen-nonalt"
      : "fullscreen"

  const renderMode = mode === "inline" ? "inline" : "fullscreen"
  const alternateScreen = mode === "fullscreen" ? true : false

  using term = createTerm()
  const instance = await silverytRender(<InteractiveStorybook mode={mode} />, term, {
    exitOnCtrlC: true,
    mode: renderMode,
    alternateScreen,
  })
  await instance.waitUntilExit()
}
