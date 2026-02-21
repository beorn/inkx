/**
 * Text Rendering Module (Layer 1 - Shared)
 *
 * This module provides shared text rendering utilities used by both
 * CLI commands and TUI components.
 *
 * ## Modules
 * - `rich` - ANSI string utilities (stripFgColor, displayLength, stripAnsi)
 * - `icons` - Status and type icons
 * - `format` - Node formatting for display
 * - `inline-parser` - Markdown text → InlineNode[] AST
 * - `InlineComponents` - InlineNode[] → React JSX rendering
 */

// Text pipeline utilities (kept: extractRefs, extractLinkParts, prettifyUrl, patterns)
export {
  extractRefs,
  extractLinkParts,
  prettifyUrl,
  SIGIL_PATTERN,
  MENTION_PATTERN,
  TAG_PATTERN,
  PROJECT_PATTERN,
} from "./text-pipeline.ts"

// Icon utilities (moved from @km/tui-core)
export {
  getStatusIcon,
  getTypeIcon,
  getNodeIcon,
  getFoldMarker,
  COLORED_CIRCLE,
  SMALL_BULLET,
  FOLDED_MARKER,
  UNFOLDED_MARKER,
  EMPTY_MARKER,
  getTypeBullet,
  getCircleBullet,
  getColumnHeaderIcon,
  isSigilName,
  SIGIL_RE,
  type StatusIcon,
} from "../icons.ts"

// Node formatting
export { formatNode, formatStatus, formatNodeBrief, formatCollapsedAncestor } from "./format.ts"

// Term primitives (re-exported from inkx)
export { createTerm, term, type Term, type StyleChain } from "inkx"

// Extended ANSI features (chalkx - not re-exported by inkx)
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
} from "chalkx"

// Inline AST (parser + types + components)
export { parseInlineText, parseToPlainText, inlineNodesToPlainText } from "./inline-parser.ts"
export type { InlineNode } from "./inline-ast-types.ts"
export { InlineNodes, InlineText, InlineRenderProvider, type InlineRenderContext } from "./InlineComponents.tsx"

// Board color system
export {
  GTD_BOARD_COLORS,
  getTermColor,
  normalizeBoardName,
  getBoardColorByName,
  colorize,
  type TermColor,
} from "./colors.ts"
