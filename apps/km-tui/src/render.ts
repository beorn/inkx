/**
 * Board Rendering
 *
 * Pure functions that render board state to strings - fully testable.
 *
 * Uses the text layer (text/index.ts) for:
 * - Content rendering: parseToPlainText() for markdown stripping
 * - Status icons: renderStatusIcon() with colorize()
 *
 * Uses term for UI chrome:
 * - Headers, borders, status bars
 * - Selection/current highlighting via theme tokens ($selection/$selection)
 */

import { createTerm, type StyleChain } from "@silvery/ag-react"
import type { TaskStatus } from "@km/core"
import type { Repo } from "./repo-context.tsx"
import type { InitialBoardData, RenderOptions } from "./types.ts"
import type { KNode } from "@km/core"
import { getNodeDisplayName } from "./state.ts"
import { getStatusIcon as getStatusIconBase, parseToPlainText, colorize, themeFg, themeFgBg } from "./text/index.ts"

/**
 * Create a term instance with truecolor support.
 * Called per-invocation to avoid module-level mutable state.
 */
function createTermStyle(): StyleChain {
  return createTerm({ color: "truecolor" })
}

/**
 * Default render options
 */
export function defaultRenderOptions(): RenderOptions {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
    useColor: true,
  }
}

/**
 * Render the entire board to a string
 *
 * NOTE: This is legacy rendering code used only in tests.
 * Production code uses React-based BoardCore component.
 */
export function renderBoard(
  repo: Repo,
  state: InitialBoardData,
  opts: RenderOptions,
  colIndex = 0,
  cardIndex = 0,
): string {
  const style = createTermStyle()
  const lines: string[] = []
  const { width, height } = opts

  // Get root node for title
  const root = state.rootId ? repo.getNode(state.rootId) : null
  const title = root ? getNodeDisplayName(repo, root) : "Board"

  // Header
  lines.push(style.bold.inverse(` ${title} `.padEnd(width)))

  if (state.columns.length === 0) {
    lines.push(style.dim("\n  Empty board - no columns found"))
    lines.push(style.dim("  Add child nodes to create columns\n"))
    lines.push(renderStatusBar(state, width))
    return lines.join("\n")
  }

  // Calculate column dimensions
  const colWidth = Math.max(20, Math.floor((width - 2) / state.columns.length))
  const cardHeight = height - 5

  // Column headers
  const headers = state.columns.map((col, i) => {
    const name = getNodeDisplayName(repo, col.node)
    const count = col.cardNodes.length
    const header = ` ${name} (${count}) `
    const isSelected = i === colIndex
    const padded = header.padEnd(colWidth - 1).slice(0, colWidth - 1)
    return isSelected ? style.bold(themeFgBg(padded, "$selection", "$selection-bg")) : style.bold(padded)
  })
  lines.push(headers.join(" "))
  lines.push(style.dim("─".repeat(width)))

  // Render cards
  const maxCardsVisible = Math.max(Math.floor(cardHeight / 4), 3)

  for (let row = 0; row < maxCardsVisible; row++) {
    const cardLines = state.columns.map((col, ci) => {
      const card = col.cardNodes[row]
      if (!card) {
        return " ".repeat(colWidth - 1)
      }

      const isCurrentCard = ci === colIndex && row === cardIndex
      const isSelected = false
      const isFolded = false

      return renderCard(repo, card, colWidth - 1, isCurrentCard, isSelected, isFolded)
    })

    // Cards can be multi-line
    const lineArrays = cardLines.map((l) => l.split("\n"))
    const maxLines = Math.max(...lineArrays.map((a) => a.length))

    for (let li = 0; li < maxLines; li++) {
      const line = lineArrays.map((cardLineArray) => (cardLineArray[li] || "").padEnd(colWidth - 1)).join(" ")
      lines.push(line)
    }
  }

  // Show "..." if more cards
  const moreIndicators = state.columns.map((col) => {
    if (col.cardNodes.length > maxCardsVisible) {
      return style.dim(`  ... +${col.cardNodes.length - maxCardsVisible} more`).padEnd(colWidth - 1)
    }
    return " ".repeat(colWidth - 1)
  })
  lines.push(moreIndicators.join(" "))

  // Status bar
  lines.push(renderStatusBar(state, width))

  return lines.join("\n")
}

/**
 * Render a single card
 * Format: "○ Content" with 2-space indent for children (greyed out)
 */
