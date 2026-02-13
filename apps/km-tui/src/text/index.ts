/**
 * Text Rendering Module (Layer 1 - Shared)
 *
 * This module provides shared text rendering utilities used by both
 * CLI commands and TUI components.
 *
 * ## Modules
 * - `rich` - Rich text rendering (markdown to ANSI) and ANSI utilities
 * - `icons` - Status and type icons
 * - `format` - Node formatting for display
 */

// Rich text rendering (ANSI utilities exported from inkx)
export { renderRich, renderPlain, type RenderRichOptions } from "./rich.ts"

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

// Board color system
export {
  GTD_BOARD_COLORS,
  getTermColor,
  normalizeBoardName,
  getBoardColorByName,
  colorize,
  type TermColor,
} from "./colors.ts"
