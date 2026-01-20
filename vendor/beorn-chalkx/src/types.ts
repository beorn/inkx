/**
 * Type definitions for @beorn/chalkx
 */

/**
 * Extended underline styles supported by modern terminals.
 *
 * - `single`: Standard underline (SGR 4:1)
 * - `double`: Two parallel lines (SGR 4:2)
 * - `curly`: Wavy/squiggly line (SGR 4:3) - commonly used for spell check
 * - `dotted`: Dotted line (SGR 4:4)
 * - `dashed`: Dashed line (SGR 4:5)
 */
export type UnderlineStyle =
  | "single"
  | "double"
  | "curly"
  | "dotted"
  | "dashed";

/**
 * RGB color tuple for underline color.
 * Each component is 0-255.
 */
export type RGB = [r: number, g: number, b: number];
