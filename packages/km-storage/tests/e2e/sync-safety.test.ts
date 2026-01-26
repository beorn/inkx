/**
 * E2E Sync Safety Tests
 *
 * These tests verify that sync operations ONLY touch markdown files
 * and never corrupt source code, binaries, or other non-markdown files.
 *
 * Critical safety test for km-me0n bug.
 */

import { describe, test, expect } from "bun:test"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { SyncManager } from "../../src/watch/sync.ts"
import { getAllNodes, applyEventWithDb } from "../../src/index.ts"
import { withTestEnv } from "@km/storage"

/**
 * Original file contents - non-markdown files MUST remain unchanged
 */
const ORIGINAL_FILES: Record<string, string> = {
  // Markdown files (can be modified by sync)
  "README.md": "# Test Vault\n\n- [ ] Task 1\n- [x] Task 2\n",
  "notes/daily.md": "# Daily Notes\n\nSome content here.\n",

  // Source code files (MUST NOT be touched)
  "src/index.ts": `export function main(): void {\n  console.log("Hello, world!");\n}\n`,
  "src/utils.ts": `export const VERSION = "1.0.0";\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`,
  "src/config.json": `{\n  "name": "test-app",\n  "version": "1.0.0"\n}\n`,

  // Other common file types (MUST NOT be touched)
  ".gitignore": "node_modules/\n.km/\n*.log\n",
  "package.json": `{\n  "name": "test-vault",\n  "private": true\n}\n`,
}

/**
 * Create the test vault with all file types
 */
function createTestVault(vaultDir: string): void {
  // Create directories
  mkdirSync(join(vaultDir, "src"), { recursive: true })
  mkdirSync(join(vaultDir, "notes"), { recursive: true })

  // Write all files
  for (const [relativePath, content] of Object.entries(ORIGINAL_FILES)) {
    const fullPath = join(vaultDir, relativePath)
    writeFileSync(fullPath, content)
  }
}

/**
 * Verify that all non-markdown files are unchanged
 */
function verifyNonMdFilesUnchanged(vaultDir: string): {
  passed: boolean
  errors: string[]
} {
  const errors: string[] = []

  for (const [relativePath, originalContent] of Object.entries(
    ORIGINAL_FILES,
  )) {
    // Skip markdown files - they're expected to potentially change
    if (relativePath.endsWith(".md")) continue

    const fullPath = join(vaultDir, relativePath)

    if (!existsSync(fullPath)) {
      errors.push(`File deleted: ${relativePath}`)
      continue
    }

    const currentContent = readFileSync(fullPath, "utf-8")
    if (currentContent !== originalContent) {
      errors.push(
        `File corrupted: ${relativePath}\n` +
          `  Expected (${originalContent.length} chars): ${originalContent.slice(0, 80)}...\n` +
          `  Got (${currentContent.length} chars): ${currentContent.slice(0, 80)}...`,
      )
    }
  }

  return { passed: errors.length === 0, errors }
}

describe("E2E Sync Safety", () => {
  describe("syncFromFs", () => {
    test("should import markdown files into database", () =>
      withTestEnv(async ({ vaultDir, data }) => {
        createTestVault(vaultDir)

        const manager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
          useWorker: false,
          db: data.database,
        })

        const result = await manager.syncFromFs()

        // Should have processed files
        expect(result.processed).toBeGreaterThan(0)

        // Should have markdown file nodes
        const nodes = getAllNodes(data.database)
        const fileNodes = nodes.filter((n) => n.type === "file")

        // Should have exactly 2 markdown files (README.md and notes/daily.md)
        const mdFiles = fileNodes.filter((n) => n.fs_path?.endsWith(".md"))
        expect(mdFiles.length).toBe(2)
      }))

    test("should not modify non-markdown files during import", () =>
      withTestEnv(async ({ vaultDir, data }) => {
        createTestVault(vaultDir)

        const manager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
          useWorker: false,
          db: data.database,
        })

        await manager.syncFromFs()

        // Verify all non-markdown files are unchanged
        const verification = verifyNonMdFilesUnchanged(vaultDir)
        expect(verification.errors).toEqual([])
        expect(verification.passed).toBe(true)
      }))
  })

  describe("syncToFs", () => {
    test("should only write .md files to filesystem", () =>
      withTestEnv(async ({ vaultDir, data }) => {
        createTestVault(vaultDir)

        // First import from filesystem
        const manager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
          useWorker: false,
          db: data.database,
        })

        await manager.syncFromFs()

        // Now sync back to filesystem
        const result = await manager.syncToFs()

        // Should have written only markdown files
        expect(result.written).toBe(2)

        // CRITICAL: Verify non-markdown files are unchanged
        const verification = verifyNonMdFilesUnchanged(vaultDir)
        if (!verification.passed) {
          console.error("Non-markdown files were corrupted:")
          for (const error of verification.errors) {
            console.error("  ", error)
          }
        }
        expect(verification.errors).toEqual([])
        expect(verification.passed).toBe(true)
      }))

    test("should never write source code files", () =>
      withTestEnv(async ({ vaultDir, data }) => {
        createTestVault(vaultDir)

        const manager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
          useWorker: false,
          db: data.database,
        })

        await manager.syncFromFs()
        await manager.syncToFs()

        // Read the source files - they should be UNCHANGED
        const indexTs = readFileSync(join(vaultDir, "src/index.ts"), "utf-8")
        expect(indexTs).toBe(ORIGINAL_FILES["src/index.ts"]!)

        const utilsTs = readFileSync(join(vaultDir, "src/utils.ts"), "utf-8")
        expect(utilsTs).toBe(ORIGINAL_FILES["src/utils.ts"]!)

        const configJson = readFileSync(
          join(vaultDir, "src/config.json"),
          "utf-8",
        )
        expect(configJson).toBe(ORIGINAL_FILES["src/config.json"]!)
      }))
  })

  describe("round-trip safety", () => {
    test("should preserve all non-markdown files through multiple sync cycles", () =>
      withTestEnv(async ({ vaultDir, data }) => {
        createTestVault(vaultDir)

        const manager = new SyncManager({
          vaultPath: vaultDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
          useWorker: false,
          db: data.database,
        })

        // Multiple round-trips
        for (let i = 0; i < 3; i++) {
          await manager.syncFromFs()
          await manager.syncToFs()
        }

        // All non-markdown files should be unchanged
        const verification = verifyNonMdFilesUnchanged(vaultDir)
        expect(verification.errors).toEqual([])
        expect(verification.passed).toBe(true)
      }))
  })
})