export function renderCard(
  repo: Repo,
  card: KNode,
  width: number,
  isCurrent: boolean,
  isSelected: boolean,
  isFolded: boolean,
): string {
  const style = createTermStyle()
  const lines: string[] = []
  const children = repo.getChildren(card.id)

  // Status icon and content - compact format: "○ Content"
  // For embedded nodes, resolve the target node and show its content
  const embedSource = card.embed_source
  const displayNode = embedSource ? (repo.getNode(embedSource) ?? card) : card
  const statusIcon = renderStatusIcon(displayNode.task_status)
  const contentFirstLine = displayNode.content?.split("\n")[0] ?? ""
  const rawContent = (parseToPlainText(contentFirstLine) || getNodeDisplayName(repo, displayNode)).slice(0, width - 3)

  // Apply plain text conversion, then dim+strikethrough for done/dropped
  const isDoneOrDropped = displayNode.task_status === "done" || displayNode.task_status === "dropped"
  const styledContent = rawContent
  const content = isDoneOrDropped ? style.dim.strikethrough(styledContent) : styledContent
  let firstLine = `${statusIcon} ${content}`

  // Apply styling
  if (isCurrent) {
    firstLine = themeFgBg(firstLine.padEnd(width).slice(0, width), "$selection", "$selection-bg")
  } else if (isSelected) {
    firstLine = themeFgBg(firstLine.padEnd(width).slice(0, width), "$selection", "$selection-bg")
  } else {
    firstLine = firstLine.padEnd(width).slice(0, width)
  }
  lines.push(firstLine)

  // Children (outline) - greyed out, same indent level as parent
  if (!isFolded && children.length > 0) {
    const maxChildren = 3
    const visibleChildren = children.slice(0, maxChildren)
    for (const child of visibleChildren) {
      const childIcon = renderStatusIcon(child.task_status)
      const childRaw = (child.content || "").slice(0, width - 3)
      const childContent = parseToPlainText(childRaw)
      lines.push(style.dim(`${childIcon} ${childContent}`).padEnd(width).slice(0, width))
    }
    if (children.length > maxChildren) {
      lines.push(
        style
          .dim(`  +${children.length - maxChildren} more`)
          .padEnd(width)
          .slice(0, width),
      )
    }
  } else if (children.length > 0) {
    lines.push(style.dim(`  ▶ ${children.length}`).padEnd(width).slice(0, width))
  }

  // Card border bottom
  lines.push(style.dim("─".repeat(width)))

  return lines.join("\n")
}

/**
 * Render status bar
 */
export function renderStatusBar(_state: InitialBoardData, width: number): string {
  const style = createTermStyle()

  const left = ""
  const right = "h/l:cols j/k:cards x:status Tab:fold ?:help q:quit"

  const padding = width - left.length - right.length - 2
  return style.inverse(` ${left}${" ".repeat(Math.max(1, padding))}${right} `)
}

/**
 * Render help overlay
 */
export function renderHelp(width: number): string {
  const style = createTermStyle()
  const primary = (text: string) => themeFg(text, "$primary")
  const help = `
${style.bold("BOARDLINER - Keyboard Reference")}

${primary("Navigation")}
  h / Ctrl+B      Move to left column
  l / Ctrl+F      Move to right column
  j / Ctrl+N      Move to next card
  k / Ctrl+P      Move to previous card
  g               Jump to first card
  G               Jump to last card
  Enter / o       Zoom into card
  Escape / q      Zoom out / Quit

${primary("Selection")}
  Space           Toggle card selection
  v               Visual mode (multi-select)

${primary("Actions")}
  x               Cycle status (todo → wip → blocked → done → ...)
  Tab             Fold/unfold card outline

${primary("Card Movement")}
  H               Move card to previous column
  L               Move card to next column
  K               Move card up in column
  J               Move card down in column

${primary("Clipboard")}
  Ctrl+C          Copy selected node(s)
  Ctrl+X          Cut selected node(s)
  Ctrl+V          Paste node(s)

${primary("Other")}
  /               Search
  ?               This help
  q               Quit

${style.dim("Press any key to close")}
`

  const lines: string[] = []
  lines.push(themeFgBg(" ".repeat(width), "$selection", "$selection-bg"))
  for (const line of help.split("\n")) {
    lines.push(line.padEnd(width).slice(0, width))
  }
  return lines.join("\n")
}

/**
 * Render status icon with coloring for CLI/TUI output.
 * Wraps the base getStatusIcon from icons.ts and applies colors via colorize().
 */
export function renderStatusIcon(status?: TaskStatus): string {
  const icon = getStatusIconBase(status)
  // Handle custom markers with background color (inverted display)
  if (icon.backgroundColor) {
    return themeFgBg(icon.char, "$fg", "$surface-bg")
  }
  // Map icon color to colorize-compatible color
  // Note: "blue" in icon.color maps to "cyan" for visibility
  const colorMap: Record<string, string> = {
    blue: "cyan",
  }
  const color = colorMap[icon.color ?? ""] ?? icon.color
  return colorize(icon.char, color)
}
