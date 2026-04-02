/**
 * WriteQueue Tests
 *
 * Tests for retry logic, error classification, backoff calculation, conflict detection,
 * and permission error handling
 */

import { describe, test, expect } from "vitest"
import {
  WriteQueue,
  classifyError,
  calculateBackoffDelay,
  getErrorType,
  getPermissionSuggestion,
  type FileSystemOps,
  type RetryConfig,
  type OperationResult,
  type ConflictInfo,
  type PermissionError,
} from "../../src/watch/writequeue.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Event type emitted by WriteQueue on "flushed" */
type FlushedEvent = {
  count: number
  errors: number
  retries: number
  conflicts: number
  permissionErrors: number
  results: OperationResult[]
}

/** Default fast retry config for tests */
const FAST_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1,
  maxDelayMs: 10,
  jitterFactor: 0,
}

/** Create a code error from a string code */
function codeError(code: string, message?: string): Error & { code: string } {
  return Object.assign(new Error(message ?? `Error: ${code}`), { code })
}

/**
 * Create a mock filesystem with configurable failure behavior
 */
function createMockFs(
  options: {
    /** Number of times to fail before succeeding */
    failCount?: number
    /** Error to throw on failure */
    failError?: Error & { code?: string }
    /** Track write/delete/rename operations */
    history?: string[]
    /** Map of path -> mtime for conflict detection */
    mtimes?: Map<string, number>
    /** Set of paths that are directories */
    directories?: Set<string>
  } = {},
): FileSystemOps {
  let failCount = options.failCount ?? 0
  const failError = options.failError ?? codeError("EBUSY", "Resource busy")
  const history = options.history ?? []
  const mtimes = options.mtimes ?? new Map<string, number>()
  const directories = options.directories ?? new Set<string>()

  const maybeFail = () => {
    if (failCount > 0) {
      failCount--
      throw failError
    }
  }

  return {
    writeFileSync: (path: string, _content: string) => {
      maybeFail()
      history.push(`write:${path}`)
      mtimes.set(path, Date.now())
    },
    unlinkSync: (path: string) => {
      maybeFail()
      history.push(`delete:${path}`)
      mtimes.delete(path)
    },
    rmSync: (path: string) => {
      maybeFail()
      history.push(`rmdir:${path}`)
      mtimes.delete(path)
    },
    mkdirSync: () => {},
    existsSync: (path: string) => mtimes.has(path),
    renameSync: (oldPath: string, newPath: string) => {
      maybeFail()
      history.push(`rename:${oldPath}->${newPath}`)
      const mtime = mtimes.get(oldPath)
      if (mtime) {
        mtimes.set(newPath, mtime)
        mtimes.delete(oldPath)
      }
    },
    readFileSync: () => "",
    statSync: (path: string) => {
      const mtime = mtimes.get(path)
      if (mtime === undefined) {
        throw codeError("ENOENT")
      }
      const isDir = directories.has(path)
      return {
        ino: 1,
        mtimeMs: mtime,
        size: 100,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      }
    },
  }
}

/**
 * Create WriteQueue with test defaults
 */
function createWriteQueue(options: {
  fs: FileSystemOps
  retry?: Partial<RetryConfig>
  conflictStrategy?: "last_write_wins" | "fs_wins" | "db_wins"
}): WriteQueue {
  return new WriteQueue({
    debounceMs: 0,
    fs: options.fs,
    retry: { ...FAST_RETRY, ...options.retry },
    conflictStrategy: options.conflictStrategy,
  })
}

/**
 * Run queue operation and capture flushed event
 */
