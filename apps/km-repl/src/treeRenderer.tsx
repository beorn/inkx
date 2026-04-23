/**
 * Tree Renderer for km-sh
 *
 * Renders a BoardState tree using silvery for TUI-style output.
 * Used by the `render` command to provide visual debugging.
 */

import React from "react"
import { Box, Small, Text, renderStatic } from "@silvery/ag-react"
import type { BoardState, TNode, TPath } from "./board-types.ts"

// Status icons for task status
const STATUS_ICONS: Record<string, string> = {
  todo: "○",
  wip: "◐",
  blocked: "⊘",
  done: "✓",
  dropped: "∅",
}

interface TreeLineProps {
  prefix: string
  connector: string
  foldChar: string
  statusIcon: string
  title: string
  suffix: string
  isCursor: boolean
  isSelected: boolean
}

/**
 * Renders a single tree line with proper styling
 */
function TreeLine({
  prefix,
  connector,
  foldChar,
  statusIcon,
  title,
  suffix,
  isCursor,
  isSelected,
}: TreeLineProps): React.ReactElement {
  // Build the full line content
  const contentText = `${foldChar} ${statusIcon} ${title}${suffix}`

  if (isCursor) {
    return (
      <Text>
        <Small>
          {prefix}
          {connector}
        </Small>
        <Text backgroundColor="cyan" color="black">
          {contentText}
        </Text>
      </Text>
    )
  }

  if (isSelected) {
    return (
      <Text>
        <Small>
          {prefix}
          {connector}
        </Small>
        <Text color="cyan">{contentText}</Text>
      </Text>
    )
  }

  return (
    <Text>
      <Small>
        {prefix}
        {connector}
      </Small>
      <Text>{contentText}</Text>
    </Text>
  )
}

/**
 * Recursively build tree lines for rendering
 */
function buildTreeLines(
  nodes: TNode[],
  cursor: TPath,
  foldDepths: Map<string, number>,
  selectedNodes: Set<string>,
  parentPath: TPath,
  prefix: string,
): React.ReactElement[] {
  const lines: React.ReactElement[] = []

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!node) continue

    const path = [...parentPath, i]
    const isLast = i === nodes.length - 1
    const connector = isLast ? "└── " : "├── "
    const childPrefix = prefix + (isLast ? "    " : "│   ")

    // Check if this node is at the cursor position
    const isCursor = cursor.length === path.length && cursor.every((v, j) => v === path[j])
    const isSelected = selectedNodes.has(node.id)
    const isFolded = foldDepths.get(node.id) === 0

    // Status icon
    const statusIcon = node.item?.task?.status ? (STATUS_ICONS[node.item?.task?.status] ?? " ") : " "

    // Fold indicator
    const foldChar = node.childCount > 0 ? (isFolded ? "▸" : "▾") : " "

    // Title with count if folded
    const titleSuffix = isFolded && node.childCount > 0 ? ` (+${node.childCount})` : ""

    lines.push(
      <TreeLine
        key={node.id}
        prefix={prefix}
        connector={connector}
        foldChar={foldChar}
        statusIcon={statusIcon}
        title={node.title ?? "(untitled)"}
        suffix={titleSuffix}
        isCursor={isCursor}
        isSelected={isSelected}
      />,
    )

    // Render children if not folded
    if (!isFolded && node.children.length > 0) {
      lines.push(...buildTreeLines(node.children, cursor, foldDepths, selectedNodes, path, childPrefix))
    }
  }

  return lines
}

interface TreeViewProps {
  state: BoardState
  width: number
  height: number
}

/**
 * Main tree view component for rendering BoardState
 */
function TreeView({ state, width, height }: TreeViewProps): React.ReactElement {
  const lines = buildTreeLines(state.nodes, state.cursor, state.foldDepths, state.selectedNodes, [], "")

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <Text bold>{state.rootPath ?? "/"}</Text>
      {/* Tree content */}
      {lines}
      {/* Footer with cursor position */}
      <Box marginTop={1}>
        <Small>
          cursor: [{state.cursor.join(",")}]{state.selectedNodes.size > 0 && ` selected: ${state.selectedNodes.size}`}
        </Small>
      </Box>
    </Box>
  )
}

/**
 * Render a BoardState to text using silvery renderStatic
 */
export async function renderTree(
  state: BoardState,
  options: { width?: number; height?: number; ansi?: boolean } = {},
): Promise<string> {
  const { width = 80, height = 24, ansi = false } = options

  // Use renderStatic for one-shot rendering (production code)
  return renderStatic(React.createElement(TreeView, { state, width, height }), {
    width,
    height,
    plain: !ansi,
  })
}
