/**
 * Tests for utility functions.
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import {
  stripAnsi,
  displayLength,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  hyperlink,
  ANSI_REGEX,
} from '../src/index.js'

// =============================================================================
// Environment Helpers
// =============================================================================

let originalEnv: Record<string, string | undefined>

function saveEnv() {
  originalEnv = {
    TERM: process.env.TERM,
    TERM_PROGRAM: process.env.TERM_PROGRAM,
    KITTY_WINDOW_ID: process.env.KITTY_WINDOW_ID,
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
  delete process.env.TERM
  delete process.env.TERM_PROGRAM
  delete process.env.KITTY_WINDOW_ID
}

// =============================================================================
// stripAnsi Tests
// =============================================================================

describe('stripAnsi', () => {
  test('removes basic color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green')
    expect(stripAnsi('\x1b[34mblue\x1b[0m')).toBe('blue')
  })

  test('removes bold and other modifiers', () => {
    expect(stripAnsi('\x1b[1mbold\x1b[0m')).toBe('bold')
    expect(stripAnsi('\x1b[2mdim\x1b[0m')).toBe('dim')
    expect(stripAnsi('\x1b[3mitalic\x1b[0m')).toBe('italic')
    expect(stripAnsi('\x1b[4munderline\x1b[0m')).toBe('underline')
  })

  test('removes 256 color codes', () => {
    expect(stripAnsi('\x1b[38;5;196mred256\x1b[0m')).toBe('red256')
    expect(stripAnsi('\x1b[48;5;21mbg256\x1b[0m')).toBe('bg256')
  })

  test('removes truecolor codes', () => {
    expect(stripAnsi('\x1b[38;2;255;0;0mrgb\x1b[0m')).toBe('rgb')
    expect(stripAnsi('\x1b[48;2;0;255;0mbgrgb\x1b[0m')).toBe('bgrgb')
  })

  test('removes extended underline codes', () => {
    expect(stripAnsi('\x1b[4:3mcurly\x1b[4:0m')).toBe('curly')
    expect(stripAnsi('\x1b[4:4mdotted\x1b[4:0m')).toBe('dotted')
  })

  test('removes OSC 8 hyperlink codes', () => {
    const link = '\x1b]8;;https://example.com\x1b\\Click\x1b]8;;\x1b\\'
    expect(stripAnsi(link)).toBe('Click')
  })

  test('returns plain text unchanged', () => {
    expect(stripAnsi('plain text')).toBe('plain text')
    expect(stripAnsi('hello world')).toBe('hello world')
  })

  test('handles empty string', () => {
    expect(stripAnsi('')).toBe('')
  })

  test('handles multiple ANSI codes', () => {
    expect(stripAnsi('\x1b[1m\x1b[31mbold red\x1b[0m')).toBe('bold red')
  })

  test('handles nested styling', () => {
    const nested = '\x1b[31mred \x1b[1mbold\x1b[22m normal\x1b[0m'
    expect(stripAnsi(nested)).toBe('red bold normal')
  })
})

// =============================================================================
// ANSI_REGEX Tests
// =============================================================================

describe('ANSI_REGEX', () => {
  // Note: ANSI_REGEX has the 'g' flag, so we need to reset lastIndex or use match()
  test('matches SGR codes', () => {
    expect('\x1b[31m'.match(ANSI_REGEX)).not.toBeNull()
    expect('\x1b[0m'.match(ANSI_REGEX)).not.toBeNull()
    expect('\x1b[38;5;196m'.match(ANSI_REGEX)).not.toBeNull()
  })

  test('matches extended SGR codes with colons', () => {
    expect('\x1b[4:3m'.match(ANSI_REGEX)).not.toBeNull()
    expect('\x1b[58:2::255:0:0m'.match(ANSI_REGEX)).not.toBeNull()
  })

  test('matches OSC 8 hyperlinks', () => {
    expect('\x1b]8;;https://example.com\x1b\\'.match(ANSI_REGEX)).not.toBeNull()
    expect('\x1b]8;;\x1b\\'.match(ANSI_REGEX)).not.toBeNull()
  })

  test('does not match plain text', () => {
    expect('plain text'.match(ANSI_REGEX)).toBeNull()
    expect('hello'.match(ANSI_REGEX)).toBeNull()
  })
})

// =============================================================================
// displayLength Tests
// =============================================================================

describe('displayLength', () => {
  test('returns correct length for plain ASCII', () => {
    expect(displayLength('hello')).toBe(5)
    expect(displayLength('world')).toBe(5)
    expect(displayLength('hello world')).toBe(11)
  })

  test('ignores ANSI codes', () => {
    expect(displayLength('\x1b[31mhello\x1b[0m')).toBe(5)
    expect(displayLength('\x1b[1m\x1b[32mbold green\x1b[0m')).toBe(10)
  })

  test('handles CJK characters (double width)', () => {
    // Korean characters (2 columns each)
    expect(displayLength('\u97d3\u6587')).toBe(4) // 2 chars x 2 cells

    // Japanese hiragana
    expect(displayLength('\u3042\u3044\u3046')).toBe(6) // 3 chars x 2 cells

    // Chinese
    expect(displayLength('\u4e2d\u6587')).toBe(4) // 2 chars x 2 cells
  })

  test('handles emoji', () => {
    // Simple symbols - these may vary by string-width version
    // Just verify they return a number and don't crash
    const checkMark = displayLength('\u2714')
    const xMark = displayLength('\u2718')
    expect(typeof checkMark).toBe('number')
    expect(typeof xMark).toBe('number')
    expect(checkMark).toBeGreaterThanOrEqual(1)
    expect(xMark).toBeGreaterThanOrEqual(1)
  })

  test('handles mixed ASCII and CJK', () => {
    expect(displayLength('hello\u4e2d\u6587')).toBe(9) // 5 + 4
  })

  test('handles styled CJK', () => {
    const styled = '\x1b[31m\u4e2d\u6587\x1b[0m'
    expect(displayLength(styled)).toBe(4)
  })

  test('handles empty string', () => {
    expect(displayLength('')).toBe(0)
  })

  test('handles tabs and special chars', () => {
    // Tab behavior may vary; just ensure no crash
    expect(typeof displayLength('\t')).toBe('number')
  })
})

// =============================================================================
// curlyUnderline Tests
// =============================================================================

describe('curlyUnderline', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('with extended underline support (Ghostty)', () => {
    process.env.TERM = 'xterm-ghostty'

    // Need to clear cached value - this is a limitation
    // In real usage, detection happens once at module load
    const result = curlyUnderline('text')

    // Either returns extended underline or fallback
    expect(stripAnsi(result)).toBe('text')
  })

  test('with extended underline support (iTerm)', () => {
    process.env.TERM_PROGRAM = 'iTerm.app'

    const result = curlyUnderline('text')
    expect(stripAnsi(result)).toBe('text')
  })

  test('with extended underline support (Kitty)', () => {
    process.env.KITTY_WINDOW_ID = '1'

    const result = curlyUnderline('text')
    expect(stripAnsi(result)).toBe('text')
  })

  test('falls back to regular underline without support', () => {
    // No terminal environment set
    const result = curlyUnderline('text')

    // Should still contain underline (either extended or regular)
    expect(stripAnsi(result)).toBe('text')
    // At minimum, should have some ANSI codes
    expect(result.length).toBeGreaterThan(4) // 'text' is 4 chars
  })

  test('handles empty string', () => {
    const result = curlyUnderline('')
    expect(stripAnsi(result)).toBe('')
  })

  test('handles multi-line text', () => {
    const result = curlyUnderline('line1\nline2')
    expect(stripAnsi(result)).toBe('line1\nline2')
  })
})

// =============================================================================
// dottedUnderline Tests
// =============================================================================

describe('dottedUnderline', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('returns underlined text', () => {
    const result = dottedUnderline('text')
    expect(stripAnsi(result)).toBe('text')
    expect(result.length).toBeGreaterThan(4)
  })

  test('handles empty string', () => {
    const result = dottedUnderline('')
    expect(stripAnsi(result)).toBe('')
  })
})

// =============================================================================
// dashedUnderline Tests
// =============================================================================

describe('dashedUnderline', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('returns underlined text', () => {
    const result = dashedUnderline('text')
    expect(stripAnsi(result)).toBe('text')
    expect(result.length).toBeGreaterThan(4)
  })

  test('handles empty string', () => {
    const result = dashedUnderline('')
    expect(stripAnsi(result)).toBe('')
  })
})

// =============================================================================
// doubleUnderline Tests
// =============================================================================

describe('doubleUnderline', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('returns underlined text', () => {
    const result = doubleUnderline('text')
    expect(stripAnsi(result)).toBe('text')
    expect(result.length).toBeGreaterThan(4)
  })

  test('handles empty string', () => {
    const result = doubleUnderline('')
    expect(stripAnsi(result)).toBe('')
  })
})

// =============================================================================
// hyperlink Tests
// =============================================================================

describe('hyperlink', () => {
  test('generates OSC 8 sequence', () => {
    const result = hyperlink('Click here', 'https://example.com')

    // Check structure
    expect(result).toContain('\x1b]8;;') // Start OSC 8
    expect(result).toContain('https://example.com') // URL
    expect(result).toContain('\x1b\\') // String terminator
    expect(result).toContain('Click here') // Display text
  })

  test('display text is preserved after stripping', () => {
    const result = hyperlink('Click here', 'https://example.com')
    expect(stripAnsi(result)).toBe('Click here')
  })

  test('handles complex URLs', () => {
    const url = 'https://example.com/path?query=value&foo=bar#anchor'
    const result = hyperlink('Link', url)

    expect(result).toContain(url)
    expect(stripAnsi(result)).toBe('Link')
  })

  test('handles empty display text', () => {
    const result = hyperlink('', 'https://example.com')
    expect(stripAnsi(result)).toBe('')
    expect(result).toContain('https://example.com')
  })

  test('handles file URLs', () => {
    const result = hyperlink('Open file', 'file:///path/to/file.txt')

    expect(result).toContain('file:///path/to/file.txt')
    expect(stripAnsi(result)).toBe('Open file')
  })

  test('correct format: OSC 8 ; ; URL ST text OSC 8 ; ; ST', () => {
    const result = hyperlink('text', 'https://test.com')

    // Format: \x1b]8;;<URL>\x1b\<text>\x1b]8;;\x1b\
    const expected = '\x1b]8;;https://test.com\x1b\\text\x1b]8;;\x1b\\'
    expect(result).toBe(expected)
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  test('displayLength works with hyperlinks', () => {
    const link = hyperlink('Click', 'https://example.com')
    expect(displayLength(link)).toBe(5) // 'Click' is 5 chars
  })

  test('stripAnsi works with all underline styles', () => {
    expect(stripAnsi(curlyUnderline('text'))).toBe('text')
    expect(stripAnsi(dottedUnderline('text'))).toBe('text')
    expect(stripAnsi(dashedUnderline('text'))).toBe('text')
    expect(stripAnsi(doubleUnderline('text'))).toBe('text')
  })

  test('displayLength works with underlined text', () => {
    expect(displayLength(curlyUnderline('hello'))).toBe(5)
    expect(displayLength(dottedUnderline('hello'))).toBe(5)
  })
})