async function flushAndCapture(queue: WriteQueue): Promise<{ flushed: FlushedEvent; errors: unknown[] | null }> {
  let flushed: FlushedEvent | null = null
  let errors: unknown[] | null = null
  queue.on("flushed", (e) => (flushed = e as FlushedEvent))
  queue.on("errors", (e) => (errors = e as unknown[]))
  await queue.forceFlush()
  return { flushed: flushed!, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Classification
// ─────────────────────────────────────────────────────────────────────────────

describe("Error Classification", () => {
  const transientCodes = [
    "EBUSY",
    "EAGAIN",
    "EMFILE",
    "ENFILE",
    "ENOSPC",
    "ETXTBSY",
    "EIO",
    "ETIMEDOUT",
    "ECONNRESET",
    "ENETUNREACH",
    "EHOSTUNREACH",
  ]

  const permanentCodes = ["ENOENT", "EACCES", "EPERM", "EEXIST", "EISDIR", "ENOTDIR", "EROFS"]

  test.each(transientCodes)("classifies %s as transient", (code) => {
    expect(classifyError(codeError(code))).toBe("transient")
  })

  test.each(permanentCodes)("classifies %s as permanent", (code) => {
    expect(classifyError(codeError(code))).toBe("permanent")
  })

  test("classifies errors without code as permanent", () => {
    expect(classifyError(new Error("Unknown error"))).toBe("permanent")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Backoff Calculation
// ─────────────────────────────────────────────────────────────────────────────

describe("Backoff Calculation", () => {
  const config: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    jitterFactor: 0, // No jitter for deterministic tests
  }

  test("calculates exponential delays", () => {
    expect(calculateBackoffDelay(0, config)).toBe(100) // 100 * 2^0
    expect(calculateBackoffDelay(1, config)).toBe(200) // 100 * 2^1
    expect(calculateBackoffDelay(2, config)).toBe(400) // 100 * 2^2
    expect(calculateBackoffDelay(3, config)).toBe(800) // 100 * 2^3
  })

  test("clamps to maxDelayMs", () => {
    const smallMaxConfig = { ...config, maxDelayMs: 300 }
    expect(calculateBackoffDelay(0, smallMaxConfig)).toBe(100)
    expect(calculateBackoffDelay(1, smallMaxConfig)).toBe(200)
    expect(calculateBackoffDelay(2, smallMaxConfig)).toBe(300) // Clamped
    expect(calculateBackoffDelay(3, smallMaxConfig)).toBe(300) // Clamped
  })

  test("applies jitter within bounds", () => {
    const jitterConfig = { ...config, jitterFactor: 0.5 }
    const results = Array.from({ length: 100 }, () => calculateBackoffDelay(0, jitterConfig))

    // All results should be within ±50% of base (100 ± 50)
    for (const result of results) {
      expect(result).toBeGreaterThanOrEqual(50)
      expect(result).toBeLessThanOrEqual(150)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WriteQueue Retry Logic
// ─────────────────────────────────────────────────────────────────────────────

describe("WriteQueue Retry Logic", () => {
  test("succeeds on first attempt when no errors", async () => {
    const history: string[] = []
    const queue = createWriteQueue({
      fs: createMockFs({ history }),
    })

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" })
    const { flushed } = await flushAndCapture(queue)

    // Atomic write: temp file write + rename into place
    expect(history).toEqual(["write:/test.md.km-tmp", "rename:/test.md.km-tmp->/test.md"])
    expect(flushed.results[0]?.attempts).toBe(1)
    expect(flushed.results[0]?.success).toBe(true)
  })

  test("retries transient errors with backoff", async () => {
    const history: string[] = []
    const queue = createWriteQueue({
      fs: createMockFs({ history, failCount: 2 }),
    })

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" })
    const { flushed } = await flushAndCapture(queue)

    // Atomic write: after 2 retries, temp write + rename succeed
    expect(history).toEqual(["write:/test.md.km-tmp", "rename:/test.md.km-tmp->/test.md"])
    expect(flushed.results[0]?.attempts).toBe(3)
    expect(flushed.results[0]?.success).toBe(true)
    expect(flushed.retries).toBe(2)
  })

  test("fails after max retries for transient errors", async () => {
    const history: string[] = []
    const queue = createWriteQueue({
      fs: createMockFs({ history, failCount: 10 }),
      retry: { maxRetries: 2 },
    })

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" })
    const { flushed, errors } = await flushAndCapture(queue)

    expect(history).toEqual([])
    expect(errors).toHaveLength(1)
    expect(flushed.errors).toBe(1)
    expect(flushed.retries).toBe(2) // 2 retries after initial attempt
  })

  test("does not retry permanent errors", async () => {
    const history: string[] = []
    const queue = createWriteQueue({
      fs: createMockFs({
        history,
        failCount: 10,
        failError: codeError("EACCES", "Permission denied"),
      }),
    })

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" })
    const { flushed } = await flushAndCapture(queue)

    expect(history).toEqual([])
    expect(flushed.results[0]?.attempts).toBe(1) // Only one attempt
    expect(flushed.results[0]?.success).toBe(false)
    expect(flushed.results[0]?.errorClass).toBe("permanent")
    expect(flushed.retries).toBe(0)
  })

  test("retries delete operations", async () => {
    const history: string[] = []
    const mtimes = new Map([["/test.md", Date.now()]])
    const queue = createWriteQueue({
      fs: createMockFs({ history, failCount: 1, mtimes }),
    })

    queue.queueDelete("/test.md", "1")
    await queue.forceFlush()

    expect(history).toEqual(["delete:/test.md"])
  })

  test("deletes directories with rmSync instead of unlinkSync", async () => {
    const history: string[] = []
    const mtimes = new Map([["/my-folder", Date.now()]])
    const directories = new Set(["/my-folder"])
    const queue = createWriteQueue({
      fs: createMockFs({ history, mtimes, directories }),
    })

    queue.queueDelete("/my-folder", "1")
    await queue.forceFlush()

    expect(history).toEqual(["rmdir:/my-folder"])
  })

  test("retries rename operations", async () => {
    const history: string[] = []
    const mtimes = new Map([["/old.md", Date.now()]])
    const queue = createWriteQueue({
      fs: createMockFs({ history, failCount: 1, mtimes }),
    })

    queue.queueRename("/old.md", "/new.md", "1")
    await queue.forceFlush()

    expect(history).toEqual(["rename:/old.md->/new.md"])
  })

  test("handles multiple operations with mixed results", async () => {
    const history: string[] = []
    let callCount = 0

    const mockFs = createMockFs({ history })
    mockFs.writeFileSync = (path: string) => {
      callCount++
      // Fail first file's temp write twice (transient), succeed second file, fail third permanently
      if (path === "/a.md.km-tmp" && callCount <= 2) {
        throw codeError("EBUSY", "Busy")
      }
      if (path === "/c.md.km-tmp") {
        throw codeError("EACCES", "Permission denied")
      }
      history.push(`write:${path}`)
    }

    const queue = createWriteQueue({ fs: mockFs })

    queue.queue({ path: "/a.md", content: "a", sourceEventId: "1" })
    queue.queue({ path: "/b.md", content: "b", sourceEventId: "2" })
    queue.queue({ path: "/c.md", content: "c", sourceEventId: "3" })
    const { flushed } = await flushAndCapture(queue)

    // a.md succeeds after retries (atomic: temp write + rename), b.md first try, c.md fails permanently
    expect(history).toContain("write:/a.md.km-tmp")
    expect(history).toContain("write:/b.md.km-tmp")
    expect(history).not.toContain("write:/c.md.km-tmp")

    expect(flushed.errors).toBe(1) // c.md failed
    expect(flushed.retries).toBe(2) // a.md needed 2 retries
  })

  test("uses custom retry config", async () => {
    const history: string[] = []
    const queue = createWriteQueue({
      fs: createMockFs({ history, failCount: 5 }),
      retry: { maxRetries: 5 },
    })

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" })
    const { flushed } = await flushAndCapture(queue)

    // Atomic write: temp file + rename
    expect(history).toEqual(["write:/test.md.km-tmp", "rename:/test.md.km-tmp->/test.md"])
    expect(flushed.results[0]?.attempts).toBe(6) // 1 initial + 5 retries
    expect(flushed.results[0]?.success).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Conflict Detection
// ─────────────────────────────────────────────────────────────────────────────

describe("Conflict Detection", () => {
  test("no conflict when file unchanged", async () => {
    const history: string[] = []
    const mtimes = new Map([["/test.md", 1000]])

    const queue = createWriteQueue({
      fs: createMockFs({ history, mtimes }),
      conflictStrategy: "last_write_wins",
    })

    queue.queue({ path: "/test.md", content: "updated", sourceEventId: "1" })
    const { flushed } = await flushAndCapture(queue)

    // Atomic write: temp + rename
    expect(history).toEqual(["write:/test.md.km-tmp", "rename:/test.md.km-tmp->/test.md"])
    expect(flushed.conflicts).toBe(0)
    expect(flushed.results[0]?.conflict).toBeUndefined()
  })

  test("detects conflict when file changed externally (last_write_wins)", async () => {
    const history: string[] = []
    const mtimes = new Map([["/test.md", 1000]])

    const queue = createWriteQueue({
      fs: createMockFs({ history, mtimes }),
      conflictStrategy: "last_write_wins",
    })

    let conflictsEvent: ConflictInfo[] | null = null
    queue.on("conflicts", (e) => (conflictsEvent = e as ConflictInfo[]))

    // Queue write - this captures baseMtime=1000
    queue.queue({ path: "/test.md", content: "tui-edit", sourceEventId: "1" })

    // Simulate external edit changing the file before flush
    mtimes.set("/test.md", 2000)

    const { flushed } = await flushAndCapture(queue)

    // last_write_wins: should still write despite conflict (atomic: temp + rename)
    expect(history).toEqual(["write:/test.md.km-tmp", "rename:/test.md.km-tmp->/test.md"])
    expect(flushed.conflicts).toBe(1)
    expect(conflictsEvent).toHaveLength(1)
    expect(flushed.results[0]?.conflict?.resolution).toBe("written")
  })

  test("discards write when file changed (fs_wins strategy)", async () => {
    const history: string[] = []
    const mtimes = new Map([["/test.md", 1000]])

    const queue = createWriteQueue({
      fs: createMockFs({ history, mtimes }),
      conflictStrategy: "fs_wins",
    })

    let conflictsEvent: ConflictInfo[] | null = null
    queue.on("conflicts", (e) => (conflictsEvent = e as ConflictInfo[]))

    // Queue write - captures baseMtime=1000
    queue.queue({ path: "/test.md", content: "tui-edit", sourceEventId: "1" })

    // Simulate external edit
    mtimes.set("/test.md", 2000)

    const { flushed } = await flushAndCapture(queue)

    // fs_wins: should NOT write
    expect(history).toEqual([])
    expect(flushed.conflicts).toBe(1)
    expect(conflictsEvent).toHaveLength(1)
    expect(flushed.results[0]?.conflict?.resolution).toBe("discarded")
    expect(flushed.results[0]?.success).toBe(true) // Still "success" - not an error
  })

  test("writes with warning when file changed (db_wins strategy)", async () => {
    const history: string[] = []
    const mtimes = new Map([["/test.md", 1000]])

    const queue = createWriteQueue({
      fs: createMockFs({ history, mtimes }),
      conflictStrategy: "db_wins",
    })

    queue.queue({ path: "/test.md", content: "tui-edit", sourceEventId: "1" })
    mtimes.set("/test.md", 2000)

    const { flushed } = await flushAndCapture(queue)

    // db_wins: should write despite conflict (atomic: temp + rename)
    expect(history).toEqual(["write:/test.md.km-tmp", "rename:/test.md.km-tmp->/test.md"])
    expect(flushed.conflicts).toBe(1)
    expect(flushed.results[0]?.conflict?.resolution).toBe("written")
  })

  test("no conflict for new files", async () => {
    const history: string[] = []

    const queue = createWriteQueue({
      fs: createMockFs({ history }),
      conflictStrategy: "fs_wins",
    })

    queue.queue({ path: "/new.md", content: "new file", sourceEventId: "1" })
    const { flushed } = await flushAndCapture(queue)

    // Atomic write: temp + rename
    expect(history).toEqual(["write:/new.md.km-tmp", "rename:/new.md.km-tmp->/new.md"])
    expect(flushed.conflicts).toBe(0)
  })

  test("conflict info includes mtime details", async () => {
    const mtimes = new Map([["/test.md", 1000]])

    const queue = createWriteQueue({
      fs: createMockFs({ mtimes }),
      conflictStrategy: "last_write_wins",
    })

    let conflictsEvent: ConflictInfo[] | null = null
    queue.on("conflicts", (e) => (conflictsEvent = e as ConflictInfo[]))

    queue.queue({ path: "/test.md", content: "edit", sourceEventId: "1" })
    mtimes.set("/test.md", 2000)
    await queue.forceFlush()

    expect(conflictsEvent![0]?.path).toBe("/test.md")
    expect(conflictsEvent![0]?.baseMtime).toBe(1000)
    expect(conflictsEvent![0]?.currentMtime).toBe(2000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Permission Error Handling
// ─────────────────────────────────────────────────────────────────────────────

describe("Permission Error Handling", () => {
  describe("getErrorType classification", () => {
    test.each([
      ["EACCES", "permission"],
      ["EPERM", "permission"],
      ["EROFS", "read_only"],
      ["ENOENT", "not_found"],
      ["EBUSY", "transient"],
      ["EISDIR", "other"],
    ] as const)("classifies %s as %s", (code, expectedType) => {
      expect(getErrorType(codeError(code))).toBe(expectedType)
    })
  })

  describe("getPermissionSuggestion messages", () => {
    test.each([
      ["EACCES", "/test.md", "chmod"],
      ["EPERM", "/test.md", "not permitted"],
      ["EROFS", "/test.md", "read-only"],
    ] as const)("%s suggestion includes %s", (code, path, expected) => {
      expect(getPermissionSuggestion(path, code)).toContain(expected)
    })
  })

  describe("permission-denied events", () => {
    test.each([
      ["EACCES", "/protected/test.md", "chmod"],
      ["EPERM", "/root/test.md", "not permitted"],
      ["EROFS", "/readonly/test.md", "read-only"],
    ] as const)("emits permission-denied event on %s error", async (code, path, suggestion) => {
      const mockFs = createMockFs({
        failError: codeError(code, `Error: ${code}`),
        failCount: 1,
      })

      const queue = createWriteQueue({
        fs: mockFs,
        retry: { maxRetries: 0 },
      })

      let permissionEvent: PermissionError[] = []
      let flushedEvent: { permissionErrors?: number } = {}
      queue.on("permission-denied", (e) => (permissionEvent = e as PermissionError[]))
      queue.on("flushed", (e) => (flushedEvent = e as { permissionErrors?: number }))

      queue.queue({ path, content: "test", sourceEventId: "1" })
      await queue.forceFlush()

      expect(permissionEvent).toHaveLength(1)
      expect(permissionEvent[0]?.path).toBe(path)
      expect(permissionEvent[0]?.code).toBe(code)
      expect(permissionEvent[0]?.operation).toBe("write")
      expect(permissionEvent[0]?.suggestion).toContain(suggestion)
      expect(flushedEvent.permissionErrors).toBe(1)
    })
  })

  test("does not emit permission-denied for non-permission errors", async () => {
    const mockFs = createMockFs({
      failError: codeError("EEXIST", "File exists"),
      failCount: 1,
    })

    const queue = createWriteQueue({
      fs: mockFs,
      retry: { maxRetries: 0 },
    })

    let permissionEvent: PermissionError[] | null = null
    let errorsEvent: unknown[] | null = null
    queue.on("permission-denied", (e) => (permissionEvent = e as PermissionError[]))
    queue.on("errors", (e) => (errorsEvent = e as unknown[]))

    queue.queue({ path: "/test.md", content: "test", sourceEventId: "1" })
    await queue.forceFlush()

    expect(permissionEvent).toBeNull()
    expect(errorsEvent).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// In-Flight Generation Tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("in-flight generation tracking", () => {
  test("overlapping flushes do not prematurely clear in-flight status", async () => {
    const mockFs = createMockFs()
    const queue = createWriteQueue({ fs: mockFs })

    // Track markInFlight / clearInFlight calls
    const inFlightPaths = new Set<string>()
    const tracker = {
      markInFlight: (path: string) => inFlightPaths.add(path),
      clearInFlight: (path: string) => inFlightPaths.delete(path),
    }
    queue.setWatcher(tracker)

    // Flush 1: write @next.md at T=0
    queue.queue({ path: "/vault/@next.md", content: "v1", sourceEventId: "1" })
    await queue.forceFlush()
    expect(inFlightPaths.has("/vault/@next.md")).toBe(true)

    // Wait 500ms, then flush 2 at T=500 (before flush 1's 1000ms clear timer)
    await new Promise((r) => setTimeout(r, 500))

    queue.queue({ path: "/vault/@next.md", content: "v2", sourceEventId: "2" })
    await queue.forceFlush()
    expect(inFlightPaths.has("/vault/@next.md")).toBe(true)

    // At T=1100, flush 1's clear timer fires (1000ms after T=0).
    // With generation tracking: flush 2 superseded flush 1, so clear is skipped.
    // Without generation tracking: clear would fire, leaving path unprotected!
    await new Promise((r) => setTimeout(r, 700))

    // CRITICAL: should STILL be in-flight (flush 2's timer hasn't fired yet)
    expect(inFlightPaths.has("/vault/@next.md")).toBe(true)

    // At T=1600, flush 2's clear timer fires (1000ms after T=500)
    await new Promise((r) => setTimeout(r, 600))

    // Now it should be cleared
    expect(inFlightPaths.has("/vault/@next.md")).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Flush Mutex (re-entrancy prevention)
// ─────────────────────────────────────────────────────────────────────────────

describe("flush mutex", () => {
  test("concurrent flush calls are serialized — second waits for first", async () => {
    const history: string[] = []
    const writeDelay: (() => void) | null = null

    // Filesystem where the first write blocks until we release it
    const mockFs = createMockFs({ history })
    const originalWrite = mockFs.writeFileSync
    let writeCount = 0
    mockFs.writeFileSync = (path: string, content: string, encoding?: BufferEncoding) => {
      writeCount++
      if (writeCount === 1) {
        // First write: block by throwing into a promise we control
        // We simulate a slow write by replacing executeOp's sync call
        // with a delayed one via the retry mechanism
        originalWrite(path, content, encoding)
        return
      }
      originalWrite(path, content, encoding)
    }

    // Use retry delays to create a slow first flush
    const delayFs = createMockFs({ history })
    let callIndex = 0
    delayFs.writeFileSync = (path: string, content: string) => {
      callIndex++
      if (callIndex === 1) {
        // First call: transient error forces retry with delay
        throw codeError("EBUSY", "Resource busy")
      }
      history.push(`write:${path}:${content}`)
    }

    const queue = createWriteQueue({
      fs: delayFs,
      retry: { maxRetries: 3, baseDelayMs: 50, maxDelayMs: 100, jitterFactor: 0 },
    })

    // Queue first write and start flush (will be slow due to retry)
    queue.queue({ path: "/test.md", content: "v1", sourceEventId: "1" })
    const flush1 = queue.flush()

    // Queue second write and start flush concurrently
    queue.queue({ path: "/test.md", content: "v2", sourceEventId: "2" })
    const flush2 = queue.flush()

    await Promise.all([flush1, flush2])

    // v1 writes first (from flush 1), then v2 writes (from flush 2 after mutex release)
    // Atomic writes go to .km-tmp before rename
    const writes = history.filter((h) => h.startsWith("write:"))
    expect(writes).toEqual(["write:/test.md.km-tmp:v1", "write:/test.md.km-tmp:v2"])
  })

  test("newer content wins when queued during active flush", async () => {
    const history: string[] = []
    let callIndex = 0

    const mockFs = createMockFs({ history })
    mockFs.writeFileSync = (path: string, content: string) => {
      callIndex++
      if (callIndex === 1) {
        // First write is slow (transient error + retry)
        throw codeError("EBUSY", "Resource busy")
      }
      history.push(`write:${path}:${content}`)
    }

    const queue = createWriteQueue({
      fs: mockFs,
      retry: { maxRetries: 3, baseDelayMs: 30, maxDelayMs: 50, jitterFactor: 0 },
    })

    // Start first flush with v1
    queue.queue({ path: "/doc.md", content: "old", sourceEventId: "1" })
    const flush1 = queue.flush()

    // While flush 1 is retrying, queue v2 (newer content)
    queue.queue({ path: "/doc.md", content: "new", sourceEventId: "2" })
    const flush2 = queue.flush()

    await Promise.all([flush1, flush2])

    // Both writes happen, but the last one (newest) is what remains on disk
    // Atomic writes go to .km-tmp before rename
    const writes = history.filter((h) => h.startsWith("write:"))
    expect(writes.length).toBeGreaterThanOrEqual(1)
    // The final write must be the newer content
    expect(writes[writes.length - 1]).toBe("write:/doc.md.km-tmp:new")
  })

  test("flush is a no-op when nothing is pending after waiting", async () => {
    const history: string[] = []
    const mockFs = createMockFs({ history })

    const queue = createWriteQueue({ fs: mockFs })

    // Queue and flush
    queue.queue({ path: "/a.md", content: "hello", sourceEventId: "1" })
    await queue.flush()

    // Second flush with no new work should be fast and not write anything extra
    await queue.flush()

    // Atomic write: temp file + rename
    const writes = history.filter((h) => h.startsWith("write:"))
    expect(writes).toEqual(["write:/a.md.km-tmp"])
  })

  test("flush drains items queued during an active flush", async () => {
    const history: string[] = []
    let writeCount = 0

    const mockFs = createMockFs({ history })
    const origWrite = mockFs.writeFileSync
    mockFs.writeFileSync = function (this: unknown, path: string, content: string, encoding?: BufferEncoding) {
      writeCount++
      if (writeCount === 1) {
        // Simulate slow first write via transient error + retry
        throw codeError("EBUSY", "Resource busy")
      }
      history.push(`write:${path}:${content}`)
    }

    const queue = createWriteQueue({
      fs: mockFs,
      retry: { maxRetries: 3, baseDelayMs: 30, maxDelayMs: 50, jitterFactor: 0 },
    })

    // Start flushing first item
    queue.queue({ path: "/first.md", content: "v1", sourceEventId: "1" })
    const flushPromise = queue.flush()

    // Queue a second item during the flush (simulates queue() during active doFlush)
    // Use setTimeout to ensure it's queued after flush starts but before it finishes
    setTimeout(() => {
      queue.queue({ path: "/second.md", content: "v2", sourceEventId: "2" })
    }, 10)

    // Wait for flush to complete — should drain BOTH items
    await flushPromise

    const writes = history.filter((h) => h.startsWith("write:"))
    expect(writes).toContain("write:/first.md:v1")
    expect(writes).toContain("write:/second.md:v2")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// flushGeneration Cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe("flushGeneration cleanup", () => {
  test("clear() resets flushGeneration map", async () => {
    const mockFs = createMockFs()
    const queue = createWriteQueue({ fs: mockFs })

    const inFlightPaths = new Set<string>()
    queue.setWatcher({
      markInFlight: (path: string) => inFlightPaths.add(path),
      clearInFlight: (path: string) => inFlightPaths.delete(path),
    })

    // Queue and flush to populate flushGeneration
    queue.queue({ path: "/a.md", content: "hello", sourceEventId: "1" })
    queue.queue({ path: "/b.md", content: "world", sourceEventId: "2" })
    await queue.forceFlush()

    // Verify in-flight tracking is active
    expect(inFlightPaths.size).toBeGreaterThan(0)

    // clear() should reset the queue state
    queue.clear()

    // Now wait for the old clear timers to fire — they should NOT crash
    // or misbehave because flushGeneration was cleared
    await new Promise((r) => setTimeout(r, 1500))

    // Queue should be fully reset
    expect(queue.getPendingCount()).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Pending Path Rewrite (renamePending / dropPending / renamePendingSubtree)
// ─────────────────────────────────────────────────────────────────────────────

describe("renamePending", () => {
  test("rewrites queued path from old to new", async () => {
    const history: string[] = []
    const queue = createWriteQueue({ fs: createMockFs({ history }) })

    queue.queue({ path: "/vault/old-name.md", content: "hello", sourceEventId: "1" })
    const result = queue.renamePending("/vault/old-name.md", "/vault/new-name.md")

    expect(result).toBe(true)
    expect(queue.getPendingPaths()).toEqual(new Set(["/vault/new-name.md"]))
    expect(queue.getPendingPaths().has("/vault/old-name.md")).toBe(false)

    await queue.forceFlush()
    expect(history).toEqual(["write:/vault/new-name.md"])
  })

  test("returns false if no pending write for path", () => {
    const queue = createWriteQueue({ fs: createMockFs() })

    const result = queue.renamePending("/vault/nonexistent.md", "/vault/other.md")
    expect(result).toBe(false)
  })

  test("flushed write goes to new path after renamePending", async () => {
    const history: string[] = []
    const mockFs = createMockFs({ history })
    const writtenContent = new Map<string, string>()
    mockFs.writeFileSync = (path: string, content: string) => {
      history.push(`write:${path}`)
      writtenContent.set(path, content)
    }

    const queue = createWriteQueue({ fs: mockFs })

    queue.queue({ path: "/old.md", content: "my content", sourceEventId: "1" })
    queue.renamePending("/old.md", "/new.md")
    await queue.forceFlush()

    expect(history).toEqual(["write:/new.md"])
    expect(writtenContent.get("/new.md")).toBe("my content")
    expect(writtenContent.has("/old.md")).toBe(false)
  })

  test("no-op when path has already flushed", async () => {
    const queue = createWriteQueue({ fs: createMockFs() })

    queue.queue({ path: "/test.md", content: "data", sourceEventId: "1" })
    await queue.forceFlush()

    // Path is no longer pending — renamePending should return false
    const result = queue.renamePending("/test.md", "/renamed.md")
    expect(result).toBe(false)
  })
})

describe("dropPending", () => {
  test("cancels a queued write", async () => {
    const history: string[] = []
    const queue = createWriteQueue({ fs: createMockFs({ history }) })

    queue.queue({ path: "/vault/deleted.md", content: "gone", sourceEventId: "1" })
    const result = queue.dropPending("/vault/deleted.md")

    expect(result).toBe(true)
    expect(queue.getPendingCount()).toBe(0)

    await queue.forceFlush()
    expect(history).toEqual([])
  })

  test("returns false if no pending write for path", () => {
    const queue = createWriteQueue({ fs: createMockFs() })
    expect(queue.dropPending("/nonexistent.md")).toBe(false)
  })
})

describe("renamePendingSubtree", () => {
  test("rewrites all descendant paths under renamed directory", async () => {
    const history: string[] = []
    const queue = createWriteQueue({ fs: createMockFs({ history }) })

    queue.queue({ path: "/vault/old-dir/a.md", content: "a", sourceEventId: "1" })
    queue.queue({ path: "/vault/old-dir/sub/b.md", content: "b", sourceEventId: "2" })
    queue.queue({ path: "/vault/other/c.md", content: "c", sourceEventId: "3" })

    const count = queue.renamePendingSubtree("/vault/old-dir", "/vault/new-dir")

    expect(count).toBe(2)
    expect(queue.getPendingPaths()).toEqual(
      new Set(["/vault/new-dir/a.md", "/vault/new-dir/sub/b.md", "/vault/other/c.md"]),
    )

    await queue.forceFlush()
    expect(history).toContain("write:/vault/new-dir/a.md")
    expect(history).toContain("write:/vault/new-dir/sub/b.md")
    expect(history).toContain("write:/vault/other/c.md")
    expect(history).not.toContain("write:/vault/old-dir/a.md")
    expect(history).not.toContain("write:/vault/old-dir/sub/b.md")
  })

  test("rewrites exact-match directory path (no trailing slash)", async () => {
    const history: string[] = []
    const queue = createWriteQueue({ fs: createMockFs({ history }) })

    // A pending write whose path exactly matches the old prefix (the directory itself)
    queue.queue({ path: "/vault/old-dir", content: "index", sourceEventId: "1" })

    const count = queue.renamePendingSubtree("/vault/old-dir", "/vault/new-dir")
    expect(count).toBe(1)
    expect(queue.getPendingPaths()).toEqual(new Set(["/vault/new-dir"]))
  })

  test("returns 0 when no pending writes match prefix", () => {
    const queue = createWriteQueue({ fs: createMockFs() })
    queue.queue({ path: "/vault/other/a.md", content: "a", sourceEventId: "1" })

    const count = queue.renamePendingSubtree("/vault/old-dir", "/vault/new-dir")
    expect(count).toBe(0)
  })

  test("does not match paths that merely start with prefix string", () => {
    const queue = createWriteQueue({ fs: createMockFs() })
    // "/vault/old-directory/x.md" starts with "/vault/old-dir" but is NOT under it
    queue.queue({ path: "/vault/old-directory/x.md", content: "x", sourceEventId: "1" })

    const count = queue.renamePendingSubtree("/vault/old-dir", "/vault/new-dir")
    expect(count).toBe(0)
    expect(queue.getPendingPaths()).toEqual(new Set(["/vault/old-directory/x.md"]))
  })
})
