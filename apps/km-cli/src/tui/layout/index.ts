/**
 * TUI Layout Module (Layer 2 - TUI-only)
 *
 * Layout functions for the TUI that operate on styled ANSI strings.
 * These are TUI-specific and not needed by CLI commands.
 *
 * ## Modules
 * - `wrap` - Word-wrap styled text
 * - `truncate` - Truncate and pad styled text
 * - `constrain` - Combine wrap + truncate with limits
 * - `path` - Smart breadcrumb path rendering
 */

// Text wrapping
export { wrapText } from "./wrap.ts";

// Text truncation and padding
export { truncateText, padText } from "./truncate.ts";

// Text constraining (wrap + truncate + limit)
export { constrainText } from "./constrain.ts";

// Path rendering
export {
  renderPath,
  renderParentPath,
  calcPathLength,
  type PathSegment,
} from "./path.ts";
