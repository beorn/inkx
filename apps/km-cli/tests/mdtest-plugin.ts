// mdtest plugin for km CLI - fast execution via bunShell
// Executes km commands using bunShell for speed without subprocess overhead

import { $ } from "bun"
import type {
  Plugin,
  FileOpts,
  BlockOpts,
  ReplResult,
} from "@beorn/mdtest/types"
import { bash } from "@beorn/mdtest/plugins/bash"

/**
 * km CLI mdtest plugin
 * Executes km commands using bunShell for fast testing
 * Falls back to bash plugin for non-km commands
 */
export default function kmPlugin(opts: FileOpts): Plugin {
  // Create bash plugin as fallback for non-km commands
  // bash() always returns Plugin synchronously, not Promise<Plugin>
  const bashPlugin = bash(opts) as Plugin

  return {
    block(blockOpts: BlockOpts) {
      // Only handle console blocks
      if (blockOpts.type !== "console") {
        // Delegate to bash for other block types
        return bashPlugin.block(blockOpts)
      }

      // Parse commands to check if this block has km commands
      const lines = blockOpts.content.split("\n")
      const commands = lines
        .filter((l) => l.startsWith("$"))
        .map((l) => l.slice(1).trim())

      // Check if all commands start with 'km '
      const hasKmCommands = commands.some((c) => c.startsWith("km "))
      const hasOtherCommands = commands.some((c) => !c.startsWith("km "))

      // No km commands - delegate to bash
      if (!hasKmCommands) {
        return bashPlugin.block(blockOpts)
      }

      // For mixed commands, fall back to bash
      if (hasOtherCommands) {
        return bashPlugin.block(blockOpts)
      }

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
      // Delegate to bash plugin
      await bashPlugin.beforeAll?.()
    },

    async afterAll(): Promise<void> {
      // Delegate to bash plugin
      await bashPlugin.afterAll?.()
    },

    async beforeEach(): Promise<void> {
      // Delegate to bash plugin
      await bashPlugin.beforeEach?.()
    },

    async afterEach(): Promise<void> {
      // Delegate to bash plugin
      await bashPlugin.afterEach?.()
    },
  }
}
