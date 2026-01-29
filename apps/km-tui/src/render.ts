/**
 * Board Rendering
 *
 * Pure functions that render board state to strings - fully testable.
 *
 * Uses the text layer (text/index.ts) for:
 * - Content rendering: renderRich() for markdown-aware styling
 * - Status icons: renderStatusIcon() with colorize()
 *
 * Uses term.style() for UI chrome:
 * - Headers, borders, status bars
 * - Selection/current highlighting (bgBlue, bgYellow)
 */

import { createTerm, type StyleChain } from "@beorn/chalkx"
import type { TaskStatus } from "@km/core"
import type { Repo } from "./repo-context.tsx"
import type { TUIBoardState, CardState, RenderOptions } from "./types.ts"
import { getNodeDisplayName } from "./state.ts"
import {
  getStatusIcon as getStatusIconBase,
  renderRich,
  colorize,
} from "./text/index.ts"

// Module-level term instance for styling (lazily initialized)
// Force truecolor support for consistent styling in CLI/TUI utilities
let _term: ReturnType<typeof createTerm> | null = null
function getStyle(): StyleChain {
  if (!_term) {
    _term = createTerm({ colors: "truecolor" })
  }
  return _term.style()
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
  state: TUIBoardState,
  opts: RenderOptions,
  colIndex = 0,
  cardIndex = 0,
): string {
  const style = getStyle()
  const lines: string[] = []
  const { width, height } = opts

  // Help overlay
  if (state.helpMode) {
    return renderHelp(width)
  }

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
    const count = col.cards.length
    const header = ` ${name} (${count}) `
    const isSelected = i === colIndex
    const padded = header.padEnd(colWidth - 1).slice(0, colWidth - 1)
    return isSelected ? style.bold.bgBlue.white(padded) : style.bold(padded)
  })
  lines.push(headers.join(" "))
  lines.push(style.dim("─".repeat(width)))

  // Render cards
  const maxCardsVisible = Math.max(Math.floor(cardHeight / 4), 3)

  for (let row = 0; row < maxCardsVisible; row++) {
    const cardLines = state.columns.map((col, ci) => {
      const card = col.cards[row]
      if (!card) {
        return " ".repeat(colWidth - 1)
      }

      const isCurrentCard = ci === colIndex && row === cardIndex
      const isSelected = state.selectedCards.has(card.node.id)
      const isFolded = state.foldedCards.has(card.node.id)

      return renderCard(
        repo,
        card,
        colWidth - 1,
        isCurrentCard,
        isSelected,
        isFolded,
      )
    })

    // Cards can be multi-line
    const lineArrays = cardLines.map((l) => l.split("\n"))
    const maxLines = Math.max(...lineArrays.map((a) => a.length))

    for (let li = 0; li < maxLines; li++) {
      const line = lineArrays
        .map((cardLineArray) => (cardLineArray[li] || "").padEnd(colWidth - 1))
        .join(" ")
      lines.push(line)
    }
  }

  // Show "..." if more cards
  const moreIndicators = state.columns.map((col) => {
    if (col.cards.length > maxCardsVisible) {
      return style
        .dim(`  ... +${col.cards.length - maxCardsVisible} more`)
        .padEnd(colWidth - 1)
    }
    return " ".repeat(colWidth - 1)
  })
  lines.push(moreIndicators.join(" "))

  // Status bar
  lines.push(renderStatusBar(state, width))

  // Search bar
  if (state.searchMode) {
    lines.push(style.inverse(` /${state.searchQuery}█ `.padEnd(width)))
  }

  return lines.join("\n")
}

/**
 * Render a single card
 * Format: "○ Content" with 2-space indent for children (greyed out)
 */
export function renderCard(
  repo: Repo,
  card: CardState,
  width: number,
  isCurrent: boolean,
  isSelected: boolean,
  isFolded: boolean,
): string {
  const style = getStyle()
  const lines: string[] = []
  const { node, children } = card

  // Status icon and content - compact format: "○ Content"
  const statusIcon = renderStatusIcon(node.task_status)
  const rawContent = (node.content || getNodeDisplayName(repo, node)).slice(
    0,
    width - 3,
  )

  // Apply markdown styling via renderRich, then dim+strikethrough for done/dropped
  const isDoneOrDropped =
    node.task_status === "done" || node.task_status === "dropped"
  const styledContent = renderRich(rawContent)
  const content = isDoneOrDropped
    ? style.dim.strikethrough(styledContent)
    : styledContent
  let firstLine = `${statusIcon} ${content}`

  // Apply styling
  if (isCurrent) {
    firstLine = style.bgBlue.white(firstLine.padEnd(width).slice(0, width))
  } else if (isSelected) {
    firstLine = style.bgYellow.black(firstLine.padEnd(width).slice(0, width))
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
      const childContent = renderRich(childRaw)
      lines.push(
        style.dim(`${childIcon} ${childContent}`).padEnd(width).slice(0, width),
      )
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
    lines.push(
      style.dim(`  ▶ ${children.length}`).padEnd(width).slice(0, width),
    )
  }

  // Card border bottom
  lines.push(style.dim("─".repeat(width)))

  return lines.join("\n")
}

