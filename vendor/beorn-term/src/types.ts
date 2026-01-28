/**
 * Type definitions for @beorn/term
 */

/**
 * Color level supported by terminal.
 * - 'basic': 16 colors (SGR 30-37, 40-47)
 * - '256': 256 colors (SGR 38;5;n)
 * - 'truecolor': 16M colors (SGR 38;2;r;g;b)
 */
export type ColorLevel = "basic" | "256" | "truecolor"

/**
 * RGB color tuple.
 */
export type RGB = [r: number, g: number, b: number]

/**
 * Style options for term.style() method.
 */
export interface StyleOptions {
  color?: string
  bgColor?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
}

/**
 * Console method names that can be intercepted.
 */
export type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug"

/**
 * Entry captured from console.
 */
export interface ConsoleEntry {
  method: ConsoleMethod
  args: unknown[]
  stream: "stdout" | "stderr"
}

/**
 * Options for createTerm().
 */
export interface CreateTermOptions {
  stdout?: NodeJS.WriteStream
  stdin?: NodeJS.ReadStream

  // Override auto-detection (for testing or forcing)
  color?: ColorLevel | null // override hasColor()
  unicode?: boolean // override hasUnicode()
  cursor?: boolean // override hasCursor()
}

/**
 * Extended underline style.
 */
export type UnderlineStyle = "single" | "double" | "curly" | "dotted" | "dashed"
