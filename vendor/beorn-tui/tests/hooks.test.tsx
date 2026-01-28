/**
 * Tests for @beorn/tui hooks
 *
 * Tests:
 * - useTerm() returns term from context
 * - useTerm() throws outside render context
 * - useConsole() subscribes to PatchedConsole
 * - useConsole() re-renders on new entries
 *
 * Note: Uses a mock console object to avoid triggering the project's
 * "tests must be silent" policy in bun-test-setup.ts.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { useTerm, useConsole, TermContext, Box, Text, initYogaEngine } from '../src/index.js'
import { createTerm, patchConsole } from '../../beorn-term/src/index.js'
import type { Term, PatchedConsole, ConsoleEntry } from '../../beorn-term/src/index.js'
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
// useTerm Tests
// ============================================================================

describe('useTerm', () => {
  test('useTerm() returns term from context', () => {
    let capturedTerm: Term | null = null

    // Create a mock term
    const mockStdout = {
      columns: 80,
      rows: 24,
      isTTY: true,
      write: () => true,
      on: () => ({}),
      off: () => ({}),
      once: () => ({}),
      removeListener: () => ({}),
      addListener: () => ({}),
    } as unknown as NodeJS.WriteStream

    const mockStdin = {
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

    const term = createTerm({
      stdout: mockStdout,
      stdin: mockStdin,
      color: 'truecolor',
    })

    function TermConsumer() {
      capturedTerm = useTerm()
      return <Text>Has Term</Text>
    }

    render(
      <TermContext.Provider value={term}>
        <TermConsumer />
      </TermContext.Provider>
    )

    expect(capturedTerm).not.toBeNull()
    expect(capturedTerm).toBe(term)
    expect(capturedTerm!.hasColor()).toBe('truecolor')

    term[Symbol.dispose]()
  })

  test('useTerm() throws outside render context', () => {
    function InvalidUsage() {
      useTerm() // Should throw
      return <Text>Should not render</Text>
    }

    expect(() => {
      render(<InvalidUsage />)
    }).toThrow('useTerm must be used within a tui render() context')
  })

  test('useTerm() throws with helpful message', () => {
    function ComponentWithoutContext() {
      try {
        useTerm()
        return <Text>No error</Text>
      } catch (e) {
        if (e instanceof Error) {
          return <Text>Error: {e.message}</Text>
        }
        return <Text>Unknown error</Text>
      }
    }

    const { lastFrameText } = render(<ComponentWithoutContext />)

    const output = lastFrameText()
    expect(output).toContain('useTerm must be used within a tui render() context')
  })

  test('useTerm() returns term with detection methods', () => {
    let term: Term | null = null

    const mockStdout = {
      columns: 120,
      rows: 40,
      isTTY: true,
      write: () => true,
      on: () => ({}),
      off: () => ({}),
      once: () => ({}),
      removeListener: () => ({}),
      addListener: () => ({}),
    } as unknown as NodeJS.WriteStream

    const mockStdin = {
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

    const createdTerm = createTerm({
      stdout: mockStdout,
      stdin: mockStdin,
      color: '256',
      unicode: true,
    })

    function TermChecker() {
      term = useTerm()
      return <Text>Checking</Text>
    }

    render(
      <TermContext.Provider value={createdTerm}>
        <TermChecker />
      </TermContext.Provider>
    )

    expect(term).not.toBeNull()
    expect(typeof term!.hasCursor).toBe('function')
    expect(typeof term!.hasInput).toBe('function')
    expect(typeof term!.hasColor).toBe('function')
    expect(typeof term!.hasUnicode).toBe('function')
    expect(term!.hasColor()).toBe('256')
    expect(term!.hasUnicode()).toBe(true)

    createdTerm[Symbol.dispose]()
  })

  test('useTerm() returns term with styling methods', () => {
    let term: Term | null = null

    const mockStdout = {
      columns: 80,
      rows: 24,
      isTTY: true,
      write: () => true,
      on: () => ({}),
      off: () => ({}),
      once: () => ({}),
      removeListener: () => ({}),
      addListener: () => ({}),
    } as unknown as NodeJS.WriteStream

    const mockStdin = {
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

    const createdTerm = createTerm({
      stdout: mockStdout,
      stdin: mockStdin,
      color: 'truecolor',
    })

    function StyleChecker() {
      term = useTerm()
      return <Text>Styling</Text>
    }

    render(
      <TermContext.Provider value={createdTerm}>
        <StyleChecker />
      </TermContext.Provider>
    )

    expect(term).not.toBeNull()

    // Term should be callable (for styling)
    expect(typeof term!.red).toBe('function')
    expect(typeof term!.bold).toBe('function')
    expect(typeof term!.green).toBe('function')

    // Styling should work
    const styled = term!.red('test')
    expect(styled).toContain('test')

    createdTerm[Symbol.dispose]()
  })

  test('useTerm() in nested components returns same term', () => {
    const capturedTerms: Term[] = []

    const mockStdout = {
      columns: 80,
      rows: 24,
      isTTY: true,
      write: () => true,
      on: () => ({}),
      off: () => ({}),
      once: () => ({}),
      removeListener: () => ({}),
      addListener: () => ({}),
    } as unknown as NodeJS.WriteStream

    const mockStdin = {
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

    const term = createTerm({
      stdout: mockStdout,
      stdin: mockStdin,
    })

    function Child() {
      capturedTerms.push(useTerm())
      return <Text>Child</Text>
    }

    function Parent() {
      capturedTerms.push(useTerm())
      return (
        <Box>
          <Child />
          <Child />
        </Box>
      )
    }

    render(
      <TermContext.Provider value={term}>
        <Parent />
      </TermContext.Provider>
    )

    expect(capturedTerms.length).toBe(3)
    expect(capturedTerms[0]).toBe(capturedTerms[1])
    expect(capturedTerms[1]).toBe(capturedTerms[2])

    term[Symbol.dispose]()
  })
})

// ============================================================================
// useConsole Tests
// ============================================================================

describe('useConsole', () => {
  let mockConsole: Console
  let patched: PatchedConsole

  beforeEach(() => {
    mockConsole = createMockConsole()
    patched = patchConsole(mockConsole)
  })

  afterEach(() => {
    patched[Symbol.dispose]()
  })

  test('useConsole() returns entries from PatchedConsole', () => {
    let capturedEntries: readonly ConsoleEntry[] = []

    function ConsoleReader() {
      capturedEntries = useConsole(patched)
      return <Text>Reading console</Text>
    }

    // Add some entries before rendering
    mockConsole.log('Entry 1')
    mockConsole.log('Entry 2')

    render(<ConsoleReader />)

    expect(capturedEntries.length).toBe(2)
    expect(capturedEntries[0].args).toEqual(['Entry 1'])
    expect(capturedEntries[1].args).toEqual(['Entry 2'])
  })

  test('useConsole() returns empty array when no entries', () => {
    let capturedEntries: readonly ConsoleEntry[] = []

    function ConsoleReader() {
      capturedEntries = useConsole(patched)
      return <Text>No entries</Text>
    }

    render(<ConsoleReader />)

    expect(capturedEntries).toEqual([])
  })

  test('useConsole() subscribes to PatchedConsole', () => {
    let entries: readonly ConsoleEntry[] = []

    function ConsoleSubscriber() {
      entries = useConsole(patched)
      return <Text>Entries: {entries.length}</Text>
    }

    const { lastFrameText, rerender } = render(<ConsoleSubscriber />)

    let output = lastFrameText()
    expect(output).toContain('Entries: 0')

    // Add an entry
    mockConsole.log('New entry')

    // Rerender to pick up the subscription update
    rerender(<ConsoleSubscriber />)

    output = lastFrameText()
    expect(output).toContain('Entries: 1')
    expect(entries.length).toBe(1)
    expect(entries[0].args).toEqual(['New entry'])
  })

  test('useConsole() captures entry method', () => {
    let entries: readonly ConsoleEntry[] = []

    function ConsoleMethodChecker() {
      entries = useConsole(patched)
      return <Text>Methods</Text>
    }

    mockConsole.log('log')
    mockConsole.info('info')
    mockConsole.warn('warn')
    mockConsole.error('error')
    mockConsole.debug('debug')

    render(<ConsoleMethodChecker />)

    expect(entries.length).toBe(5)
    expect(entries[0].method).toBe('log')
    expect(entries[1].method).toBe('info')
    expect(entries[2].method).toBe('warn')
    expect(entries[3].method).toBe('error')
    expect(entries[4].method).toBe('debug')
  })

  test('useConsole() captures entry stream', () => {
    let entries: readonly ConsoleEntry[] = []

    function StreamChecker() {
      entries = useConsole(patched)
      return <Text>Streams</Text>
    }

    mockConsole.log('stdout via log')
    mockConsole.info('stdout via info')
    mockConsole.warn('stderr via warn')
    mockConsole.error('stderr via error')

    render(<StreamChecker />)

    expect(entries[0].stream).toBe('stdout')
    expect(entries[1].stream).toBe('stdout')
    expect(entries[2].stream).toBe('stderr')
    expect(entries[3].stream).toBe('stderr')
  })

  test('useConsole() entries are readonly', () => {
    let entries: readonly ConsoleEntry[] = []

    function ReadonlyChecker() {
      entries = useConsole(patched)
      return <Text>Readonly</Text>
    }

    mockConsole.log('test')

    render(<ReadonlyChecker />)

    // The type is readonly, so TypeScript prevents mutation
    // We can verify the returned value is the same reference as getSnapshot
    expect(entries).toBe(patched.getSnapshot())
  })

  test('useConsole() in multiple components shares state', () => {
    const allEntries: Array<readonly ConsoleEntry[]> = []

    function Reader1() {
      allEntries.push(useConsole(patched))
      return <Text>Reader 1</Text>
    }

    function Reader2() {
      allEntries.push(useConsole(patched))
      return <Text>Reader 2</Text>
    }

    mockConsole.log('shared entry')

    render(
      <Box>
        <Reader1 />
        <Reader2 />
      </Box>
    )

    expect(allEntries.length).toBe(2)
    // Both readers should see the same entries
    expect(allEntries[0]).toEqual(allEntries[1])
    expect(allEntries[0].length).toBe(1)
  })
})

// ============================================================================
// useConsole Re-render Tests
// ============================================================================

describe('useConsole re-renders', () => {
  let mockConsole: Console
  let patched: PatchedConsole

  beforeEach(() => {
    mockConsole = createMockConsole()
    patched = patchConsole(mockConsole)
  })

  afterEach(() => {
    patched[Symbol.dispose]()
  })

  test('useConsole() re-renders on new entries', () => {
    let renderCount = 0

    function RenderCounter() {
      const entries = useConsole(patched)
      renderCount++
      return <Text>Renders: {renderCount}, Entries: {entries.length}</Text>
    }

    const { lastFrameText, rerender } = render(<RenderCounter />)

    const initialCount = renderCount
    expect(lastFrameText()).toContain('Entries: 0')

    // Add entry and rerender
    mockConsole.log('trigger rerender')
    rerender(<RenderCounter />)

    expect(renderCount).toBeGreaterThan(initialCount)
    expect(lastFrameText()).toContain('Entries: 1')
  })

  test('useConsole() reflects accumulated entries', () => {
    function EntryTracker() {
      const entries = useConsole(patched)
      return (
        <Box flexDirection="column">
          {entries.map((entry, i) => (
            <Text key={i}>{String(entry.args[0])}</Text>
          ))}
        </Box>
      )
    }

    const { lastFrameText, rerender } = render(<EntryTracker />)

    mockConsole.log('First')
    rerender(<EntryTracker />)
    expect(lastFrameText()).toContain('First')

    mockConsole.log('Second')
    rerender(<EntryTracker />)
    expect(lastFrameText()).toContain('First')
    expect(lastFrameText()).toContain('Second')

    mockConsole.log('Third')
    rerender(<EntryTracker />)
    expect(lastFrameText()).toContain('First')
    expect(lastFrameText()).toContain('Second')
    expect(lastFrameText()).toContain('Third')
  })
})

// ============================================================================
// useConsole with Complex Args Tests
// ============================================================================

describe('useConsole with complex args', () => {
  let mockConsole: Console
  let patched: PatchedConsole

  beforeEach(() => {
    mockConsole = createMockConsole()
    patched = patchConsole(mockConsole)
  })

  afterEach(() => {
    patched[Symbol.dispose]()
  })

  test('useConsole() captures object arguments', () => {
    let entries: readonly ConsoleEntry[] = []

    function ObjectChecker() {
      entries = useConsole(patched)
      return <Text>Objects</Text>
    }

    const obj = { name: 'test', value: 42 }
    mockConsole.log('Object:', obj)

    render(<ObjectChecker />)

    expect(entries.length).toBe(1)
    expect(entries[0].args[0]).toBe('Object:')
    expect(entries[0].args[1]).toEqual({ name: 'test', value: 42 })
  })

  test('useConsole() captures array arguments', () => {
    let entries: readonly ConsoleEntry[] = []

    function ArrayChecker() {
      entries = useConsole(patched)
      return <Text>Arrays</Text>
    }

    const arr = [1, 2, 3]
    mockConsole.log('Array:', arr)

    render(<ArrayChecker />)

    expect(entries[0].args[1]).toEqual([1, 2, 3])
  })

  test('useConsole() captures multiple mixed arguments', () => {
    let entries: readonly ConsoleEntry[] = []

    function MixedChecker() {
      entries = useConsole(patched)
      return <Text>Mixed</Text>
    }

    mockConsole.log('String', 42, true, null, { key: 'value' }, [1, 2])

    render(<MixedChecker />)

    expect(entries[0].args).toEqual([
      'String',
      42,
      true,
      null,
      { key: 'value' },
      [1, 2],
    ])
  })
})
