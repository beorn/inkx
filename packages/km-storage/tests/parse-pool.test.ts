/**
 * Tests for ParsePool worker pool
 * km-fast-md.6: Worker pool for parallel parsing
 * km-disposable.3: Service factory pattern tests
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { createParsePool } from "../src/markdown/parse-pool.ts"

const TEST_DIR = "/tmp/kmtest-parse-pool"

describe("ParsePoolService", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  test("parses single file", async () => {
    const filePath = join(TEST_DIR, "test.md")
    writeFileSync(filePath, "# Hello\n\n- [ ] Task 1\n- [x] Task 2")

    await using pool = createParsePool({ poolSize: 1 })
    await pool.start()

    const result = await pool.parse("test-node", filePath)

    expect(result.nodeId).toBe("test-node")
    expect(result.fsPath).toBe(filePath)
    expect(result.nodes.length).toBeGreaterThan(0)
    expect(result.error).toBeUndefined()
  })

  test("parses multiple files in parallel", async () => {
    // Create test files
    const files = []
    for (let i = 0; i < 10; i++) {
      const filePath = join(TEST_DIR, `test-${i}.md`)
      writeFileSync(filePath, `# File ${i}\n\n- [ ] Task ${i}`)
      files.push({ nodeId: `node-${i}`, fsPath: filePath })
    }

    await using pool = createParsePool({ poolSize: 4 })
    await pool.start()

    const results = await pool.parseMany(files)

    expect(results.length).toBe(10)
    for (let i = 0; i < 10; i++) {
      const result = results.find((r) => r.nodeId === `node-${i}`)
      expect(result).toBeDefined()
      expect(result!.error).toBeUndefined()
      expect(result!.nodes.length).toBeGreaterThan(0)
    }
  })

  test("handles parse errors gracefully", async () => {
    const filePath = join(TEST_DIR, "nonexistent.md")

    await using pool = createParsePool({ poolSize: 1 })
    await pool.start()

    // Worker rejects the promise when file doesn't exist
    await expect(pool.parse("test-node", filePath)).rejects.toThrow()
  })

  test("respects abort callback in parseMany", async () => {
    // Create many files
    const files = []
    for (let i = 0; i < 20; i++) {
      const filePath = join(TEST_DIR, `test-${i}.md`)
      writeFileSync(filePath, `# File ${i}`)
      files.push({ nodeId: `node-${i}`, fsPath: filePath })
    }

    await using pool = createParsePool({ poolSize: 2 })
    await pool.start()

    let parseCount = 0
    const results = await pool.parseMany(
      files,
      () => {
        parseCount++
      },
      () => parseCount >= 5, // Abort after 5 parses
    )

    // Should have fewer results than total files due to abort
    expect(results.length).toBeLessThan(files.length)
  })

  test("tracks service status correctly", async () => {
    const pool = createParsePool({ poolSize: 1 })

    expect(pool.status).toBe("stopped")

    const startPromise = pool.start()
    // Status should be starting or running
    expect(["starting", "running"]).toContain(pool.status)

    await startPromise
    expect(pool.status).toBe("running")

    await pool.stop()
    expect(pool.status).toBe("stopped")
  })

  test("stop is idempotent", async () => {
    await using pool = createParsePool({ poolSize: 1 })
    await pool.start()

    // Multiple stops should not throw
    await pool.stop()
    await pool.stop()
    await pool.stop()

    expect(pool.status).toBe("stopped")
  })

  test("start is idempotent when already running", async () => {
    await using pool = createParsePool({ poolSize: 1 })
    await pool.start()

    // Multiple starts should not throw
    await pool.start()
    await pool.start()

    expect(pool.status).toBe("running")
  })
})
