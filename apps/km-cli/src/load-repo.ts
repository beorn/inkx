/**
 * Shared Repo Loading
 *
 * Unified repo loading with optional progress display.
 * Used by CLI commands to load repos consistently.
 */

import type { Repo, CreateRepoOptions } from "@km/storage"
import { createTerm } from "@silvery/ag-react"
import { existsSync } from "fs"

const term = createTerm(process)

export interface LoadRepoOptions extends CreateRepoOptions {
  /** Show progress display during loading (default: auto-detect TTY) */
  showProgress?: boolean
}

/**
 * Load a repo with optional progress display.
 *
 * @example
 * // Silent loading (default)
 * const repo = await loadRepo("/path/to/repo")
 *
 * // With progress display
 * const repo = await loadRepo("/path/to/repo", { showProgress: true })
 *
 * // With discoverOnly for fast initial render
 * const repo = await loadRepo("/path/to/repo", {
 *   showProgress: true,
 *   discoverOnly: true,
 * })
 */
export async function loadRepo(rootPath: string, options: LoadRepoOptions = {}): Promise<Repo> {
  if (!existsSync(rootPath)) {
    console.error(term.red("✖ Vault not found\n"))
    console.error(`  Path: ${term.dim(rootPath)}`)
    console.error(term.dim("\n  Check the path exists, or use --repo <path> to specify a different vault."))
    process.exit(1)
  }

  // Auto-detect TTY: show progress in interactive mode, silent in scripts/pipes
  const { showProgress = process.stdout.isTTY === true, ...createOptions } = options

  // Ensure loadFiles is set (default behavior)
  if (createOptions.loadFiles === undefined) {
    createOptions.loadFiles = true
  }

  const { createRepo } = await import("@km/storage")
  const { runGenerator } = await import("@km/core")

  if (showProgress) {
    // Use steps runner for progress display
    const { steps } = await import("@silvery/ag-react/ui/progress")

    let repo: Repo | undefined

    await steps({
      loadRepo: function* () {
        repo = yield* createRepo(rootPath, createOptions)
        return repo
      },
    }).run({ clear: false })

    if (!repo) {
      throw new Error("Failed to load repo")
    }
    return repo
  } else {
    // Silent loading
    return runGenerator(createRepo(rootPath, createOptions))
  }
}
