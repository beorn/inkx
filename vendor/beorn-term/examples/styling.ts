/**
 * Styling examples for @beorn/term
 *
 * This example demonstrates all chainable styling options:
 * - Modifiers (bold, dim, italic, etc.)
 * - Foreground colors (basic and bright variants)
 * - Background colors
 * - RGB, Hex, and 256-color modes
 * - Combining styles
 */

import { createTerm } from '../src/index.js'

using term = createTerm()

console.log('=== Text Modifiers ===')
term.writeLine(term.bold('bold'))
term.writeLine(term.dim('dim'))
term.writeLine(term.italic('italic'))
term.writeLine(term.underline('underline'))
term.writeLine(term.strikethrough('strikethrough'))
term.writeLine(term.inverse('inverse'))
term.writeLine(term.hidden('hidden') + ' <-- hidden text')
term.writeLine(term.overline('overline'))

console.log('')
console.log('=== Basic Foreground Colors ===')
term.writeLine(term.black('black') + ' (may not be visible on dark terminals)')
term.writeLine(term.red('red'))
term.writeLine(term.green('green'))
term.writeLine(term.yellow('yellow'))
term.writeLine(term.blue('blue'))
term.writeLine(term.magenta('magenta'))
term.writeLine(term.cyan('cyan'))
term.writeLine(term.white('white'))
term.writeLine(term.gray('gray / grey'))

console.log('')
console.log('=== Bright Foreground Colors ===')
term.writeLine(term.blackBright('blackBright'))
term.writeLine(term.redBright('redBright'))
term.writeLine(term.greenBright('greenBright'))
term.writeLine(term.yellowBright('yellowBright'))
term.writeLine(term.blueBright('blueBright'))
term.writeLine(term.magentaBright('magentaBright'))
term.writeLine(term.cyanBright('cyanBright'))
term.writeLine(term.whiteBright('whiteBright'))

console.log('')
console.log('=== Background Colors ===')
term.writeLine(term.bgRed(' bgRed '))
term.writeLine(term.bgGreen(' bgGreen '))
term.writeLine(term.bgYellow.black(' bgYellow '))
term.writeLine(term.bgBlue(' bgBlue '))
term.writeLine(term.bgMagenta(' bgMagenta '))
term.writeLine(term.bgCyan.black(' bgCyan '))
term.writeLine(term.bgWhite.black(' bgWhite '))

console.log('')
console.log('=== Bright Background Colors ===')
term.writeLine(term.bgRedBright.black(' bgRedBright '))
term.writeLine(term.bgGreenBright.black(' bgGreenBright '))
term.writeLine(term.bgYellowBright.black(' bgYellowBright '))
term.writeLine(term.bgBlueBright.black(' bgBlueBright '))
term.writeLine(term.bgMagentaBright.black(' bgMagentaBright '))
term.writeLine(term.bgCyanBright.black(' bgCyanBright '))

console.log('')
console.log('=== RGB Colors (truecolor) ===')
// RGB foreground - requires truecolor support
term.writeLine(term.rgb(255, 136, 0)('Orange text (RGB 255, 136, 0)'))
term.writeLine(term.rgb(147, 112, 219)('Purple text (RGB 147, 112, 219)'))
term.writeLine(term.rgb(0, 255, 127)('Spring green (RGB 0, 255, 127)'))

// RGB background
term.writeLine(term.bgRgb(70, 130, 180).white(' Steel blue background '))

console.log('')
console.log('=== Hex Colors ===')
// Hex foreground
term.writeLine(term.hex('#FF6B6B')('Coral (#FF6B6B)'))
term.writeLine(term.hex('#4ECDC4')('Teal (#4ECDC4)'))
term.writeLine(term.hex('#FFE66D')('Yellow (#FFE66D)'))

// Hex background
term.writeLine(term.bgHex('#2C3E50').white(' Dark blue-gray background '))

console.log('')
console.log('=== 256 Colors ===')
// 256-color mode (ANSI 256)
term.writeLine(term.ansi256(196)('Bright red (ansi256: 196)'))
term.writeLine(term.ansi256(46)('Bright green (ansi256: 46)'))
term.writeLine(term.ansi256(21)('Blue (ansi256: 21)'))
term.writeLine(term.bgAnsi256(226).black(' Yellow background (ansi256: 226) '))

console.log('')
console.log('=== Chained Styles ===')
// Combine multiple styles by chaining
term.writeLine(term.bold.red('Bold red'))
term.writeLine(term.italic.green('Italic green'))
term.writeLine(term.bold.italic.underline.blue('Bold italic underlined blue'))
term.writeLine(term.bgYellow.black.bold(' Bold black on yellow '))
term.writeLine(term.rgb(255, 165, 0).bold.underline('Bold underlined orange'))

console.log('')
console.log('=== Nested Styling ===')
// Combine styled parts in a single line
term.write(term.red('[ERROR] '))
term.write(term.bold('Connection failed: '))
term.writeLine(term.dim('timeout after 30s'))

term.write(term.green('[OK] '))
term.write('Process ')
term.write(term.cyan.bold('worker-1'))
term.writeLine(' started successfully')

console.log('')
console.log('=== Reset Style ===')
// Reset removes all styles
term.writeLine(term.red.bold('This is styled') + term.reset(' this is not'))

console.log('')
console.log('=== Template Literals ===')
// Term styling works with template literals too
const name = 'World'
term.writeLine(term.bold`Hello, ${name}!`)
term.writeLine(term.green`Status: OK`)
