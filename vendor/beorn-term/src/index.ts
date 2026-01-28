/**
 * @beorn/term - Terminal Detection, Styling, and Primitives
 *
 * A terminal abstraction with Disposable pattern support.
 *
 * @example
 * ```ts
 * import { createTerm, patchConsole } from '@beorn/term'
 *
 * // Create term (Disposable)
 * using term = createTerm()
 *
 * // Detection
 * term.hasCursor()    // boolean
 * term.hasInput()     // boolean
 * term.hasColor()     // 'basic' | '256' | 'truecolor' | null
 * term.hasUnicode()   // boolean
 *
 * // Styling (flattened, chainable)
 * term.red('error')
 * term.bold.green('success')
 *
 * // Output
 * term.write(term.red('error\n'))
 * term.writeLine('done')
 *
 * // Console interception
 * using patched = patchConsole(console)
 * patched.subscribe(() => console.log('new entry'))
 * ```
 */

// Re-export types
export type {
  ColorLevel,
  RGB,
  StyleOptions,
  ConsoleEntry,
  ConsoleMethod,
  CreateTermOptions,
  UnderlineStyle,
} from './types.js'

// Re-export detection functions
export {
  detectCursor,
  detectInput,
  detectColor,
  detectUnicode,
  detectExtendedUnderline,
} from './detection.js'

// Re-export term factory
export { createTerm } from './term.js'
export type { Term, StyleChain } from './term.js'

// Re-export console patching
export { patchConsole } from './patch-console.js'
export type { PatchedConsole } from './patch-console.js'

// Re-export utilities
export {
  stripAnsi,
  displayLength,
  ANSI_REGEX,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  hyperlink,
} from './utils.js'

// Re-export chalk for convenience
import chalk from 'chalk'
export { chalk }