/**
 * Render status bar
 */
export function renderStatusBar(state: TUIBoardState, width: number): string {
  const style = getStyle()
  const parts: string[] = []

  if (state.visualMode) {
    parts.push(style.bgYellow.black(" VISUAL "))
  }

  if (state.selectedCards.size > 0) {
    parts.push(style.yellow(`${state.selectedCards.size} selected`))
  }

  const left = parts.join(" ")
  const right = "h/l:cols j/k:cards x:status Tab:fold ?:help q:quit"

  const padding = width - left.length - right.length - 2
  return style.inverse(` ${left}${" ".repeat(Math.max(1, padding))}${right} `)
}

/**
 * Render help overlay
 */
export function renderHelp(width: number): string {
  const style = getStyle()
  const help = `
${style.bold("BOARDLINER - Keyboard Reference")}

${style.yellow("Navigation")}
  h / Ctrl+B      Move to left column
  l / Ctrl+F      Move to right column
  j / Ctrl+N      Move to next card
  k / Ctrl+P      Move to previous card
  g               Jump to first card
  G               Jump to last card
  Enter / o       Zoom into card
  Escape / q      Zoom out / Quit

${style.yellow("Selection")}
  Space           Toggle card selection
  v               Visual mode (multi-select)

${style.yellow("Actions")}
  x               Cycle status (todo → wip → blocked → done → ...)
  Tab             Fold/unfold card outline

${style.yellow("Card Movement")}
  H               Move card to previous column
  L               Move card to next column
  K               Move card up in column
  J               Move card down in column

${style.yellow("Other")}
  /               Search
  ?               This help
  q               Quit

${style.dim("Press any key to close")}
`

  const lines: string[] = []
  lines.push(style.bgBlue.white(" ".repeat(width)))
  for (const line of help.split("\n")) {
    lines.push(line.padEnd(width).slice(0, width))
  }
  return lines.join("\n")
}

/**
 * Render static board (non-TUI mode)
 * Displays columns vertically, one after another
 */
export function renderBoardStatic(
  repo: Repo,
  state: TUIBoardState,
  width: number,
): string {
  const style = getStyle()
  const { columns } = state
  const lines: string[] = []

  if (columns.length === 0) {
    return style.dim("Empty board")
  }

  // Show each column with its cards
  for (const col of columns) {
    const name = getNodeDisplayName(repo, col.node)
    const count = col.cards.length

    // Column header
    lines.push("")
    lines.push(style.bold(`${name}`) + style.dim(` (${count})`))

    // Cards under this column
    if (col.cards.length === 0) {
      lines.push(style.dim("  (empty)"))
    } else {
      const maxCards = 10 // Limit cards shown per column
      const visibleCards = col.cards.slice(0, maxCards)
      for (const card of visibleCards) {
        const statusIcon = renderStatusIcon(card.node.task_status)
        const rawContent =
          card.node.content || getNodeDisplayName(repo, card.node)
        const firstLine = rawContent.split("\n")[0] ?? rawContent
        const truncContent = firstLine.slice(0, width - 4)
        // Apply markdown styling, then dim+strikethrough for done/dropped
        const isDoneOrDropped =
          card.node.task_status === "done" ||
          card.node.task_status === "dropped"
        const styledContent = renderRich(truncContent)
        const content = isDoneOrDropped
          ? style.dim.strikethrough(styledContent)
          : styledContent
        lines.push(`${statusIcon} ${content}`)

        // Show children (greyed out, indented)
        if (card.children.length > 0) {
          const maxChildren = 3
          const visibleChildren = card.children.slice(0, maxChildren)
          for (const child of visibleChildren) {
            const childIcon = renderStatusIcon(child.task_status)
            const childRaw = child.content || ""
            const childLine = childRaw.split("\n")[0] ?? childRaw
            const childContent = renderRich(childLine.slice(0, width - 6))
            lines.push(style.dim(`  ${childIcon} ${childContent}`))
          }
          if (card.children.length > maxChildren) {
            lines.push(
              style.dim(`    +${card.children.length - maxChildren} more`),
            )
          }
        }
      }
      if (col.cards.length > maxCards) {
        lines.push(style.dim(`  +${col.cards.length - maxCards} more cards`))
      }
    }
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
    return getStyle().bgWhite.black(icon.char)
  }
  // Map icon color to colorize-compatible color
  // Note: "blue" in icon.color maps to "cyan" for visibility
  const colorMap: Record<string, string> = {
    blue: "cyan",
  }
  const color = colorMap[icon.color ?? ""] ?? icon.color
  return colorize(icon.char, color)
}
