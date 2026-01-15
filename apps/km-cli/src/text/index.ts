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

// Rich text rendering and ANSI utilities
export {
  renderRich,
  renderPlain,
  displayLength,
  stripAnsi,
  ANSI_REGEX,
} from "./rich.ts";

// Icon utilities
export { getStatusIcon, getTypeIcon, type StatusIcon } from "./icons.ts";

// Node formatting
export {
  formatNode,
  formatStatus,
  formatNodeBrief,
  formatCollapsedAncestor,
} from "./format.ts";

// Extended ANSI features (chalk-x)
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
} from "./chalk-x.ts";

// Board color system
export {
  GTD_BOARD_COLORS,
  getChalkColor,
  normalizeBoardName,
  getBoardColorByName,
  colorize,
  type ChalkColor,
} from "./colors.ts";
