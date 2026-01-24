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

// Rich text rendering (ANSI utilities exported from layout/index.ts via @beorn/tui-measure)
export { renderRich, renderPlain, type RenderRichOptions } from "./rich.ts";

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
  type StatusIcon,
} from "../icons.ts";

// Node formatting
export {
  formatNode,
  formatStatus,
  formatNodeBrief,
  formatCollapsedAncestor,
} from "./format.ts";

// Extended ANSI features (chalkx)
export {
  chalkX,
  chalk,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  hyperlink,
  supportsExtendedUnderline,
  setExtendedUnderlineSupport,
  type UnderlineStyle,
} from "@beorn/chalkx";

// Board color system
export {
  GTD_BOARD_COLORS,
  getChalkColor,
  normalizeBoardName,
  getBoardColorByName,
  colorize,
  type ChalkColor,
} from "./colors.ts";
