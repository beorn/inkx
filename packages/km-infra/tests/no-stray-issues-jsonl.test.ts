/**
 * Guard: `issues.jsonl` must never be tracked at the repo root.
 *
 * bd v1.0.2 has a worktree-export bug (steveyegge/beads#3311) where the
 * pre-commit hook resolves `export.path = "issues.jsonl"` against the
 * worktree CWD instead of `.beads/`, causing `git update-index` to add a
 * stray ~9 MB entry at repo root. The file never appears on disk
 * (so .gitignore doesn't help — `update-index --cacheinfo` bypasses
 * gitignore), but the index entry produces a stray file in the commit.
 *
 * Three concurrent agents tripped on this in a single /max session
 * (km-beads.export-path-relative). Five prior cleanup commits in main
 * (search: "stray issues.jsonl", "root issues.jsonl", "hook artifact").
 * Bug fixed upstream in bd v1.0.3 (commit d0f0ad6f, GH#3311).
 *
 * This test mirrors `packages/km-infra/scripts/check-no-stray-issues-jsonl.sh`
 * — both run together so the bug is caught at test:fast time AND at the
 * `bun fix` gate. Defense-in-depth in case a contributor is on stale bd.
 *
 * Bead: km-beads.export-path-relative
 *
 * UPSTREAM-WAITING(steveyegge/beads#3311): Delete when bd >= 1.0.3 universal
 * Bead: km-beads.upstream-bd-1.0.3-export-path
 * Escalate by: 2026-10-27
 */

import { describe, test, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "..", "..", "..")

function gitLsFiles(path: string): string {
  // --error-unmatch returns exit 1 if the path is not tracked. We want to
  // distinguish "tracked" (exit 0) from "not tracked" (exit 1) without
  // throwing on the latter.
  try {
    return execFileSync("git", ["ls-files", "--error-unmatch", "--", path], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }).trim()
  } catch {
    return ""
  }
}

describe("no-stray-issues-jsonl guard", () => {
  test("issues.jsonl is NOT tracked at repo root", () => {
    const tracked = gitLsFiles("issues.jsonl")
    expect(
      tracked,
      `Stray 'issues.jsonl' tracked at repo root — this is the bd worktree-export bug (GH#3311). ` +
        `Upgrade bd to >=1.0.3 and run 'git rm --cached issues.jsonl'. ` +
        `Canonical path is .beads/issues.jsonl.`,
    ).toBe("")
  })

  test(".beads/issues.jsonl IS tracked (canonical export path)", () => {
    const tracked = gitLsFiles(".beads/issues.jsonl")
    expect(
      tracked,
      "The canonical bd export at .beads/issues.jsonl should be tracked. " +
        "If this fails, bd's auto-export config drifted — check `bd config get export.path`.",
    ).toBe(".beads/issues.jsonl")
  })
})
