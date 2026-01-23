/**
 * E2E Sync Safety Tests
 *
 * These tests verify that sync operations ONLY touch markdown files
 * and never corrupt source code, binaries, or other non-markdown files.
 *
 * Critical safety test for km-me0n bug.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { SyncManager } from "../../src/watch/sync.ts";
import { getAllNodes, resetDb, closeDb, applyEvent } from "../../src/index.ts";
import { setKmDir, setDatabase } from "../../src/emit.ts";

// Fixed test directory for isolation
const TEST_DIR = join("/tmp", "kmtest-e2e-sync-safety");
const VAULT_DIR = join(TEST_DIR, "vault");
const KM_DIR = join(VAULT_DIR, ".km");

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
};

/**
 * Create the test vault with all file types
 */
function createTestVault(): void {
  // Create directories
  mkdirSync(VAULT_DIR, { recursive: true });
  mkdirSync(KM_DIR, { recursive: true });
  mkdirSync(join(VAULT_DIR, "src"), { recursive: true });
  mkdirSync(join(VAULT_DIR, "notes"), { recursive: true });

  // Write all files
  for (const [relativePath, content] of Object.entries(ORIGINAL_FILES)) {
    const fullPath = join(VAULT_DIR, relativePath);
    writeFileSync(fullPath, content);
  }
}

/**
 * Verify that all non-markdown files are unchanged
 */
function verifyNonMdFilesUnchanged(): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [relativePath, originalContent] of Object.entries(ORIGINAL_FILES)) {
    // Skip markdown files - they're expected to potentially change
    if (relativePath.endsWith(".md")) continue;

    const fullPath = join(VAULT_DIR, relativePath);

    if (!existsSync(fullPath)) {
      errors.push(`File deleted: ${relativePath}`);
      continue;
    }

    const currentContent = readFileSync(fullPath, "utf-8");
    if (currentContent !== originalContent) {
      errors.push(
        `File corrupted: ${relativePath}\n` +
          `  Expected (${originalContent.length} chars): ${originalContent.slice(0, 80)}...\n` +
          `  Got (${currentContent.length} chars): ${currentContent.slice(0, 80)}...`,
      );
    }
  }

  return { passed: errors.length === 0, errors };
}

describe.serial("E2E Sync Safety", () => {
  beforeEach(() => {
    // Clean up test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    // Create test vault with all file types
    createTestVault();

    // Configure database to use test directory
    setKmDir(KM_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe.serial("syncFromFs", () => {
    test("should import markdown files into database", async () => {
      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      const result = await manager.syncFromFs();

      // Should have processed files
      expect(result.processed).toBeGreaterThan(0);

      // Should have markdown file nodes
      const nodes = getAllNodes();
      const fileNodes = nodes.filter((n) => n.type === "file");

      // Should have exactly 2 markdown files (README.md and notes/daily.md)
      const mdFiles = fileNodes.filter((n) => n.fs_path?.endsWith(".md"));
      expect(mdFiles.length).toBe(2);
    });

    test("should not modify non-markdown files during import", async () => {
      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      // Verify all non-markdown files are unchanged
      const verification = verifyNonMdFilesUnchanged();
      expect(verification.errors).toEqual([]);
      expect(verification.passed).toBe(true);
    });
  });

  describe.serial("syncToFs", () => {
    test("should only write .md files to filesystem", async () => {
      // First import from filesystem
      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();

      // Now sync back to filesystem
      const result = await manager.syncToFs();

      // Should have written only markdown files
      expect(result.written).toBe(2);

      // CRITICAL: Verify non-markdown files are unchanged
      const verification = verifyNonMdFilesUnchanged();
      if (!verification.passed) {
        console.error("Non-markdown files were corrupted:");
        for (const error of verification.errors) {
          console.error("  ", error);
        }
      }
      expect(verification.errors).toEqual([]);
      expect(verification.passed).toBe(true);
    });

    test("should never write source code files", async () => {
      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      await manager.syncFromFs();
      await manager.syncToFs();

      // Read the source files - they should be UNCHANGED
      const indexTs = readFileSync(join(VAULT_DIR, "src/index.ts"), "utf-8");
      expect(indexTs).toBe(ORIGINAL_FILES["src/index.ts"]!);

      const utilsTs = readFileSync(join(VAULT_DIR, "src/utils.ts"), "utf-8");
      expect(utilsTs).toBe(ORIGINAL_FILES["src/utils.ts"]!);

      const configJson = readFileSync(join(VAULT_DIR, "src/config.json"), "utf-8");
      expect(configJson).toBe(ORIGINAL_FILES["src/config.json"]!);
    });
  });

  describe.serial("round-trip safety", () => {
    test("should preserve all non-markdown files through multiple sync cycles", async () => {
      const manager = new SyncManager({
        vaultPath: VAULT_DIR,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      });

      // Multiple round-trips
      for (let i = 0; i < 3; i++) {
        await manager.syncFromFs();
        await manager.syncToFs();
      }

      // All non-markdown files should be unchanged
      const verification = verifyNonMdFilesUnchanged();
      expect(verification.errors).toEqual([]);
      expect(verification.passed).toBe(true);
    });
  });
});
