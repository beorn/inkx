/**
 * Extended underlines and hyperlinks for @beorn/term
 *
 * This example demonstrates advanced terminal features:
 * - Curly (wavy) underlines - commonly used for spell-check errors
 * - Dotted underlines
 * - Dashed underlines
 * - Double underlines
 * - Colored underlines (independent of text color)
 * - OSC 8 hyperlinks (clickable links in terminal)
 *
 * Note: Extended underlines require terminal support (Kitty, WezTerm, Ghostty,
 * iTerm2 3.4+, etc). On unsupported terminals, they fall back to regular underlines.
 */

import { createTerm } from '../src/index.js'
import {
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  hyperlink,
} from '../src/index.js'

using term = createTerm()

term.writeLine(term.bold('=== Extended Underline Styles ==='))
term.writeLine('')

// Basic underline styles
term.writeLine('Regular:  ' + term.underline('standard underline'))
term.writeLine('Curly:    ' + curlyUnderline('wavy/curly underline'))
term.writeLine('Dotted:   ' + dottedUnderline('dotted underline'))
term.writeLine('Dashed:   ' + dashedUnderline('dashed underline'))
term.writeLine('Double:   ' + doubleUnderline('double underline'))

term.writeLine('')
term.writeLine(term.bold('=== Combining with Colors ==='))
term.writeLine('')

// Combine extended underlines with term styling
term.writeLine(term.red(curlyUnderline('Spell-check style error')))
term.writeLine(term.yellow(dottedUnderline('Deprecation warning')))
term.writeLine(term.blue(dashedUnderline('Information note')))
term.writeLine(term.green(doubleUnderline('Important emphasis')))

term.writeLine('')
term.writeLine(term.bold('=== Colored Underlines ==='))
term.writeLine('')

// Underline color is independent of text color
// underlineColor(r, g, b, text) - sets underline color via RGB
term.writeLine('Red underline, default text:   ' + underlineColor(255, 0, 0, 'error indication'))
term.writeLine('Green underline, default text: ' + underlineColor(0, 255, 0, 'valid indication'))
term.writeLine('Blue underline, default text:  ' + underlineColor(0, 120, 255, 'info indication'))

term.writeLine('')

// Combine colored underline with colored text
term.writeLine(
  'Yellow text, red underline:    ' +
    term.yellow(underlineColor(255, 0, 0, 'warning with error underline')),
)

term.writeLine('')
term.writeLine(term.bold('=== Styled Underlines with Color ==='))
term.writeLine('')

// styledUnderline(style, [r, g, b] | null, text) - combines style and color
term.writeLine('Red curly:   ' + styledUnderline('curly', [255, 0, 0], 'misspelled word'))
term.writeLine('Orange dashed: ' + styledUnderline('dashed', [255, 165, 0], 'deprecated API'))
term.writeLine('Blue dotted: ' + styledUnderline('dotted', [0, 150, 255], 'type hint'))
term.writeLine('Green double: ' + styledUnderline('double', [0, 200, 0], 'definition'))

// Style without color (uses terminal default)
term.writeLine('Curly (default color): ' + styledUnderline('curly', null, 'no color specified'))

term.writeLine('')
term.writeLine(term.bold('=== Hyperlinks (OSC 8) ==='))
term.writeLine('')

// OSC 8 hyperlinks - clickable in supporting terminals
// hyperlink(displayText, url)
term.writeLine('Click here: ' + hyperlink('Anthropic Website', 'https://anthropic.com'))
term.writeLine('Docs: ' + hyperlink('Node.js Documentation', 'https://nodejs.org/docs'))
term.writeLine('Repo: ' + hyperlink('GitHub', 'https://github.com'))

term.writeLine('')

// Combine hyperlinks with styling
term.writeLine(
  'Styled link: ' + term.blue.underline(hyperlink('Blue Underlined Link', 'https://example.com')),
)
term.writeLine(
  'Bold link:   ' + term.bold(hyperlink('Bold Important Link', 'https://example.com')),
)

term.writeLine('')
term.writeLine(term.dim('Note: Hyperlinks require terminal support (iTerm2, Ghostty, Kitty, WezTerm, etc)'))
term.writeLine(term.dim('Extended underlines also require modern terminal support.'))
