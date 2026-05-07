/**
 * Open Command
 *
 * `km open <id>` — universal "open in editor" verb.
 *
 * Resolves any node id (canonical path-form `@km/<scope>/<slug>`,
 * legacy bd-form `km-<scope>.<slug>`, ULID, filename, alias, or
 * filesystem path) to its on-disk markdown file and spawns
 * `$EDITOR <abs-path>`. The CLI waits for the editor to exit and
 * mirrors its exit code (0 on success, non-zero on editor error).
 *
 * Editor selection:
 *   1. `$KM_EDITOR` (km-specific override)
 *   2. `$VISUAL`
 *   3. `$EDITOR`
 *   4. `nano` (universal fallback)
 *
 * If even `nano` is missing on PATH, prints a helpful error and
 * exits 1 — but `which` checking happens lazily via the spawn call,
 * so the failure mode mirrors `git commit` ("error: cannot run …").
 *
 * Why universal (not `task edit`):
 *   The originally-planned `task new -e` / `task edit <id>` were
 *   replaced by a single `km open <id>`. Any node has a markdown
 *   file (or its containing parent file does) — restricting the
 *   verb to tasks would force users to remember "is this a task?
 *   then `task edit`, else …?" and split the muscle memory across
 *   verbs. `km open` matches `gh issue view --web`, `git ls-files |
 *   xargs $EDITOR` ergonomics: one verb, every node.
 *
 * Resolves embedded beads via the same "walk up to nearest .md
 * ancestor" rule used by `bd comment add`: a bead living inside a
 * board file lands in the parent file (not a synthesized fragment).
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { resolvePathArg } from "@km/fs-mount"
import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { resolveTaskNode } from "../utils/resolve-task.ts"

const term = createTerm(process)

/**
 * Pure helper — pick the editor command from env vars + fallback.
 *
 * Returns the editor binary (or full command line) we should spawn.
 * The order mirrors POSIX convention: `VISUAL` (interactive editor)
 * beats `EDITOR` (line editor). `KM_EDITOR` is a km-specific
 * override layered on top so users can pin a different editor for
 * `km open` than for `git commit`.
 *
 * Exposed for unit tests so we can pin the precedence without
 * mutating `process.env` from the test harness.
 */
export function pickEditor(env: NodeJS.ProcessEnv = process.env): string {
  // Whitespace-only env vars are treated as unset (mirrors POSIX
  // convention — `EDITOR=' '` is not a sane editor command). Walk
  // the precedence chain explicitly so we don't fall back to nano
  // just because the most-specific var was whitespace.
  for (const candidate of [env.KM_EDITOR, env.VISUAL, env.EDITOR]) {
    if (candidate?.trim()) return candidate
  }
  return "nano"
}

/**
 * Pure helper — resolve a node's `fs_path` to an absolute filesystem
 * path. Walks up the parent chain looking for the nearest ancestor
 * whose `fs_path` points at an existing `.md` file on disk. Mirrors
 * the contract of `resolveBeadFilePath` in `bd-comment.ts`, but
 * generalized for any node (not just beads).
 *
 * Returns null when no on-disk file can be located (e.g. an
 * in-memory node that has never been materialized).
 */
export function resolveNodeFilePath(repo: Repo, repoRoot: string, node: KNode): string | null {
  let current: KNode | null = node
  while (current) {
    const fsPath = current.fs_path
    if (fsPath) {
      // Try as-is first, then with `.md` appended (some fs_paths drop the
      // extension — mirrors bd-comment's robustness).
      const candidates = fsPath.endsWith(".md") ? [fsPath] : [`${fsPath}.md`, fsPath]
      for (const candidate of candidates) {
        const abs = isAbsolute(candidate) ? candidate : join(repoRoot, candidate)
        if (existsSync(abs)) return abs
      }
    }
    if (!current.parent_id) break
    current = repo.getNode(current.parent_id)
  }
  return null
}

/**
 * Spawn the editor synchronously and return its exit code. Inherits
 * stdio so the editor takes over the terminal (alt-screen, raw
 * input, the works) and the user sees a normal editing session.
 *
 * Exposed for unit tests via the `spawn` injection point — production
 * uses `spawnSync` directly.
 */
export function runEditor(
  editor: string,
  filepath: string,
  spawn: typeof spawnSync = spawnSync,
): { status: number | null; error?: Error } {
  const result = spawn(editor, [filepath], { stdio: "inherit", shell: false })
  if (result.error) {
    return { status: null, error: result.error }
  }
  return { status: result.status }
}

export const openCommand = new Command("open")
  .description("Open the markdown file for a node in $EDITOR")
  .argument("<id>", "Node id (path-form @km/<scope>/<slug>, bd-form, ULID, filename, alias, or filesystem path)")
  .action(async (id: string) => {
    const resolved = resolvePathArg(id, getRootPath())
    using repo = await loadRepo(resolved.repoRoot)

    const node = resolveTaskNode(repo, id)
    if (!node) {
      console.error(term.red(`Node not found: ${id}`))
      process.exit(1)
    }

    const filepath = resolveNodeFilePath(repo, resolved.repoRoot, node)
    if (!filepath) {
      console.error(term.red(`Cannot locate markdown file for ${id}`))
      console.error(term.dim(`  Node has no fs_path on disk (in-memory only?).`))
      process.exit(1)
    }

    const editor = pickEditor()
    const { status, error } = runEditor(editor, filepath)

    if (error) {
      console.error(term.red(`Failed to launch editor '${editor}': ${error.message}`))
      console.error(term.dim(`  Set $EDITOR or $VISUAL to a working editor.`))
      process.exit(1)
    }

    // Mirror the editor's exit code so callers can chain (e.g.
    // `km open foo && commit` only commits when the user saved).
    process.exit(status ?? 0)
  })
