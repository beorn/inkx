/**
 * Text Rendering Module (Layer 1 - Shared)
 *
 * This module provides shared text rendering utilities used by both
 * CLI commands and TUI components.
 *
 * ## Modules
 * - `rich` - ANSI string utilities (displayLength, stripAnsi)
 * - `icons` - Status and type icons
 * - `format` - Node formatting for display
 * - `inline-parser` - Markdown text → InlineNode[] AST
 * - `InlineComponents` - InlineNode[] → React JSX rendering
 */

// Text pipeline utilities (extractRefs, prettifyUrl, SIGIL_PATTERN)
export { extractRefs, prettifyUrl, SIGIL_PATTERN } from "./text-pipeline.ts"

// Icon utilities (moved from @km/tui-core)
export {
  getStatusIcon,
  getTypeIcon,
  getNodeIcon,
  getFoldMarker,
  FOLDED_MARKER,
  getTypeBullet,
  getCircleBullet,
  getColumnHeaderIcon,
  isSigilName,
  type StatusIcon,
} from "../icons.ts"

// Node formatting
export { formatNode, formatStatus, formatNodeBrief, formatCollapsedAncestor } from "./format.ts"

// Term primitives (re-exported from silvery)
export { createTerm, term, type Term, type StyleChain } from "@silvery/ag-react"

// Extended ANSI features (from @silvery/ag-term/ansi)
export {
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  hyperlink,
  detectExtendedUnderline,
  type UnderlineStyle,
} from "@silvery/ag-term/ansi"

// Inline AST (parser + types + components)
export { parseInlineText, parseToPlainText, inlineNodesToPlainText } from "./inline-parser.ts"
export type { InlineNode, TextDecoration } from "./inline-ast-types.ts"
export { InlineNodes, InlineText, InlineRenderProvider, type InlineRenderContext } from "./InlineComponents.tsx"
export { computeSearchDecorations, computeSearchDecorationsFromSource } from "./search-decorations.ts"

// Board color system
export {
  GTD_BOARD_COLORS,
  getTermColor,
  normalizeBoardName,
  getBoardColorByName,
  colorize,
  themeFg,
  themeFgBg,
  type TermColor,
} from "./colors.ts"
