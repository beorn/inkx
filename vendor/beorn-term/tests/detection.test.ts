/**
 * Tests for terminal detection functions.
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import {
  detectCursor,
  detectInput,
  detectColor,
  detectUnicode,
  detectExtendedUnderline,
} from '../src/index.js'

// =============================================================================
// Mock Stream Factories
// =============================================================================

function createMockStdout(options: { isTTY?: boolean; columns?: number; rows?: number } = {}) {
  return {
    isTTY: options.isTTY ?? false,
    columns: options.columns,
    rows: options.rows,
    write: mock(() => true),
  } as unknown as NodeJS.WriteStream
}

function createMockStdin(options: { isTTY?: boolean; setRawMode?: boolean } = {}) {
  const stdin = {
    isTTY: options.isTTY ?? false,
  } as unknown as NodeJS.ReadStream

  if (options.setRawMode) {
    (stdin as NodeJS.ReadStream & { setRawMode: (mode: boolean) => void }).setRawMode = mock(() => {})
  }

  return stdin
}

// =============================================================================
// Environment Helpers
// =============================================================================

let originalEnv: Record<string, string | undefined>

function saveEnv() {
  originalEnv = {
    TERM: process.env.TERM,
    NO_COLOR: process.env.NO_COLOR,
    FORCE_COLOR: process.env.FORCE_COLOR,
    COLORTERM: process.env.COLORTERM,
    TERM_PROGRAM: process.env.TERM_PROGRAM,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    LC_CTYPE: process.env.LC_CTYPE,
    CI: process.env.CI,
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
    KITTY_WINDOW_ID: process.env.KITTY_WINDOW_ID,
    WT_SESSION: process.env.WT_SESSION,
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
  const keys = [
    'TERM', 'NO_COLOR', 'FORCE_COLOR', 'COLORTERM', 'TERM_PROGRAM',
    'LANG', 'LC_ALL', 'LC_CTYPE', 'CI', 'GITHUB_ACTIONS', 'KITTY_WINDOW_ID',
    'WT_SESSION', 'GITLAB_CI', 'JENKINS_URL', 'BUILDKITE', 'CIRCLECI', 'TRAVIS',
  ]
  for (const key of keys) {
    delete process.env[key]
  }
}

// =============================================================================
// detectCursor Tests
// =============================================================================

describe('detectCursor', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('returns true for TTY stdout', () => {
    const stdout = createMockStdout({ isTTY: true })
    expect(detectCursor(stdout)).toBe(true)
  })

  test('returns false for non-TTY stdout (piped output)', () => {
    const stdout = createMockStdout({ isTTY: false })
    expect(detectCursor(stdout)).toBe(false)
  })

  test('returns false for dumb terminal', () => {
    process.env.TERM = 'dumb'
    const stdout = createMockStdout({ isTTY: true })
    expect(detectCursor(stdout)).toBe(false)
  })

  test('returns true for xterm', () => {
    process.env.TERM = 'xterm-256color'
    const stdout = createMockStdout({ isTTY: true })
    expect(detectCursor(stdout)).toBe(true)
  })
})

// =============================================================================
// detectInput Tests
// =============================================================================

describe('detectInput', () => {
  test('returns false for non-TTY stdin', () => {
    const stdin = createMockStdin({ isTTY: false })
    expect(detectInput(stdin)).toBe(false)
  })

  test('returns false for TTY stdin without setRawMode', () => {
    const stdin = createMockStdin({ isTTY: true, setRawMode: false })
    expect(detectInput(stdin)).toBe(false)
  })

  test('returns true for TTY stdin with setRawMode', () => {
    const stdin = createMockStdin({ isTTY: true, setRawMode: true })
    expect(detectInput(stdin)).toBe(true)
  })
})

// =============================================================================
// detectColor Tests
// =============================================================================

describe('detectColor', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  describe('NO_COLOR', () => {
    test('returns null when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe(null)
    })

    test('returns null when NO_COLOR is empty string', () => {
      process.env.NO_COLOR = ''
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe(null)
    })
  })

  describe('FORCE_COLOR', () => {
    test('returns null for FORCE_COLOR=0', () => {
      process.env.FORCE_COLOR = '0'
      const stdout = createMockStdout({ isTTY: false })
      expect(detectColor(stdout)).toBe(null)
    })

    test('returns null for FORCE_COLOR=false', () => {
      process.env.FORCE_COLOR = 'false'
      const stdout = createMockStdout({ isTTY: false })
      expect(detectColor(stdout)).toBe(null)
    })

    test('returns basic for FORCE_COLOR=1', () => {
      process.env.FORCE_COLOR = '1'
      const stdout = createMockStdout({ isTTY: false })
      expect(detectColor(stdout)).toBe('basic')
    })

    test('returns 256 for FORCE_COLOR=2', () => {
      process.env.FORCE_COLOR = '2'
      const stdout = createMockStdout({ isTTY: false })
      expect(detectColor(stdout)).toBe('256')
    })

    test('returns truecolor for FORCE_COLOR=3', () => {
      process.env.FORCE_COLOR = '3'
      const stdout = createMockStdout({ isTTY: false })
      expect(detectColor(stdout)).toBe('truecolor')
    })

    test('returns basic for FORCE_COLOR=true', () => {
      process.env.FORCE_COLOR = 'true'
      const stdout = createMockStdout({ isTTY: false })
      expect(detectColor(stdout)).toBe('basic')
    })
  })

  describe('non-TTY', () => {
    test('returns null for non-TTY without FORCE_COLOR', () => {
      const stdout = createMockStdout({ isTTY: false })
      expect(detectColor(stdout)).toBe(null)
    })
  })

  describe('COLORTERM', () => {
    test('returns truecolor for COLORTERM=truecolor', () => {
      process.env.COLORTERM = 'truecolor'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })

    test('returns truecolor for COLORTERM=24bit', () => {
      process.env.COLORTERM = '24bit'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })
  })

  describe('TERM', () => {
    test('returns null for TERM=dumb', () => {
      process.env.TERM = 'dumb'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe(null)
    })

    test('returns truecolor for xterm-ghostty', () => {
      process.env.TERM = 'xterm-ghostty'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })

    test('returns truecolor for xterm-kitty', () => {
      process.env.TERM = 'xterm-kitty'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })

    test('returns 256 for xterm-256color', () => {
      process.env.TERM = 'xterm-256color'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('256')
    })

    test('returns basic for xterm', () => {
      process.env.TERM = 'xterm'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('basic')
    })
  })

  describe('TERM_PROGRAM', () => {
    test('returns truecolor for iTerm.app', () => {
      process.env.TERM_PROGRAM = 'iTerm.app'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })

    test('returns 256 for Apple_Terminal', () => {
      process.env.TERM_PROGRAM = 'Apple_Terminal'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('256')
    })

    test('returns truecolor for Ghostty', () => {
      process.env.TERM_PROGRAM = 'Ghostty'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })

    test('returns truecolor for WezTerm', () => {
      process.env.TERM_PROGRAM = 'WezTerm'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })
  })

  describe('KITTY_WINDOW_ID', () => {
    test('returns truecolor for Kitty', () => {
      process.env.KITTY_WINDOW_ID = '1'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })
  })

  describe('CI environments', () => {
    test('returns basic for CI=true', () => {
      process.env.CI = 'true'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('basic')
    })

    test('returns basic for GITHUB_ACTIONS', () => {
      process.env.GITHUB_ACTIONS = 'true'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('basic')
    })
  })

  describe('Windows Terminal', () => {
    test('returns truecolor for WT_SESSION', () => {
      process.env.WT_SESSION = 'some-session-id'
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('truecolor')
    })
  })

  describe('default', () => {
    test('returns basic for unknown TTY', () => {
      const stdout = createMockStdout({ isTTY: true })
      expect(detectColor(stdout)).toBe('basic')
    })
  })
})

// =============================================================================
// detectUnicode Tests
// =============================================================================

describe('detectUnicode', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  describe('LANG', () => {
    test('returns true for LANG=en_US.UTF-8', () => {
      process.env.LANG = 'en_US.UTF-8'
      expect(detectUnicode()).toBe(true)
    })

    test('returns true for LANG=C.utf8', () => {
      process.env.LANG = 'C.utf8'
      expect(detectUnicode()).toBe(true)
    })

    test('returns false for LANG without UTF-8', () => {
      process.env.LANG = 'C'
      expect(detectUnicode()).toBe(false)
    })
  })

  describe('LC_ALL', () => {
    test('returns true for LC_ALL=en_US.UTF-8', () => {
      process.env.LC_ALL = 'en_US.UTF-8'
      expect(detectUnicode()).toBe(true)
    })
  })

  describe('TERM_PROGRAM', () => {
    test('returns true for iTerm.app', () => {
      process.env.TERM_PROGRAM = 'iTerm.app'
      expect(detectUnicode()).toBe(true)
    })

    test('returns true for Ghostty', () => {
      process.env.TERM_PROGRAM = 'Ghostty'
      expect(detectUnicode()).toBe(true)
    })

    test('returns true for WezTerm', () => {
      process.env.TERM_PROGRAM = 'WezTerm'
      expect(detectUnicode()).toBe(true)
    })

    test('returns true for Apple_Terminal', () => {
      process.env.TERM_PROGRAM = 'Apple_Terminal'
      expect(detectUnicode()).toBe(true)
    })
  })

  describe('KITTY_WINDOW_ID', () => {
    test('returns true for Kitty', () => {
      process.env.KITTY_WINDOW_ID = '1'
      expect(detectUnicode()).toBe(true)
    })
  })

  describe('TERM', () => {
    test('returns true for xterm', () => {
      process.env.TERM = 'xterm-256color'
      expect(detectUnicode()).toBe(true)
    })

    test('returns true for screen', () => {
      process.env.TERM = 'screen'
      expect(detectUnicode()).toBe(true)
    })

    test('returns true for tmux', () => {
      process.env.TERM = 'tmux-256color'
      expect(detectUnicode()).toBe(true)
    })
  })

  describe('Windows Terminal', () => {
    test('returns true for WT_SESSION', () => {
      process.env.WT_SESSION = 'some-session-id'
      expect(detectUnicode()).toBe(true)
    })
  })

  describe('CI', () => {
    test('returns true for GitHub Actions', () => {
      process.env.CI = 'true'
      process.env.GITHUB_ACTIONS = 'true'
      expect(detectUnicode()).toBe(true)
    })
  })

  describe('default', () => {
    test('returns false for unknown environment', () => {
      expect(detectUnicode()).toBe(false)
    })
  })
})

// =============================================================================
// detectExtendedUnderline Tests
// =============================================================================

describe('detectExtendedUnderline', () => {
  beforeEach(() => {
    saveEnv()
    clearEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  describe('TERM', () => {
    test('returns true for xterm-ghostty', () => {
      process.env.TERM = 'xterm-ghostty'
      expect(detectExtendedUnderline()).toBe(true)
    })

    test('returns true for xterm-kitty', () => {
      process.env.TERM = 'xterm-kitty'
      expect(detectExtendedUnderline()).toBe(true)
    })

    test('returns true for wezterm', () => {
      process.env.TERM = 'wezterm'
      expect(detectExtendedUnderline()).toBe(true)
    })

    test('returns true for xterm-256color', () => {
      process.env.TERM = 'xterm-256color'
      expect(detectExtendedUnderline()).toBe(true)
    })
  })

  describe('TERM_PROGRAM', () => {
    test('returns true for Ghostty', () => {
      process.env.TERM_PROGRAM = 'Ghostty'
      expect(detectExtendedUnderline()).toBe(true)
    })

    test('returns true for iTerm.app', () => {
      process.env.TERM_PROGRAM = 'iTerm.app'
      expect(detectExtendedUnderline()).toBe(true)
    })

    test('returns true for WezTerm', () => {
      process.env.TERM_PROGRAM = 'WezTerm'
      expect(detectExtendedUnderline()).toBe(true)
    })

    test('returns false for Apple_Terminal', () => {
      process.env.TERM_PROGRAM = 'Apple_Terminal'
      expect(detectExtendedUnderline()).toBe(false)
    })
  })

  describe('KITTY_WINDOW_ID', () => {
    test('returns true for Kitty', () => {
      process.env.KITTY_WINDOW_ID = '1'
      expect(detectExtendedUnderline()).toBe(true)
    })
  })

  describe('default', () => {
    test('returns false for unknown terminal', () => {
      expect(detectExtendedUnderline()).toBe(false)
    })
  })
})
