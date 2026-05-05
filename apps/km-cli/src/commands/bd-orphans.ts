/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: opts.days! / arr[i]! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Beads Orphans — `bd orphans`
 *
 * Find open beads referenced in recent commit messages — i.e. work
 * that's been implemented but not formally closed. Useful for sweeps of
 * "did we forget to close anything?" before a release or planning round.
 *
 * Pure logic (parse git log, match ids by regex) lives in
 * `bd-orphans-plan.ts`; this file owns I/O: spawn `git log`, load repo,
 * filter beads, format output.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command, int } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { issueToBdJson } from "./bd-format.ts"
import { findOrphans, parseGitLog } from "./bd-orphans-plan.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdOrphans(parent: BdRegistrar): void {
  const orphansCmd = new Command("orphans")
    .description("Find open beads referenced in recent commit messages (likely closed-by-commit)")
    .option("--days <n>", "Look back this many days in git log", int, 90)
    .option("--json", "Output as JSON")
    .option("--details", "Include the matching commits per bead")
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(undefined)
      await loadKmBdConfig(resolved.repoRoot)
      using repo = await loadRepo(resolved.repoRoot)

      // Collect open / in-progress / blocked beads — done/dropped are not orphans by definition.
      const issues = Bead.query(repo, {}, undefined, undefined).filter(
        (i) => i.status === "todo" || i.status === "wip" || i.status === "blocked",
      )
      if (issues.length === 0) {
        console.log(term.green("No open issues — nothing to orphan-check."))
        return
      }

      // Pull the last `--days` of commit messages once; scan locally per id.
      // We capture full message bodies (not just subjects) because close-by-commit
      // ids typically appear in the body, not the title.
      const { execSync } = await import("child_process")
      let log: string
      try {
        log = execSync(`git log --since=${opts.days!}.days --format=%H%x00%B%x1e`, {
          cwd: resolved.repoRoot,
          encoding: "utf-8",
          maxBuffer: 64 * 1024 * 1024,
        })
      } catch (err) {
        console.error(term.red(`git log failed: ${(err as Error).message}`))
        process.exitCode = 1
        return
      }

      const commits = parseGitLog(log)
      const orphans = findOrphans(issues, commits)

      if (opts.json) {
        console.log(
          JSON.stringify(
            orphans.map((o) => ({ ...issueToBdJson(o.issue), commits: o.commits })),
            null,
            2,
          ),
        )
        return
      }

      if (orphans.length === 0) {
        console.log(term.green(`No orphaned issues (looked back ${opts.days} days).`))
        return
      }

      console.log(term.bold(`⚠ Found ${orphans.length} orphaned issue(s):\n`))
      orphans.forEach(({ issue, commits: shas }, i) => {
        console.log(`${i + 1}. ${issue.id}: ${issue.title}`)
        console.log(term.dim(`   Status: ${issue.status}`))
        if (opts.details) {
          for (const sha of shas.slice(0, 5)) {
            console.log(term.dim(`   - ${sha.slice(0, 9)}`))
          }
          if (shas.length > 5) {
            console.log(term.dim(`   - … (+${shas.length - 5} more)`))
          }
        }
      })
    })
  parent.addCommand(orphansCmd)
}
