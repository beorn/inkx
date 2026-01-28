/**
 * Tests for @beorn/tui Console component
 *
 * Tests:
 * - Console renders entries from PatchedConsole
 * - Custom render function works
 * - Updates when new entries arrive
 *
 * Note: Uses a mock console object to avoid triggering the project's
 * "tests must be silent" policy in bun-test-setup.ts.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { Console, Box, Text, initYogaEngine } from '../src/index.js'
import { patchConsole } from '../../beorn-term/src/index.js'
import type { PatchedConsole, ConsoleEntry } from '../../beorn-term/src/index.js'
import { createTestRenderer } from '../../beorn-inkx/src/testing/index.js'

// Initialize yoga engine before tests
await initYogaEngine()

// Create test renderer
const render = createTestRenderer({ columns: 80, rows: 24 })

// ============================================================================
// Mock Console Helper
// ============================================================================

/**
 * Create a mock console object that can be patched without affecting the real console.
 * This allows us to test console-related functionality without triggering
 * the project's "tests must be silent" policy.
 */
function createMockConsole(): Console {
  return {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    // Add other console methods as no-ops
    assert: () => {},
    clear: () => {},
    count: () => {},
    countReset: () => {},
    dir: () => {},
    dirxml: () => {},
    group: () => {},
    groupCollapsed: () => {},
    groupEnd: () => {},
    table: () => {},
    time: () => {},
    timeEnd: () => {},
    timeLog: () => {},
    timeStamp: () => {},
    trace: () => {},
    profile: () => {},
    profileEnd: () => {},
    Console: console.Console,
  } as Console
}

// ============================================================================
// Console Basic Rendering Tests
// ============================================================================

describe('Console component', () => {
  let mockConsole: Console
  let patched: PatchedConsole

  beforeEach(() => {
    mockConsole = createMockConsole()
    patched = patchConsole(mockConsole)
  })

  afterEach(() => {
    patched[Symbol.dispose]()
  })

  test('Console renders entries from PatchedConsole', () => {
    // Add some console entries
    mockConsole.log('Hello from console')
    mockConsole.log('Second message')

    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()
    expect(output).toContain('Hello from console')
    expect(output).toContain('Second message')
  })

  test('Console renders empty when no entries', () => {
    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()
    // Should render without error, may be empty or have minimal content
    expect(typeof output).toBe('string')
  })

  test('Console renders different console methods', () => {
    mockConsole.log('Log message')
    mockConsole.info('Info message')
    mockConsole.warn('Warn message')
    mockConsole.error('Error message')
    mockConsole.debug('Debug message')

    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()
    expect(output).toContain('Log message')
    expect(output).toContain('Info message')
    expect(output).toContain('Warn message')
    expect(output).toContain('Error message')
    expect(output).toContain('Debug message')
  })

  test('Console renders multiple arguments joined with spaces', () => {
    mockConsole.log('First', 'Second', 'Third')

    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()
    expect(output).toContain('First Second Third')
  })

  test('Console renders objects as JSON', () => {
    mockConsole.log('Object:', { name: 'test', value: 42 })

    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()
    expect(output).toContain('name')
    expect(output).toContain('test')
    expect(output).toContain('42')
  })

  test('Console renders numbers and booleans', () => {
    mockConsole.log('Number:', 42, 'Boolean:', true, false)

    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()
    expect(output).toContain('42')
    expect(output).toContain('true')
    expect(output).toContain('false')
  })

  test('Console renders null and undefined', () => {
    mockConsole.log('Null:', null, 'Undefined:', undefined)

    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()
    expect(output).toContain('null')
    expect(output).toContain('undefined')
  })
})

// ============================================================================
// Console Custom Render Function Tests
// ============================================================================

describe('Console custom render function', () => {
  let mockConsole: Console
  let patched: PatchedConsole

  beforeEach(() => {
    mockConsole = createMockConsole()
    patched = patchConsole(mockConsole)
  })

  afterEach(() => {
    patched[Symbol.dispose]()
  })

  test('custom render function receives entry and index', () => {
    mockConsole.log('Test message')

    const capturedEntries: Array<{ entry: ConsoleEntry; index: number }> = []

    render(
      <Console console={patched}>
        {(entry, index) => {
          capturedEntries.push({ entry, index })
          return <Text key={index}>{entry.args.join(' ')}</Text>
        }}
      </Console>
    )

    expect(capturedEntries.length).toBe(1)
    expect(capturedEntries[0].index).toBe(0)
    expect(capturedEntries[0].entry.method).toBe('log')
    expect(capturedEntries[0].entry.args).toEqual(['Test message'])
  })

  test('custom render function can style output', () => {
    mockConsole.error('Error occurred')

    const { lastFrame } = render(
      <Console console={patched}>
        {(entry, index) => (
          <Text key={index} color={entry.stream === 'stderr' ? 'red' : 'green'}>
            [{entry.method}] {entry.args.join(' ')}
          </Text>
        )}
      </Console>
    )

    const output = lastFrame()
    // Should contain the formatted output
    expect(output).toContain('[error]')
    expect(output).toContain('Error occurred')
  })

  test('custom render function with multiple entries', () => {
    mockConsole.log('First')
    mockConsole.warn('Second')
    mockConsole.error('Third')

    const indices: number[] = []

    render(
      <Console console={patched}>
        {(entry, index) => {
          indices.push(index)
          return <Text key={index}>{`${index}: ${entry.args[0]}`}</Text>
        }}
      </Console>
    )

    expect(indices).toEqual([0, 1, 2])
  })

  test('custom render can access entry.stream property', () => {
    mockConsole.log('stdout message')
    mockConsole.error('stderr message')

    const streams: string[] = []

    render(
      <Console console={patched}>
        {(entry, index) => {
          streams.push(entry.stream)
          return <Text key={index}>{entry.args.join(' ')}</Text>
        }}
      </Console>
    )

    expect(streams).toEqual(['stdout', 'stderr'])
  })

  test('custom render can access entry.method property', () => {
    mockConsole.log('log')
    mockConsole.info('info')
    mockConsole.warn('warn')
    mockConsole.error('error')

    const methods: string[] = []

    render(
      <Console console={patched}>
        {(entry, index) => {
          methods.push(entry.method)
          return <Text key={index}>{entry.args.join(' ')}</Text>
        }}
      </Console>
    )

    expect(methods).toEqual(['log', 'info', 'warn', 'error'])
  })
})

