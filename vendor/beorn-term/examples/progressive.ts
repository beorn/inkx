/**
 * Progressive enhancement example for @beorn/term
 *
 * This example demonstrates how to adapt output based on terminal capabilities:
 * - Checking color support before styling
 * - Checking unicode support before using symbols
 * - Providing fallbacks for unsupported features
 * - Creating reusable functions that gracefully degrade
 */

import { createTerm } from '../src/index.js'

using term = createTerm()

term.writeLine(term.bold('=== Progressive Enhancement Demo ==='))
term.writeLine('')

// Display current capabilities
term.writeLine('Current terminal capabilities:')
term.writeLine(`  Color:   ${term.hasColor() ?? 'none'}`)
term.writeLine(`  Unicode: ${term.hasUnicode()}`)
term.writeLine(`  Cursor:  ${term.hasCursor()}`)
term.writeLine(`  Input:   ${term.hasInput()}`)
term.writeLine('')

// Adapt output based on capabilities
function status(ok: boolean, message: string) {
  if (term.hasColor()) {
    // Color terminal: use colored icons
    const icon = term.hasUnicode() ? (ok ? '\u2713' : '\u2717') : ok ? '[OK]' : '[FAIL]'
    const styled = ok ? term.green(icon) : term.red(icon)
    term.writeLine(`${styled} ${message}`)
  } else {
    // No color: plain text
    term.writeLine(`${ok ? 'OK' : 'FAIL'}: ${message}`)
  }
}

term.writeLine(term.cyan('Status messages with progressive enhancement:'))
term.writeLine('')

status(true, 'Connected to server')
status(true, 'Authenticated successfully')
status(false, 'Database unavailable')
status(true, 'Cache initialized')
status(false, 'Redis connection timeout')

term.writeLine('')

// More complex progressive output
function logLevel(level: 'info' | 'warn' | 'error' | 'debug', message: string) {
  // Define icons and colors for each level
  const config = {
    info: { unicode: '\u2139', ascii: '[i]', color: 'blue' as const },
    warn: { unicode: '\u26a0', ascii: '[!]', color: 'yellow' as const },
    error: { unicode: '\u2716', ascii: '[X]', color: 'red' as const },
    debug: { unicode: '\u2699', ascii: '[D]', color: 'gray' as const },
  }

  const { unicode, ascii, color } = config[level]

  // Build the prefix based on capabilities
  let prefix: string
  if (term.hasColor()) {
    const icon = term.hasUnicode() ? unicode : ascii
    prefix = term[color](icon)
  } else {
    prefix = ascii
  }

  term.writeLine(`${prefix} ${message}`)
}

term.writeLine(term.cyan('Log levels with progressive enhancement:'))
term.writeLine('')

logLevel('info', 'Application started')
logLevel('debug', 'Loading configuration from /etc/app/config.yaml')
logLevel('warn', 'Deprecated API endpoint called: /api/v1/users')
logLevel('error', 'Failed to connect to payment gateway')
logLevel('info', 'Fallback to cached data')

term.writeLine('')

// Spinner/progress indicator that adapts
function spinner(step: number) {
  const frames = term.hasUnicode()
    ? ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827'] // Braille spinner
    : ['-', '\\', '|', '/'] // ASCII spinner

  const frame = frames[step % frames.length]

  if (term.hasColor()) {
    return term.cyan(frame)
  }
  return frame
}

term.writeLine(term.cyan('Spinner frames (unicode vs ASCII):'))
term.write('  ')
for (let i = 0; i < 8; i++) {
  term.write(spinner(i) + ' ')
}
term.writeLine('')

term.writeLine('')

// Progress bar that adapts
function progressBar(percent: number, width: number = 20) {
  const filled = Math.round((percent / 100) * width)
  const empty = width - filled

  // Choose characters based on unicode support
  const [fillChar, emptyChar, leftCap, rightCap] = term.hasUnicode()
    ? ['\u2588', '\u2591', '', ''] // Block chars
    : ['#', '-', '[', ']'] // ASCII

  const bar = leftCap + fillChar.repeat(filled) + emptyChar.repeat(empty) + rightCap

  // Add color if supported
  if (term.hasColor()) {
    const coloredFill =
      percent < 30 ? term.red(bar) : percent < 70 ? term.yellow(bar) : term.green(bar)
    return coloredFill
  }

  return bar
}

term.writeLine(term.cyan('Progress bars with progressive enhancement:'))
term.writeLine(`  25%:  ${progressBar(25)}`)
term.writeLine(`  50%:  ${progressBar(50)}`)
term.writeLine(`  75%:  ${progressBar(75)}`)
term.writeLine(`  100%: ${progressBar(100)}`)

term.writeLine('')

// Example: table border characters
function tableRow(cols: string[]) {
  const [h, v, corner] = term.hasUnicode()
    ? ['\u2500', '\u2502', '\u253c'] // Box drawing
    : ['-', '|', '+'] // ASCII

  const content = cols.join(` ${v} `)
  return `${v} ${content} ${v}`
}

term.writeLine(term.cyan('Table with adaptive borders:'))
term.writeLine(tableRow(['Name', 'Status', 'Time']))
term.writeLine((term.hasUnicode() ? '\u2502' : '|') + '\u2500'.repeat(24) + (term.hasUnicode() ? '\u2502' : '|'))
term.writeLine(tableRow(['api ', 'up    ', '12ms']))
term.writeLine(tableRow(['db  ', 'up    ', '3ms ']))
term.writeLine(tableRow(['cache', 'down  ', 'N/A ']))
