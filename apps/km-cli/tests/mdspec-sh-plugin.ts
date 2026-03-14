// mdspec plugin for km sh REPL - persistent subprocess execution
// Manages state files for both regular bash blocks and km sh REPL blocks

import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CmdSession } from "mdspec/cmdSession"
import { buildScript, buildHookScript } from "mdspec/shell"
import { splitNorm } from "mdspec/core"
import { bunShell } from "mdspec/bun"
import { DEFAULTS } from "mdspec/constants"
import type { Plugin, FileOpts, BlockOpts, ReplResult } from "mdspec/types"

/**
 * km sh mdspec plugin
 * Handles both regular bash blocks (for setup/hooks) and km sh REPL blocks
 * Uses shared state files for env/cwd/functions persistence
 */
export default async function kmShPlugin(opts: FileOpts): Promise<Plugin> {
  // Create temp directory for state files (shared across all blocks)
  const stateDir = mkdtempSync(join(tmpdir(), "mdspec-"))
  const envFile = join(stateDir, ".env")
  const cwdFile = join(stateDir, ".cwd")
  const funcFile = join(stateDir, ".functions")

  // Write initial state files
  writeFileSync(envFile, "")
  writeFileSync(cwdFile, process.cwd())
  writeFileSync(funcFile, "")

  // Write all file= blocks to temp dir
  for (const [filename, content] of opts.files) {
    const filePath = join(stateDir, filename)
    writeFileSync(filePath, content)
  }

  // Track active session for cleanup
  let currentSession: CmdSession | null = null

  return {
    block(blockOpts: BlockOpts) {
      // Skip file= blocks (already written in factory)
      if (blockOpts.file) return null

      // Only handle shell blocks
      if (!["console", "sh", "bash"].includes(blockOpts.type)) {
        return null
      }

      // Handle reset option: clear state files
      if (blockOpts.reset) {
        writeFileSync(envFile, "")
        writeFileSync(cwdFile, process.cwd())
        writeFileSync(funcFile, "")
      }

      // Check if this is a cmd= block (persistent subprocess REPL mode)
      if (blockOpts.cmd && typeof blockOpts.cmd === "string") {
        // Extract timing options
        const minWait = typeof blockOpts.minWait === "number" ? blockOpts.minWait : 100
        const maxWait = typeof blockOpts.maxWait === "number" ? blockOpts.maxWait : 2000
        const startupDelay = typeof blockOpts.startupDelay === "number" ? blockOpts.startupDelay : 100

        // Special handling for km sh blocks - wrap with km function
        const isKmShBlock = blockOpts.cmd.startsWith("km sh")
        const command = isKmShBlock
          ? `
            km() {
              bun run ${process.env.ROOT ? `${process.env.ROOT}/apps/km-cli/src/index.ts` : "./apps/km-cli/src/index.ts"} "$@"
            }
            ${blockOpts.cmd}
          `
          : blockOpts.cmd

        // Create session that inherits bash state
        currentSession = new CmdSession(command, {
          cwd: process.cwd(),
          env: {
            ...process.env,
            // Enable OSC 133 for km sh blocks
            ...(isKmShBlock ? { TERM_SHELL_INTEGRATION: "1" } : {}),
          },
          minWait,
          maxWait,
          startupDelay,
          useOsc133: isKmShBlock, // km sh supports OSC 133 markers
          // Inherit bash session state
          envFile,
          cwdFile,
          funcFile,
        })

        // Return executor for REPL
        return async (cmd: string): Promise<ReplResult> => {
          if (!currentSession) {
            throw new Error("Session not initialized")
          }

          try {
            const result = await currentSession.execute(cmd)
            return {
              stdout: result.stdout.toString().trimEnd(),
              stderr: result.stderr.toString().trimEnd(),
              exitCode: result.exitCode,
            }
          } catch (error) {
            return {
              stdout: "",
              stderr: String(error),
              exitCode: 1,
            }
          }
        }
      }

      // Regular bash block - use bash execution with state persistence
      return async (cmd: string): Promise<ReplResult> => {
        const timeout = (blockOpts.timeout as number | undefined) ?? DEFAULTS.TIMEOUT
        const cwd = (blockOpts.cwd as string | undefined) ?? process.cwd()

        // Convert BlockOpts to options for buildScript
        const scriptOpts = {
          exit: blockOpts.exit as number | undefined,
          cwd: blockOpts.cwd as string | undefined,
          env: blockOpts.env as Record<string, string> | undefined,
          reset: blockOpts.reset as boolean | undefined,
          timeout: blockOpts.timeout as number | undefined,
        }

        // Build script with state persistence
        const script = buildScript([cmd], scriptOpts, envFile, cwdFile, funcFile)

        // Execute command
        const res = await bunShell(["bash", "-lc", script], {
          cwd,
          env: process.env as Record<string, string>,
          timeout,
        })

        // Parse output
        const stdout = splitNorm(res.stdout.toString())
        const stderr = splitNorm(res.stderr.toString())

        // Remove trailing empty lines
        while (stdout.length > 0 && stdout[stdout.length - 1] === "") {
          stdout.pop()
        }
        while (stderr.length > 0 && stderr[stderr.length - 1] === "") {
          stderr.pop()
        }

        return {
          stdout: stdout.join("\n"),
          stderr: stderr.join("\n"),
          exitCode: res.exitCode ?? 0,
        }
      }
    },

    async beforeAll(): Promise<void> {
      await callHook("beforeAll")
    },

    async afterAll(): Promise<void> {
      await callHook("afterAll")
      if (currentSession) {
        await currentSession.close()
        currentSession = null
      }
    },

    async beforeEach(): Promise<void> {
      await callHook("beforeEach")
    },

    async afterEach(): Promise<void> {
      await callHook("afterEach")
      // Close session after each block (fresh session per block)
      if (currentSession) {
        await currentSession.close()
        currentSession = null
      }
    },
  }

  // Helper to call bash hooks
  async function callHook(hookName: string): Promise<void> {
    const script = buildHookScript(hookName, envFile, cwdFile, funcFile)
    await bunShell(["bash", "-lc", script], {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })
  }
}