// ============================================================================
// Console Updates Tests
// ============================================================================

describe('Console updates', () => {
  let mockConsole: Console
  let patched: PatchedConsole

  beforeEach(() => {
    mockConsole = createMockConsole()
    patched = patchConsole(mockConsole)
  })

  afterEach(() => {
    patched[Symbol.dispose]()
  })

  test('Console updates when new entries arrive', () => {
    const { lastFrameText, rerender } = render(<Console console={patched} />)

    // Initial state - no entries
    let output = lastFrameText()

    // Add an entry
    mockConsole.log('New entry')

    // Rerender to pick up the new entry
    rerender(<Console console={patched} />)

    output = lastFrameText()
    expect(output).toContain('New entry')
  })

  test('Console shows entries in order', () => {
    mockConsole.log('First')
    mockConsole.log('Second')
    mockConsole.log('Third')

    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()!
    const lines = output.split('\n')

    const firstIndex = lines.findIndex(l => l.includes('First'))
    const secondIndex = lines.findIndex(l => l.includes('Second'))
    const thirdIndex = lines.findIndex(l => l.includes('Third'))

    expect(firstIndex).toBeLessThan(secondIndex)
    expect(secondIndex).toBeLessThan(thirdIndex)
  })

  test('Console accumulates entries over time', () => {
    mockConsole.log('Entry 1')

    const { lastFrameText, rerender } = render(<Console console={patched} />)

    let output = lastFrameText()
    expect(output).toContain('Entry 1')

    mockConsole.log('Entry 2')
    rerender(<Console console={patched} />)

    output = lastFrameText()
    expect(output).toContain('Entry 1')
    expect(output).toContain('Entry 2')

    mockConsole.log('Entry 3')
    rerender(<Console console={patched} />)

    output = lastFrameText()
    expect(output).toContain('Entry 1')
    expect(output).toContain('Entry 2')
    expect(output).toContain('Entry 3')
  })
})

// ============================================================================
// Console with Box Layout Tests
// ============================================================================

describe('Console with Box layout', () => {
  let mockConsole: Console
  let patched: PatchedConsole

  beforeEach(() => {
    mockConsole = createMockConsole()
    patched = patchConsole(mockConsole)
  })

  afterEach(() => {
    patched[Symbol.dispose]()
  })

  test('Console works inside Box', () => {
    mockConsole.log('Inside box')

    const { lastFrameText } = render(
      <Box flexDirection="column">
        <Console console={patched} />
      </Box>
    )

    const output = lastFrameText()
    expect(output).toContain('Inside box')
  })

  test('Console works alongside other components', () => {
    mockConsole.log('Console output')

    const { lastFrameText } = render(
      <Box flexDirection="column">
        <Text>Header</Text>
        <Console console={patched} />
        <Text>Footer</Text>
      </Box>
    )

    const output = lastFrameText()
    expect(output).toContain('Header')
    expect(output).toContain('Console output')
    expect(output).toContain('Footer')
  })

  test('Console renders column layout by default', () => {
    mockConsole.log('Line 1')
    mockConsole.log('Line 2')

    const { lastFrameText } = render(<Console console={patched} />)

    const output = lastFrameText()!
    const lines = output.split('\n')

    // Each entry should be on its own line
    const line1Row = lines.findIndex(l => l.includes('Line 1'))
    const line2Row = lines.findIndex(l => l.includes('Line 2'))

    expect(line1Row).not.toBe(line2Row)
    expect(line1Row).toBeLessThan(line2Row)
  })
})

// ============================================================================
// Console Error/Warn Styling Tests
// ============================================================================

describe('Console error/warn styling', () => {
  let mockConsole: Console
  let patched: PatchedConsole

  beforeEach(() => {
    mockConsole = createMockConsole()
    patched = patchConsole(mockConsole)
  })

  afterEach(() => {
    patched[Symbol.dispose]()
  })

  test('stderr entries (error, warn) are styled differently', () => {
    mockConsole.log('Normal log')
    mockConsole.error('Error message')

    const { lastFrame } = render(<Console console={patched} />)

    // Both messages should be present
    const output = lastFrame()!
    expect(output).toContain('Normal log')
    expect(output).toContain('Error message')

    // The default renderer applies red color to stderr
    // We can check that both are present; actual color testing
    // would require checking ANSI codes
  })
})
