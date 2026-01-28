/**
 * Console patching example for @beorn/term
 *
 * This example demonstrates console interception:
 * - Patching console methods (log, info, warn, error, debug)
 * - Subscribing to console changes
 * - Reading captured entries
 * - Automatic restoration via Disposable pattern
 *
 * The patchConsole API is compatible with React's useSyncExternalStore.
 */

import { createTerm, patchConsole } from '../src/index.js'
import type { ConsoleEntry } from '../src/index.js'

using term = createTerm()

term.writeLine(term.bold('=== Console Capture Demo ==='))
term.writeLine('')

// Patch console - all console methods will be intercepted
using patched = patchConsole(console)

// Subscribe to changes - called whenever a new entry arrives
// This is compatible with React's useSyncExternalStore
const unsubscribe = patched.subscribe(() => {
  const entries = patched.getSnapshot()
  // Show count of captured entries
  term.write(term.dim(`  [${entries.length} entries captured]\n`))
})

term.writeLine(term.cyan('Calling various console methods:'))
term.writeLine('')

// These calls are captured and also forwarded to the original console
console.log('Hello from console.log')
console.info('Info message')
console.warn('Warning!')
console.error('Error!')
console.debug('Debug info')

term.writeLine('')
term.writeLine(term.cyan('Reviewing captured entries:'))
term.writeLine('')

// Get all captured entries
const entries = patched.getSnapshot()

for (const entry of entries) {
  // Format: [method] args... -> stream
  const methodColor = getMethodColor(entry.method)
  const methodStyled = term[methodColor](`[${entry.method.padEnd(5)}]`)
  const argsStr = entry.args.map((a) => String(a)).join(' ')
  const streamStyled = term.dim(`-> ${entry.stream}`)

  term.writeLine(`${methodStyled} ${argsStr} ${streamStyled}`)
}

term.writeLine('')
term.writeLine(term.dim('(unsubscribing from changes...)'))
unsubscribe()

term.writeLine('')
term.writeLine(term.cyan('More console calls after unsubscribe:'))
console.log('This is still captured but subscriber not notified')

term.writeLine('')
term.writeLine(`Total entries: ${patched.getSnapshot().length}`)

// Helper to color-code console methods
function getMethodColor(
  method: ConsoleEntry['method'],
): 'green' | 'blue' | 'yellow' | 'red' | 'gray' {
  switch (method) {
    case 'log':
      return 'green'
    case 'info':
      return 'blue'
    case 'warn':
      return 'yellow'
    case 'error':
      return 'red'
    case 'debug':
      return 'gray'
  }
}

// When the 'using' block exits, console methods are restored to originals
// patched[Symbol.dispose]() is called automatically
