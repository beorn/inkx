/**
 * Tests for console patching functionality.
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import { patchConsole } from '../src/index.js'
import type { ConsoleEntry } from '../src/index.js'

// =============================================================================
// Mock Console Factory
// =============================================================================

interface MockConsole extends Console {
  _calls: { method: string; args: unknown[] }[]
}

function createMockConsole(): MockConsole {
  const calls: { method: string; args: unknown[] }[] = []

  return {
    _calls: calls,
    log: mock((...args: unknown[]) => { calls.push({ method: 'log', args }) }),
    info: mock((...args: unknown[]) => { calls.push({ method: 'info', args }) }),
    warn: mock((...args: unknown[]) => { calls.push({ method: 'warn', args }) }),
    error: mock((...args: unknown[]) => { calls.push({ method: 'error', args }) }),
    debug: mock((...args: unknown[]) => { calls.push({ method: 'debug', args }) }),
    // Add other console methods as stubs
    assert: mock(() => {}),
    clear: mock(() => {}),
    count: mock(() => {}),
    countReset: mock(() => {}),
    dir: mock(() => {}),
    dirxml: mock(() => {}),
    group: mock(() => {}),
    groupCollapsed: mock(() => {}),
    groupEnd: mock(() => {}),
    table: mock(() => {}),
    time: mock(() => {}),
    timeEnd: mock(() => {}),
    timeLog: mock(() => {}),
    trace: mock(() => {}),
    profile: mock(() => {}),
    profileEnd: mock(() => {}),
    timeStamp: mock(() => {}),
  } as unknown as MockConsole
}

// =============================================================================
// Basic Interception Tests
// =============================================================================

describe('Console interception', () => {
  test('patchConsole returns PatchedConsole', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    expect(patched).toBeDefined()
    expect(typeof patched.getSnapshot).toBe('function')
    expect(typeof patched.subscribe).toBe('function')
    expect(typeof patched.dispose).toBe('function')
    expect(typeof patched[Symbol.dispose]).toBe('function')

    patched.dispose()
  })

  test('intercepts console.log', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('hello', 'world')

    const entries = patched.getSnapshot()
    expect(entries.length).toBe(1)
    expect(entries[0].method).toBe('log')
    expect(entries[0].args).toEqual(['hello', 'world'])

    patched.dispose()
  })

  test('intercepts console.info', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.info('info message')

    const entries = patched.getSnapshot()
    expect(entries.length).toBe(1)
    expect(entries[0].method).toBe('info')
    expect(entries[0].args).toEqual(['info message'])

    patched.dispose()
  })

  test('intercepts console.warn', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.warn('warning')

    const entries = patched.getSnapshot()
    expect(entries.length).toBe(1)
    expect(entries[0].method).toBe('warn')
    expect(entries[0].args).toEqual(['warning'])

    patched.dispose()
  })

  test('intercepts console.error', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.error('error message')

    const entries = patched.getSnapshot()
    expect(entries.length).toBe(1)
    expect(entries[0].method).toBe('error')
    expect(entries[0].args).toEqual(['error message'])

    patched.dispose()
  })

  test('intercepts console.debug', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.debug('debug info')

    const entries = patched.getSnapshot()
    expect(entries.length).toBe(1)
    expect(entries[0].method).toBe('debug')
    expect(entries[0].args).toEqual(['debug info'])

    patched.dispose()
  })

  test('calls original console method', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('test')

    // The mock should have been called
    expect(mockConsole._calls.length).toBe(1)
    expect(mockConsole._calls[0].method).toBe('log')

    patched.dispose()
  })
})

// =============================================================================
// Stream Assignment Tests
// =============================================================================

describe('Stream assignment', () => {
  test('log has stream stdout', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('test')

    const entries = patched.getSnapshot()
    expect(entries[0].stream).toBe('stdout')

    patched.dispose()
  })

  test('info has stream stdout', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.info('test')

    const entries = patched.getSnapshot()
    expect(entries[0].stream).toBe('stdout')

    patched.dispose()
  })

  test('debug has stream stdout', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.debug('test')

    const entries = patched.getSnapshot()
    expect(entries[0].stream).toBe('stdout')

    patched.dispose()
  })

  test('warn has stream stderr', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.warn('test')

    const entries = patched.getSnapshot()
    expect(entries[0].stream).toBe('stderr')

    patched.dispose()
  })

  test('error has stream stderr', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.error('test')

    const entries = patched.getSnapshot()
    expect(entries[0].stream).toBe('stderr')

    patched.dispose()
  })
})

// =============================================================================
// getSnapshot Tests
// =============================================================================

describe('getSnapshot', () => {
  test('returns empty array initially', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    const entries = patched.getSnapshot()
    expect(entries).toEqual([])

    patched.dispose()
  })

  test('returns all entries', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('one')
    mockConsole.warn('two')
    mockConsole.error('three')

    const entries = patched.getSnapshot()
    expect(entries.length).toBe(3)
    expect(entries[0].args).toEqual(['one'])
    expect(entries[1].args).toEqual(['two'])
    expect(entries[2].args).toEqual(['three'])

    patched.dispose()
  })

  test('returns readonly array', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('test')

    const entries = patched.getSnapshot()
    // TypeScript would prevent modification, but we can check the type
    expect(Array.isArray(entries)).toBe(true)

    patched.dispose()
  })

  test('preserves entry order', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('first')
    mockConsole.info('second')
    mockConsole.warn('third')
    mockConsole.error('fourth')
    mockConsole.debug('fifth')

    const entries = patched.getSnapshot()
    expect(entries.map(e => e.args[0])).toEqual(['first', 'second', 'third', 'fourth', 'fifth'])

    patched.dispose()
  })
})

// =============================================================================
// subscribe Tests
// =============================================================================

describe('subscribe', () => {
  test('notifies on new entry', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    let notified = false
    const unsubscribe = patched.subscribe(() => {
      notified = true
    })

    expect(notified).toBe(false)

    mockConsole.log('test')

    expect(notified).toBe(true)

    unsubscribe()
    patched.dispose()
  })

  test('notifies for each entry', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    let count = 0
    const unsubscribe = patched.subscribe(() => {
      count++
    })

    mockConsole.log('one')
    mockConsole.log('two')
    mockConsole.log('three')

    expect(count).toBe(3)

    unsubscribe()
    patched.dispose()
  })

  test('unsubscribe stops notifications', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    let count = 0
    const unsubscribe = patched.subscribe(() => {
      count++
    })

    mockConsole.log('one')
    expect(count).toBe(1)

    unsubscribe()

    mockConsole.log('two')
    expect(count).toBe(1) // Should not have increased

    patched.dispose()
  })

  test('multiple subscribers receive notifications', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    let count1 = 0
    let count2 = 0

    const unsub1 = patched.subscribe(() => { count1++ })
    const unsub2 = patched.subscribe(() => { count2++ })

    mockConsole.log('test')

    expect(count1).toBe(1)
    expect(count2).toBe(1)

    unsub1()
    unsub2()
    patched.dispose()
  })

  test('subscriber can access latest entries', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    let capturedEntries: readonly ConsoleEntry[] = []
    const unsubscribe = patched.subscribe(() => {
      capturedEntries = patched.getSnapshot()
    })

    mockConsole.log('test')

    expect(capturedEntries.length).toBe(1)
    expect(capturedEntries[0].args).toEqual(['test'])

    unsubscribe()
    patched.dispose()
  })

  test('returns unsubscribe function', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    const unsubscribe = patched.subscribe(() => {})

    expect(typeof unsubscribe).toBe('function')

    unsubscribe()
    patched.dispose()
  })
})

// =============================================================================
// dispose Tests
// =============================================================================

describe('dispose', () => {
  test('restores console methods after dispose', () => {
    const mockConsole = createMockConsole()

    const patched = patchConsole(mockConsole)

    // While patched, calling log adds to entries
    mockConsole.log('during patch')
    expect(patched.getSnapshot().length).toBe(1)

    patched.dispose()

    // After dispose, calling log should not add to entries
    // (the method is restored and no longer intercepted)
    mockConsole.log('after dispose')
    // Entries array still has only the one from before dispose
    expect(patched.getSnapshot().length).toBe(1)
  })

  test('dispose stops interception for all methods', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    // Verify interception works
    mockConsole.log('log')
    mockConsole.info('info')
    mockConsole.warn('warn')
    mockConsole.error('error')
    mockConsole.debug('debug')
    expect(patched.getSnapshot().length).toBe(5)

    patched.dispose()

    // After dispose, no more interception
    mockConsole.log('not intercepted')
    expect(patched.getSnapshot().length).toBe(5) // Still 5, not 6
  })

  test('clears subscribers', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    let count = 0
    patched.subscribe(() => { count++ })

    patched.dispose()

    // After dispose, console is restored but if we call it, no notification
    // (though the method is now the original, so this just verifies no error)
    mockConsole.log('after dispose')
    expect(count).toBe(0) // Subscriber was cleared
  })

  test('Symbol.dispose works same as dispose()', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('during patch')
    expect(patched.getSnapshot().length).toBe(1)

    patched[Symbol.dispose]()

    mockConsole.log('after dispose')
    expect(patched.getSnapshot().length).toBe(1) // Not intercepted
  })

  test('using keyword works', () => {
    const mockConsole = createMockConsole()
    let snapshotLength = 0

    {
      using patched = patchConsole(mockConsole)
      mockConsole.log('during')
      snapshotLength = patched.getSnapshot().length
    }

    expect(snapshotLength).toBe(1)
    // After scope exit, console should be restored
    // Can't easily verify without another patch, but no error = success
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  test('handles multiple arguments', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('a', 'b', 'c', 1, 2, 3)

    const entries = patched.getSnapshot()
    expect(entries[0].args).toEqual(['a', 'b', 'c', 1, 2, 3])

    patched.dispose()
  })

  test('handles object arguments', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    const obj = { key: 'value' }
    mockConsole.log(obj)

    const entries = patched.getSnapshot()
    expect(entries[0].args[0]).toBe(obj) // Same reference

    patched.dispose()
  })

  test('handles no arguments', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log()

    const entries = patched.getSnapshot()
    expect(entries[0].args).toEqual([])

    patched.dispose()
  })

  test('handles undefined and null', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log(undefined, null)

    const entries = patched.getSnapshot()
    expect(entries[0].args).toEqual([undefined, null])

    patched.dispose()
  })

  test('handles Error objects', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    const error = new Error('test error')
    mockConsole.error(error)

    const entries = patched.getSnapshot()
    expect(entries[0].args[0]).toBe(error)

    patched.dispose()
  })
})

// =============================================================================
// useSyncExternalStore Compatibility
// =============================================================================

describe('useSyncExternalStore compatibility', () => {
  test('getSnapshot returns stable reference for same entries', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    mockConsole.log('test')

    // In the current implementation, each call might return same array
    // This tests the basic contract
    const entries1 = patched.getSnapshot()
    const entries2 = patched.getSnapshot()

    expect(entries1.length).toBe(entries2.length)
    expect(entries1[0]).toBe(entries2[0]) // Same entry objects

    patched.dispose()
  })

  test('subscribe/getSnapshot pattern works', () => {
    const mockConsole = createMockConsole()
    const patched = patchConsole(mockConsole)

    // Simulate useSyncExternalStore pattern
    let currentSnapshot = patched.getSnapshot()

    const unsubscribe = patched.subscribe(() => {
      currentSnapshot = patched.getSnapshot()
    })

    expect(currentSnapshot.length).toBe(0)

    mockConsole.log('hello')
    expect(currentSnapshot.length).toBe(1)

    mockConsole.log('world')
    expect(currentSnapshot.length).toBe(2)

    unsubscribe()
    patched.dispose()
  })
})
