/**
 * Read the current git branch for a working directory — synchronously, via
 * `.git/HEAD`. No subprocess, no async: the SidePanel renders on every tick
 * and this needs to be cheap.
 *
 * Walks upward from `cwd` looking for `.git/HEAD` (plain file or worktree).
 * Returns the branch name if `HEAD` is a symbolic ref to `refs/heads/<name>`,
 * or a short SHA if detached. Returns `null` if no repo is found.
 *
 * Test injection
 * --------------
 * Tests install a fake via `setGitFactoryOverride((cwd) => "main")`.
 * `SILVERCODE_FAKE_BRANCH=<name>` env var is the no-import-time alternative
 * (returned regardless of cwd).
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/** Test-only override. When set, replaces the .git/HEAD walk. */
let gitOverride: ((cwd: string) => string | null) | null = null

/**
 * Test-only: install a fake git-branch probe. Pass `null` to clear.
 * Production callers MUST NOT use this.
 */
export function setGitFactoryOverride(factory: ((cwd: string) => string | null) | null): void {
  gitOverride = factory
}

export function gitBranchFor(cwd: string): string | null {
  if (gitOverride) return gitOverride(cwd)
  const envFake = process.env.SILVERCODE_FAKE_BRANCH
  if (typeof envFake === "string" && envFake.length > 0) return envFake
  let dir = cwd
  for (let i = 0; i < 64; i++) {
    const dotGit = join(dir, ".git")
    if (existsSync(dotGit)) {
      const st = statSync(dotGit)
      // Worktrees / submodules have `.git` as a file pointing to the real
      // gitdir. Resolve through that when present.
      let gitDir = dotGit
      if (st.isFile()) {
        const head = readFileSync(dotGit, "utf8").trim()
        const m = head.match(/^gitdir:\s*(.+)$/)
        if (!m) return null
        gitDir = m[1]!.startsWith("/") ? m[1]! : join(dir, m[1]!)
      }
      const headPath = join(gitDir, "HEAD")
      if (!existsSync(headPath)) return null
      const head = readFileSync(headPath, "utf8").trim()
      const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/)
      if (ref) return ref[1]!
      // Detached HEAD — show short sha.
      return head.slice(0, 7)
    }
    const parent = join(dir, "..")
    if (parent === dir) return null
    dir = parent
  }
  return null
}
