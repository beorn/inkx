/**
 * @beorn/chalkx - Extended Chalk with Modern Terminal Features
 *
 * Extends chalk with features not natively supported:
 * - Extended underline styles (curly, dotted, dashed, double)
 * - Independent underline color
 * - Hyperlinks (OSC 8)
 *
 * Features graceful fallback for unsupported terminals.
 *
 * ## Terminal Support
 *
 * | Feature           | Ghostty | Kitty | WezTerm | iTerm2 | Terminal.app |
 * |-------------------|---------|-------|---------|--------|--------------|
 * | Curly underline   | ✓       | ✓     | ✓       | ✓      | ✗ (fallback) |
 * | Dotted underline  | ✓       | ✓     | ✓       | ✓      | ✗ (fallback) |
 * | Dashed underline  | ✓       | ✓     | ✓       | ✓      | ✗ (fallback) |
 * | Double underline  | ✓       | ✓     | ✓       | ✓      | ✗ (fallback) |
 * | Underline color   | ✓       | ✓     | ✓       | ✓      | ✗ (ignored)  |
 * | Hyperlinks        | ✓       | ✓     | ✓       | ✓      | ✓            |
 *
 * @see https://sw.kovidgoyal.net/kitty/underlines/
 * @see https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
 *
 * @packageDocumentation
 */

import chalk from "chalk";

// =============================================================================
// Re-export Types
// =============================================================================

export type { UnderlineStyle, RGB } from "./types.js";

// =============================================================================
// Re-export Utilities (also available via @beorn/chalkx/utils)
// =============================================================================

export { ANSI_REGEX, stripAnsi, displayLength } from "./utils.js";

// =============================================================================
// Re-export Detection
// =============================================================================

export {
  supportsExtendedUnderline,
  setExtendedUnderlineSupport,
  resetDetectionCache,
} from "./detection.js";

// =============================================================================
// Re-export Underline Functions
// =============================================================================

export {
  underline,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
} from "./underline.js";

// =============================================================================
// Re-export Hyperlink Functions
// =============================================================================

export { hyperlink } from "./hyperlink.js";

// =============================================================================
// Background Override (for inkx compatibility)
// =============================================================================

/**
 * SGR code recognized by inkx to signal intentional bg override.
 * When text is wrapped with this, inkx won't warn/throw about chalk bg + inkx bg conflicts.
 * Exported for inkx to detect this marker in text content.
 */
export const BG_OVERRIDE_CODE = 9999;

/**
 * Wrap text with a marker that tells inkx this background color is intentional.
 *
 * Use this when you deliberately want to use chalk.bg* inside an inkx Box
 * that also has backgroundColor set. Without this wrapper, inkx will throw
 * (by default) because mixing both creates visual artifacts.
 *
 * @example
 * ```tsx
 * // Normally this throws because both inkx bg AND chalk bg are set:
 * <Box backgroundColor="cyan">
 *   <Text>{chalk.bgBlack('text')}</Text>  // Error!
 * </Box>
 *
 * // With bgOverride, you're saying "I know what I'm doing":
 * <Box backgroundColor="cyan">
 *   <Text>{bgOverride(chalk.bgBlack('text'))}</Text>  // OK
 * </Box>
 * ```
 */
export function bgOverride(text: string): string {
  return `\x1b[${BG_OVERRIDE_CODE}m${text}`;
}

// =============================================================================
// Re-export Chalk
// =============================================================================

/**
 * Re-export chalk for convenience.
 * Users can import everything from @beorn/chalkx instead of needing both packages.
 */
export { chalk };

// =============================================================================
// Convenience Object
// =============================================================================

// Import functions for the convenience object
import { stripAnsi, displayLength } from "./utils.js";
import { supportsExtendedUnderline } from "./detection.js";
import {
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
} from "./underline.js";
import { hyperlink } from "./hyperlink.js";

/**
 * Extended chalk instance with all standard chalk methods plus extensions.
 *
 * @example
 * ```ts
 * import { chalkX } from '@beorn/chalkx';
 *
 * // Standard chalk methods
 * chalkX.red('error');
 * chalkX.bold.blue('important');
 *
 * // Extended features
 * chalkX.curlyUnderline('misspelled');
 * chalkX.hyperlink('Click here', 'https://example.com');
 * ```
 */
export const chalkX = {
  // All chalk methods (spread doesn't work well with chalk's proxy)
  // Users should use chalk directly for color methods
  ...chalk,

  // Extended underlines
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,

  // Hyperlinks
  hyperlink,

  // Utilities
  stripAnsi,
  displayLength,

  // Capability detection
  supportsExtendedUnderline,

  // InkX compatibility
  bgOverride,
};

export default chalkX;
