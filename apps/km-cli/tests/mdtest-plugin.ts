// mdtest plugin for km CLI - fast execution via bunShell
// Executes km commands using bunShell for speed without subprocess overhead

import { $ } from "bun"
import type {
  Plugin,
  FileOpts,
  BlockOpts,
  ReplResult,
} from "../../../vendor/beorn-mdtest/src/types.js"

/**
 * km CLI mdtest plugin
 * Executes km commands using bunShell for fast testing
 */
export default function kmPlugin(_opts: FileOpts): Plugin {
  // File-level state - reserved for future use
  // let vaultPath: string | null = null

  return {
    block(blockOpts: BlockOpts) {
      // Only handle console blocks
      if (blockOpts.type !== "console") return null

      // Parse commands to check if this block has km commands
      const lines = blockOpts.content.split("\n")
      const commands = lines
        .filter((l) => l.startsWith("$"))
        .map((l) => l.slice(1).trim())

      // Check if all commands start with 'km '
      const hasKmCommands = commands.some((c) => c.startsWith("km "))
      const hasOtherCommands = commands.some((c) => !c.startsWith("km "))

      // Only handle pure km command blocks
      if (!hasKmCommands) return null

      // For mixed commands, fall back to bash
      if (hasOtherCommands) return null

      // Reset state if reset flag is set
      // (currently stateless - reserved for future use)

      // Return executor function for km commands
      return async (cmd: string): Promise<ReplResult> => {
        try {
          // Set up km function to use source tree (same as test setup)
          const kmPath = process.env.ROOT
            ? `${process.env.ROOT}/apps/km-cli/src/index.ts`
            : "./apps/km-cli/src/index.ts"

          // Execute using bunShell
          const result = await $`bash -c ${`
            set -e
            km() { bun run ${kmPath} "$@"; }
            ${cmd}
          `}`.quiet()

          return {
            stdout: result.stdout.toString().trimEnd(),
            stderr: result.stderr.toString().trimEnd(),
            exitCode: result.exitCode,
          }
        } catch (error) {
          // Execution failed
          if (error && typeof error === "object" && "exitCode" in error) {
            const err = error as {
              exitCode: number
              stdout: { toString(): string }
              stderr: { toString(): string }
            }
            return {
              stdout: err.stdout.toString().trimEnd(),
              stderr: err.stderr.toString().trimEnd(),
              exitCode: err.exitCode,
            }
          }

          // Unknown error
          return {
            stdout: "",
            stderr: String(error),
            exitCode: 1,
          }
        }
      }
    },

    async beforeAll(): Promise<void> {
      // Hook called before all blocks
      // Could initialize shared resources here
    },

    async afterAll(): Promise<void> {
      // Hook called after all blocks
      // Could clean up shared resources here
    },

    async beforeEach(): Promise<void> {
      // Hook called before each block
    },

    async afterEach(): Promise<void> {
      // Hook called after each block
    },
  }
}
