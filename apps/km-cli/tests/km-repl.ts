/**
 * km-repl - In-process km command execution for mdtest
 *
 * This plugin enables fast in-process execution of km commands during testing,
 * avoiding subprocess overhead. Provides ~8-15x speedup over bunShell approach.
 *
 * Usage:
 * ```yaml
 * ---
 * mdtest:
 *   plugin: ./km-repl.ts
 *   fixture: two-columns
 *   memory: true  # Use :memory: database for max speed
 * ---
 * ```
 */

// Disable colors BEFORE any imports - chalk caches color support at import time
process.env.NO_COLOR = "1"

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { Plugin, ReplResult } from "@beorn/mdtest/types"
import { executeKmCommand } from "../src/execute.ts"
import { closeDb } from "@km/storage/internal/db-instance.ts"

interface Opts {
  fixture?: string
  reset?: boolean
  memory?: boolean // Use :memory: database for speed
}

/**
 * Setup a test fixture (temp repo with sample data)
 */
function setupFixture(fixture?: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "kmtest-"))

  // Create .km directory (required even for memory mode)
  mkdirSync(join(tempDir, ".km"))

  // Create fixture files based on fixture name
  if (fixture === "two-columns") {
    writeFileSync(
      join(tempDir, "board.md"),
      `# Test Board
## Tasks
- [ ] Task A
- [ ] Task B
- [ ] Task C
## Done
- [x] Task D
`,
    )
  } else if (fixture === "path-navigation") {
    writeFileSync(
      join(tempDir, "board.md"),
      `# Test Board
## Section A
- [ ] Task A1
- [ ] Task A2
- [ ] Task A3
## Section B
- [ ] Task B1
- [ ] Task B2
`,
    )
  } else if (fixture === "empty-column") {
    // Board with one populated column and one empty column
    writeFileSync(
      join(tempDir, "empty-col.md"),
      `# Board
## Tasks
- [ ] Task A
- [ ] Task B
## Empty
`,
    )
  } else if (fixture === "basic-repo") {
    writeFileSync(join(tempDir, "inbox.md"), `# Inbox\n- [ ] Task 1\n`)
    writeFileSync(join(tempDir, "projects.md"), `# Projects\n## Project A\n`)
  } else if (fixture === "empty-repo") {
    // Empty repo - no files
  } else {
    // Default fixture: single task list
    writeFileSync(
      join(tempDir, "test.md"),
      `# Test\n## Tasks\n- [ ] Task A\n- [ ] Task B\n`,
    )
  }

  return tempDir
}

/**
 * km-repl plugin factory
 *
 * @param fileOpts - File-level options from frontmatter
 * @returns Plugin instance
 */
export default async function kmRepl(fileOpts: Opts): Promise<Plugin> {
  // File-level state (persists across blocks unless reset)
  let repoPath: string | null = null
  let currentFixture: string | null = null

  return {
    block(blockOpts) {
      const opts = { ...fileOpts, ...blockOpts } as Opts

      // Handle reset or fixture change
      // Only reset on EXPLICIT fixture change at block level
      // If block specifies reset=true, use block's fixture (or file's if not specified)
      // If block specifies fixture=X, switch to X
      // Otherwise, inherit the current fixture (don't reset)
      const blockFixture = blockOpts.fixture as string | undefined
      const fixtureChanged =
        blockFixture !== undefined && blockFixture !== currentFixture
      const explicitReset = !!blockOpts.reset
      const shouldReset = !repoPath || explicitReset || fixtureChanged

      // When reset is requested, use block's fixture or file's fixture
      const targetFixture =
        blockFixture ?? (explicitReset ? fileOpts.fixture : currentFixture)

      if (shouldReset) {
        // Clean up old repo - must close database before deleting directory
        if (repoPath) {
          try {
            closeDb() // Close database handle before deleting files
            rmSync(repoPath, { recursive: true, force: true })
          } catch {
            // Ignore cleanup errors
          }
        }

        // Create new repo with fixture
        repoPath = setupFixture(targetFixture ?? undefined)
        currentFixture = targetFixture ?? null

        // Set environment variable for memory mode
        if (opts.memory) {
          process.env.KM_DB_PATH = ":memory:"
        } else {
          delete process.env.KM_DB_PATH
        }
      }

      // Skip non-console blocks
      if (
        !blockOpts.type ||
        !["console", "sh", "bash"].includes(blockOpts.type as string)
      ) {
        return null
      }

      // Return executor function
      return async (cmd: string): Promise<ReplResult | null> => {
        // Only handle km commands
        if (!cmd.trim().startsWith("km ")) {
          return null // Fall back to bash plugin
        }

        try {
          // Execute in-process with repo path as cwd
          const result = await executeKmCommand(cmd, {
            cwd: repoPath!,
            env: opts.memory ? { KM_DB_PATH: ":memory:" } : {},
          })

          return result
        } catch (error) {
          return {
            stdout: "",
            stderr: String(error),
            exitCode: 1,
          }
        }
      }
    },

    // Clean up repo on teardown
    async afterAll() {
      if (repoPath) {
        try {
          closeDb() // Close database handle before deleting files
          rmSync(repoPath, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
        repoPath = null
      }
    },
  }
}
