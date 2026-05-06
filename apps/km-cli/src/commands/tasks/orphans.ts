/**
 * `km task orphans` — Commit-Referenced But Still Open
 *
 * Wave 6 of `@km/cli/task-bd-collapse` (the lift): the canonical
 * "find open tasks referenced in recent commits" surface lives here;
 * `bd orphans` is a thin alias-shim that delegates to this command.
 *
 * Pure logic (parse git log, match ids by regex) lives in
 * `orphans-plan.ts`; this file owns I/O: spawn `git log`, load repo,
 * filter beads, format output.
 */

import { Command, int } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { findOrphans, parseGitLog } from "./orphans-plan.ts"
import { emitJson, normalizeJsonJq } from "../../utils/jq.ts"

const term = createTerm(process)

export function createOrphansCommand(): Command {
  return new Command("orphans")
    .description("Find open tasks referenced in recent commit messages (likely closed-by-commit)")
    .option("-d, --days <n>", "Look back this many days in git log", int, 90)
    .option("--json", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output through jq (implies --json; requires `jq` in PATH)")
    .option("--details", "Include the matching commits per task")
    .actionMerged(async (opts, cmd) => {
      const days = (opts.days as number | undefined) ?? 90
      // The parent `task` command also defines `--json` / `--jq`, which
      // masks this subcommand's flag values when present. Use
      // `optsWithGlobals()` to pick up either layer — same pattern as
      // `task ready` and `task stale`.
      const merged = (cmd.optsWithGlobals?.() ?? {}) as Record<string, unknown>
      const { json, jq } = normalizeJsonJq({
        json: (opts.json === true) || merged.json === true,
        jq: (opts.jq as string | undefined) ?? (merged.jq as string | undefined),
      })
      const details = opts.details === true || merged.details === true
      const resolved = resolvePathArg(process.cwd(), getRootPath())
      using repo = await loadRepo(resolved.repoRoot)

      // Collect open / in-progress / blocked tasks — done/dropped are not
      // orphans by definition.
      const issues = Bead.query(repo, {}, undefined, undefined).filter(
        (i) => i.status === "todo" || i.status === "wip" || i.status === "blocked",
      )
      if (issues.length === 0) {
        if (json) {
          // Empty input → empty output. Stay JSON-shaped so callers
          // that pipe `--jq` against this command don't see human text
          // when there's nothing to orphan-check.
          await emitJson([], jq)
          return
        }
        console.log(term.green("No open tasks — nothing to orphan-check."))
        return
      }

      // Pull the last `--days` of commit messages once; scan locally per id.
      // We capture full message bodies (not just subjects) because
      // close-by-commit ids typically appear in the body, not the title.
      const { execSync } = await import("child_process")
      let log: string
      try {
        log = execSync(`git log --since=${days}.days --format=%H%x00%B%x1e`, {
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

      if (json) {
        await emitJson(
          orphans.map((o) => ({ id: o.issue.id, title: o.issue.title, status: o.issue.status, commits: o.commits })),
          jq,
        )
        return
      }

      if (orphans.length === 0) {
        console.log(term.green(`No orphaned tasks (looked back ${days} days).`))
        return
      }

      console.log(term.bold(`⚠ Found ${orphans.length} orphaned task(s):\n`))
      orphans.forEach(({ issue, commits: shas }, i) => {
        console.log(`${i + 1}. ${issue.id}: ${issue.title}`)
        console.log(term.dim(`   Status: ${issue.status}`))
        if (details) {
          for (const sha of shas.slice(0, 5)) {
            console.log(term.dim(`   - ${sha.slice(0, 9)}`))
          }
          if (shas.length > 5) {
            console.log(term.dim(`   - … (+${shas.length - 5} more)`))
          }
        }
      })
    })
}
