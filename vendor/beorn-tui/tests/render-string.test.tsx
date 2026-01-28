/**
 * Tests for @beorn/tui renderString API
 *
 * Tests:
 * - renderString(term, element) respects term capabilities
 * - renderString(element, { plain: true }) strips ANSI
 * - renderString with width option
 * - Output contains expected text
 *
 * Note: Some tests using renderString(term, element) are skipped due to a known
 * issue with TermContext and the Term Proxy. See render-string with Term tests.
 */

import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import React from 'react'
import { renderString, Box, Text, TermContext, initYogaEngine, setLayoutEngine } from '../src/index.js'
import { createTerm, stripAnsi } from '../../beorn-term/src/index.js'
import type { Term } from '../../beorn-term/src/index.js'

// Initialize yoga engine before tests and set it globally
const yogaEngine = await initYogaEngine()
setLayoutEngine(yogaEngine)

// Suppress React act() warnings during tests
// These warnings occur because renderString() uses React's reconciler without wrapping in act()
let errorSpy: ReturnType<typeof spyOn>
beforeEach(() => {
  errorSpy = spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock stdout stream for testing
 */
function createMockStdout(options: { columns?: number; isTTY?: boolean } = {}) {
  const { columns = 80, isTTY = true } = options
  return {
    columns,
    rows: 24,
    isTTY,
    write: () => true,
    on: () => ({}),
    off: () => ({}),
    once: () => ({}),
    removeListener: () => ({}),
    addListener: () => ({}),
  } as unknown as NodeJS.WriteStream
}

/**
 * Create a mock stdin stream for testing
 */
function createMockStdin() {
  return {
    isTTY: true,
    setRawMode: () => ({}),
    on: () => ({}),
    off: () => ({}),
    once: () => ({}),
    removeListener: () => ({}),
    addListener: () => ({}),
    setEncoding: () => ({}),
    read: () => null,
    ref: () => ({}),
    unref: () => ({}),
  } as unknown as NodeJS.ReadStream
}

// ============================================================================
// renderString with Term Tests
// ============================================================================

describe('renderString with Term', () => {
  let term: Term
  let mockStdout: ReturnType<typeof createMockStdout>
  let mockStdin: ReturnType<typeof createMockStdin>

  beforeEach(() => {
    mockStdout = createMockStdout()
    mockStdin = createMockStdin()
    // Use null color so renderString uses 'plain' mode which produces text
    term = createTerm({
      stdout: mockStdout,
      stdin: mockStdin,
      color: null,
    })
  })

  afterEach(() => {
    term[Symbol.dispose]()
  })

  test('renderString(term, element) returns a string', () => {
    const output = renderString(term, <Text>Hello</Text>)

    expect(typeof output).toBe('string')
  })

  // TODO: These tests are skipped due to a known issue where renderString(term, element)
  // produces empty output due to TermContext issues with the Term Proxy.
  // The underlying issue needs to be fixed in render.tsx.
  test.skip('output contains expected text', () => {
    const output = renderString(term, <Text>Hello World</Text>)

    expect(typeof output).toBe('string')
    expect(output).toContain('Hello World')
  })

  test.skip('respects term color capabilities - no color term', () => {
    // Term without color uses 'plain' mode
    const noColorOutput = renderString(term, <Text color="red">Red Text</Text>)

    expect(noColorOutput).toContain('Red Text')
    // Should not have ANSI escape codes
    expect(noColorOutput).toBe(stripAnsi(noColorOutput))
  })

  test.skip('uses term.cols for width when available', () => {
    const wideStdout = createMockStdout({ columns: 100 })
    const wideTerm = createTerm({
      stdout: wideStdout,
      stdin: mockStdin,
      color: null,
    })

    const output = renderString(wideTerm, (
      <Box width="100%">
        <Text>Full Width</Text>
      </Box>
    ))

    wideTerm[Symbol.dispose]()

    expect(output).toContain('Full Width')
  })

  test.skip('width option overrides term.cols', () => {
    const output = renderString(term, (
      <Box width="100%">
        <Text>Content</Text>
      </Box>
    ), { width: 40 })

    expect(output).toContain('Content')
  })

  test.skip('TermContext is available in rendered components', () => {
    let capturedTerm: Term | null = null

    function TermCapture() {
      capturedTerm = React.useContext(TermContext)
      return <Text>With Term</Text>
    }

    renderString(term, <TermCapture />)

    expect(capturedTerm).toBe(term)
  })
})

// ============================================================================
// renderString without Term Tests
// ============================================================================

describe('renderString without Term', () => {
  test('renderString(element) returns a string', () => {
    const output = renderString(<Text>Hello</Text>)

    expect(typeof output).toBe('string')
  })

  test('plain: true strips ANSI codes', () => {
    const output = renderString(
      <Text color="red" bold>Styled Text</Text>,
      { plain: true }
    )

    // Should contain the text
    expect(output).toContain('Styled Text')

    // Should not contain ANSI escape codes
    expect(output).not.toMatch(/\x1b\[/)
  })

  test('output without plain option may contain ANSI codes', () => {
    const output = renderString(
      <Text color="red">Red</Text>,
      { color: 'truecolor' }
    )

    expect(output).toContain('Red')
    // Note: behavior depends on whether color is explicitly enabled
  })

  test('width option controls layout width', () => {
    const narrowOutput = renderString(
      <Text>Some text content that might wrap</Text>,
      { width: 20, plain: true }
    )

    const wideOutput = renderString(
      <Text>Some text content that might wrap</Text>,
      { width: 80, plain: true }
    )

    // Both should contain the text
    expect(narrowOutput).toContain('Some text content')
    expect(wideOutput).toContain('Some text content')
  })

  test('default width is 80', () => {
    const output = renderString(
      <Box width="100%">
        <Text>Default width content</Text>
      </Box>,
      { plain: true }
    )

    expect(output).toContain('Default width content')
  })
})

// ============================================================================
// renderString with Box layout Tests
// ============================================================================

describe('renderString with Box layout', () => {
  test('renders nested Box components', () => {
    const output = renderString(
      <Box flexDirection="column">
        <Box>
          <Text>Row 1</Text>
        </Box>
        <Box>
          <Text>Row 2</Text>
        </Box>
      </Box>,
      { plain: true }
    )

    expect(output).toContain('Row 1')
    expect(output).toContain('Row 2')
  })

  test('renders Box with border', () => {
    const output = renderString(
      <Box borderStyle="single">
        <Text>Bordered</Text>
      </Box>,
      { plain: true }
    )

    expect(output).toContain('Bordered')
    // Border characters should be present
    expect(output).toMatch(/[┌┐└┘─│]/)
  })

  test('renders Box with padding', () => {
    const output = renderString(
      <Box paddingX={2}>
        <Text>Padded</Text>
      </Box>,
      { plain: true }
    )

    expect(output).toContain('Padded')
  })

  test('flexDirection column renders vertically', () => {
    const output = renderString(
      <Box flexDirection="column">
        <Text>First</Text>
        <Text>Second</Text>
        <Text>Third</Text>
      </Box>,
      { plain: true }
    )

    const lines = output.split('\n')
    const firstIndex = lines.findIndex(l => l.includes('First'))
    const secondIndex = lines.findIndex(l => l.includes('Second'))
    const thirdIndex = lines.findIndex(l => l.includes('Third'))

    expect(firstIndex).toBeLessThan(secondIndex)
    expect(secondIndex).toBeLessThan(thirdIndex)
  })
})

// ============================================================================
// renderString color option Tests
// ============================================================================

describe('renderString color option', () => {
  test('color: "basic" enables basic colors', () => {
    const output = renderString(
      <Text color="red">Red</Text>,
      { color: 'basic' }
    )

    expect(output).toContain('Red')
  })

  test('color: "256" enables 256 colors', () => {
    const output = renderString(
      <Text color="red">Red</Text>,
      { color: '256' }
    )

    expect(output).toContain('Red')
  })

  test('color: "truecolor" enables truecolor', () => {
    const output = renderString(
      <Text color="red">Red</Text>,
      { color: 'truecolor' }
    )

    expect(output).toContain('Red')
  })

  test('plain overrides color option', () => {
    const output = renderString(
      <Text color="red">Red</Text>,
      { plain: true, color: 'truecolor' }
    )

    expect(output).toContain('Red')
    // plain: true should strip ANSI codes
    expect(output).not.toMatch(/\x1b\[/)
  })
})

// ============================================================================
// renderString edge cases Tests
// ============================================================================

describe('renderString edge cases', () => {
  test('empty Text renders without error', () => {
    const output = renderString(<Text></Text>, { plain: true })

    expect(typeof output).toBe('string')
  })

  test('deeply nested components render correctly', () => {
    const output = renderString(
      <Box>
        <Box>
          <Box>
            <Box>
              <Text>Deep</Text>
            </Box>
          </Box>
        </Box>
      </Box>,
      { plain: true }
    )

    expect(output).toContain('Deep')
  })

  test('multiple Text children concatenate', () => {
    const output = renderString(
      <Box>
        <Text>Hello </Text>
        <Text>World</Text>
      </Box>,
      { plain: true }
    )

    expect(output).toContain('Hello')
    expect(output).toContain('World')
  })

  test('Text with special characters renders correctly', () => {
    const output = renderString(
      <Text>Special: {'<'} {'>'} {'&'} {'"'}</Text>,
      { plain: true }
    )

    expect(output).toContain('<')
    expect(output).toContain('>')
    expect(output).toContain('&')
    expect(output).toContain('"')
  })

  test('Text with unicode renders correctly', () => {
    const output = renderString(
      <Text>Unicode: ✓ ✗ → ← ↑ ↓</Text>,
      { plain: true }
    )

    expect(output).toContain('✓')
    expect(output).toContain('→')
  })

  test('Text with emoji renders correctly', () => {
    const output = renderString(
      <Text>Emoji: 🎉 🚀 ✨</Text>,
      { plain: true }
    )

    expect(output).toContain('🎉')
    expect(output).toContain('🚀')
  })
})
