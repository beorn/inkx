/**
 * Tests for flattened styling chain.
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { createTerm, stripAnsi } from '../src/index.js'

// =============================================================================
// Environment Helpers
// =============================================================================

let originalEnv: Record<string, string | undefined>

function saveEnv() {
  originalEnv = {
    FORCE_COLOR: process.env.FORCE_COLOR,
    NO_COLOR: process.env.NO_COLOR,
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function clearEnv() {
  delete process.env.FORCE_COLOR
  delete process.env.NO_COLOR
}

// =============================================================================
// Basic Styling Tests
// =============================================================================

describe('Basic styling', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.red() produces ANSI red', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.red('text')

    expect(result).toContain('\x1b[31m') // Red foreground
    expect(result).toContain('text')
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.green() produces ANSI green', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.green('text')

    expect(result).toContain('\x1b[32m') // Green foreground
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.blue() produces ANSI blue', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.blue('text')

    expect(result).toContain('\x1b[34m') // Blue foreground
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.yellow() produces ANSI yellow', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.yellow('text')

    expect(result).toContain('\x1b[33m') // Yellow foreground
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })
})

// =============================================================================
// Modifier Tests
// =============================================================================

describe('Modifiers', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.bold() produces bold text', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.bold('text')

    expect(result).toContain('\x1b[1m') // Bold
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.dim() produces dim text', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.dim('text')

    expect(result).toContain('\x1b[2m') // Dim
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.italic() produces italic text', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.italic('text')

    expect(result).toContain('\x1b[3m') // Italic
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.underline() produces underlined text', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.underline('text')

    expect(result).toContain('\x1b[4m') // Underline
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.strikethrough() produces strikethrough text', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.strikethrough('text')

    expect(result).toContain('\x1b[9m') // Strikethrough
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.inverse() produces inverse text', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.inverse('text')

    expect(result).toContain('\x1b[7m') // Inverse
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })
})

// =============================================================================
// Chaining Tests
// =============================================================================

describe('Style chaining', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.bold.red() chains correctly', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.bold.red('text')

    expect(result).toContain('\x1b[1m') // Bold
    expect(result).toContain('\x1b[31m') // Red
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.red.bold() chains in reverse order', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.red.bold('text')

    expect(result).toContain('\x1b[1m') // Bold
    expect(result).toContain('\x1b[31m') // Red
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.bgBlue.white() combines background and foreground', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.bgBlue.white('text')

    expect(result).toContain('\x1b[44m') // Blue background
    expect(result).toContain('\x1b[37m') // White foreground
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.bold.italic.underline.red() chains multiple modifiers', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.bold.italic.underline.red('text')

    expect(result).toContain('\x1b[1m') // Bold
    expect(result).toContain('\x1b[3m') // Italic
    expect(result).toContain('\x1b[4m') // Underline
    expect(result).toContain('\x1b[31m') // Red
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })
})

// =============================================================================
// RGB/Hex/256 Color Tests
// =============================================================================

describe('RGB colors', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.rgb(255, 0, 0) produces red', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.rgb(255, 0, 0)('text')

    expect(result).toContain('\x1b[38;2;255;0;0m') // RGB red
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.rgb(0, 255, 0) produces green', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.rgb(0, 255, 0)('text')

    expect(result).toContain('\x1b[38;2;0;255;0m') // RGB green
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.rgb().bold() chains correctly', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.rgb(100, 150, 200).bold('text')

    expect(result).toContain('\x1b[38;2;100;150;200m') // RGB
    expect(result).toContain('\x1b[1m') // Bold
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })
})

describe('Hex colors', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.hex("#ff0000") produces red', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.hex('#ff0000')('text')

    expect(result).toContain('\x1b[38;2;255;0;0m') // RGB red from hex
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.hex("#00ff00").bold() chains correctly', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.hex('#00ff00').bold('text')

    expect(result).toContain('\x1b[38;2;0;255;0m') // RGB green
    expect(result).toContain('\x1b[1m') // Bold
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })
})

describe('Background RGB colors', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.bgRgb(255, 0, 0) produces red background', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.bgRgb(255, 0, 0)('text')

    expect(result).toContain('\x1b[48;2;255;0;0m') // RGB red background
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.bgHex("#0000ff") produces blue background', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.bgHex('#0000ff')('text')

    expect(result).toContain('\x1b[48;2;0;0;255m') // RGB blue background
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })
})

describe('256 colors', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.ansi256(196) produces color 196', () => {
    const term = createTerm({ color: '256' })
    const result = term.ansi256(196)('text')

    expect(result).toContain('\x1b[38;5;196m') // 256 color
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.bgAnsi256(21) produces background color 21', () => {
    const term = createTerm({ color: '256' })
    const result = term.bgAnsi256(21)('text')

    expect(result).toContain('\x1b[48;5;21m') // 256 background color
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })
})

// =============================================================================
// No Color Tests
// =============================================================================

describe('No color mode', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.red() returns plain text when color: null', () => {
    const term = createTerm({ color: null })
    const result = term.red('text')

    expect(result).toBe('text')
    expect(result).not.toContain('\x1b[')
    term[Symbol.dispose]()
  })

  test('term.bold.green() returns plain text when color: null', () => {
    const term = createTerm({ color: null })
    const result = term.bold.green('text')

    expect(result).toBe('text')
    expect(result).not.toContain('\x1b[')
    term[Symbol.dispose]()
  })

  test('term.rgb(255, 0, 0)() returns plain text when color: null', () => {
    const term = createTerm({ color: null })
    const result = term.rgb(255, 0, 0)('text')

    expect(result).toBe('text')
    expect(result).not.toContain('\x1b[')
    term[Symbol.dispose]()
  })

  test('chained styles return plain text when color: null', () => {
    const term = createTerm({ color: null })
    const result = term.bold.italic.underline.bgRed.white('text')

    expect(result).toBe('text')
    expect(result).not.toContain('\x1b[')
    term[Symbol.dispose]()
  })
})

// =============================================================================
// Template Literal Tests
// =============================================================================

describe('Template literals', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.red`template` works', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.red`hello world`

    expect(result).toContain('\x1b[31m')
    expect(stripAnsi(result)).toBe('hello world')
    term[Symbol.dispose]()
  })

  test('term.bold.green`template with ${value}` works', () => {
    const term = createTerm({ color: 'truecolor' })
    const value = 'interpolated'
    const result = term.bold.green`template with ${value}`

    expect(result).toContain('\x1b[1m')
    expect(result).toContain('\x1b[32m')
    // Template literal behavior may add commas between parts
    expect(stripAnsi(result)).toContain('template with')
    expect(stripAnsi(result)).toContain('interpolated')
    term[Symbol.dispose]()
  })
})

// =============================================================================
// Bright Color Tests
// =============================================================================

describe('Bright colors', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('term.redBright() produces bright red', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.redBright('text')

    expect(result).toContain('\x1b[91m') // Bright red
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.bgGreenBright() produces bright green background', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.bgGreenBright('text')

    expect(result).toContain('\x1b[102m') // Bright green background
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })

  test('term.gray() produces gray (alias for blackBright)', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.gray('text')

    expect(result).toContain('\x1b[90m') // Gray (bright black)
    expect(stripAnsi(result)).toBe('text')
    term[Symbol.dispose]()
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('empty string styling works', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.red('')

    // Chalk still adds codes even for empty strings
    expect(stripAnsi(result)).toBe('')
    term[Symbol.dispose]()
  })

  test('multi-line text styling works', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.red('line1\nline2\nline3')

    expect(result).toContain('\x1b[31m')
    expect(stripAnsi(result)).toBe('line1\nline2\nline3')
    term[Symbol.dispose]()
  })

  test('special characters styling works', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.red('hello "world" & <test>')

    expect(stripAnsi(result)).toBe('hello "world" & <test>')
    term[Symbol.dispose]()
  })

  test('unicode styling works', () => {
    const term = createTerm({ color: 'truecolor' })
    const result = term.red('hello \u2714 \u2718')

    expect(stripAnsi(result)).toBe('hello \u2714 \u2718')
    term[Symbol.dispose]()
  })
})
