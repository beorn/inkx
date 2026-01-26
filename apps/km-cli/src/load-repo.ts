/**
 * Shared Repo Loading
 *
 * Unified repo loading with optional progress display.
 * Used by CLI commands to load repos consistently.
 */

import type { Repo, CreateRepoOptions } from "@km/storage"

export interface LoadRepoOptions extends CreateRepoOptions {
  /** Show progress display during loading (default: false) */
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
export async function loadRepo(
  rootPath: string,
  options: LoadRepoOptions = {},
): Promise<Repo> {
  const { showProgress = false, ...createOptions } = options

  // Ensure loadFiles is set (default behavior)
  if (createOptions.loadFiles === undefined) {
    createOptions.loadFiles = true
  }

  const { createRepo, runGenerator } = await import("@km/storage")

  if (showProgress) {
    // Use steps runner for progress display
    const { steps } = await import("@beorn/inkx-ui/progress")

    let repo: Repo

    await steps({
      loadRepo: function* () {
        repo = yield* createRepo(rootPath, createOptions)
        return repo
      },
    }).run({ clear: true })

    return repo!
  } else {
    // Silent loading
    return runGenerator(createRepo(rootPath, createOptions))
  }
}
