/**
 * Tests for ParsePool worker pool
 * km-fast-md.6: Worker pool for parallel parsing
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { ParsePool } from "../src/parse-pool.ts";

const TEST_DIR = "/tmp/kmtest-parse-pool";

describe("ParsePool", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("parses single file", async () => {
    const filePath = join(TEST_DIR, "test.md");
    writeFileSync(filePath, "# Hello\n\n- [ ] Task 1\n- [x] Task 2");

    const pool = new ParsePool({ poolSize: 1 });
    await pool.start();

    try {
      const result = await pool.parse("test-node", filePath);

      expect(result.nodeId).toBe("test-node");
      expect(result.fsPath).toBe(filePath);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    } finally {
      await pool.shutdown();
    }
  });

  test("parses multiple files in parallel", async () => {
    // Create test files
    const files = [];
    for (let i = 0; i < 10; i++) {
      const filePath = join(TEST_DIR, `test-${i}.md`);
      writeFileSync(filePath, `# File ${i}\n\n- [ ] Task ${i}`);
      files.push({ nodeId: `node-${i}`, fsPath: filePath });
    }

    const pool = new ParsePool({ poolSize: 4 });
    await pool.start();

    try {
      const results = await pool.parseMany(files);

      expect(results.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        const result = results.find((r) => r.nodeId === `node-${i}`);
        expect(result).toBeDefined();
        expect(result!.error).toBeUndefined();
        expect(result!.nodes.length).toBeGreaterThan(0);
      }
    } finally {
      await pool.shutdown();
    }
  });

  test("handles parse errors gracefully", async () => {
    const filePath = join(TEST_DIR, "nonexistent.md");

    const pool = new ParsePool({ poolSize: 1 });
    await pool.start();

    try {
      // Worker rejects the promise when file doesn't exist
      await expect(pool.parse("test-node", filePath)).rejects.toThrow();
    } finally {
      await pool.shutdown();
    }
  });

  test("respects abort callback in parseMany", async () => {
    // Create many files
    const files = [];
    for (let i = 0; i < 20; i++) {
      const filePath = join(TEST_DIR, `test-${i}.md`);
      writeFileSync(filePath, `# File ${i}`);
      files.push({ nodeId: `node-${i}`, fsPath: filePath });
    }

    const pool = new ParsePool({ poolSize: 2 });
    await pool.start();

    let parseCount = 0;
    try {
      const results = await pool.parseMany(
        files,
        () => {
          parseCount++;
        },
        () => parseCount >= 5, // Abort after 5 parses
      );

      // Should have fewer results than total files due to abort
      expect(results.length).toBeLessThan(files.length);
    } finally {
      await pool.shutdown();
    }
  });
});
