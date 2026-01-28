/**
 * Basic @beorn/term usage
 *
 * This example demonstrates the core functionality:
 * - Creating a Term instance with the Disposable pattern
 * - Capability detection (cursor, input, color, unicode)
 * - Terminal dimensions
 * - Styled output using chainable methods
 */

import { createTerm } from '../src/index.js'

// Using Disposable pattern - term is automatically disposed when block exits
{
  using term = createTerm()

  // Detection - cached at creation time for consistency
  console.log('=== Terminal Capabilities ===')
  console.log('Cursor:', term.hasCursor()) // Can reposition cursor?
  console.log('Input:', term.hasInput()) // Can read raw keystrokes?
  console.log('Color:', term.hasColor()) // 'basic' | '256' | 'truecolor' | null
  console.log('Unicode:', term.hasUnicode()) // Can render unicode symbols?

  // Dimensions - live from stream, undefined if not a TTY
  console.log('Size:', term.cols, 'x', term.rows)

  console.log('')
  console.log('=== Styled Output ===')

  // Styled output - term IS the style chain, no .chalk prefix needed
  term.writeLine(term.bold.green('Success!'))
  term.writeLine(term.red('Error: ') + 'something went wrong')
  term.writeLine(term.dim('(press any key to continue)'))

  // More styling examples
  term.writeLine(term.cyan.underline('Important note'))
  term.writeLine(term.bgYellow.black(' Highlighted '))
}
// term is automatically disposed here via Symbol.dispose
