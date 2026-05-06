/**
 * Beads Info — `bd info [scope]`
 *
 * Inspection command. By default shows config + statistics (counts by
 * status, top files with tasks) AND the resolved paths the bd surface
 * is reading/writing. The `--paths` flag suppresses config + statistics
 * and emits only the paths block — useful when scripting / when
 * troubleshooting "why does bd see no issues?" or "where will `bd
 * create` land a new file?".
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 *
 * History: `bd where` was a separate command that printed only paths;
 * it was merged into `bd info --paths` (`@km/cli/bd-where-merge-into-info`)
 * to consolidate the two overlapping inspection surfaces.
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg, type ResolvedPathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { loadKmBdConfig, type BdConfigView } from "./bd-load-config.ts"
import { resolveBoardRoots, formatScopeMessage, printEmptyDefaultBoardHint } from "./bd-scope.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

/**
 * Print the resolved bd paths block — the same content `bd where`
 * historically produced. Shared by `bd info` (full mode) and
 * `bd info --paths` (paths-only mode).
 */
function printPaths(resolved: ResolvedPathArg, configObj: BdConfigView): void {
  const kmDir = join(resolved.repoRoot, ".km")
  const dbPath = join(kmDir, "state.db")

  if (existsSync(kmDir)) {
    console.log(kmDir)
    console.log(`  prefix: ${configObj.beads.prefix}`)
    console.log(`  roots: ${JSON.stringify(configObj.beads.roots)}`)
    console.log(`  default_scope: ${configObj.beads.default_scope}`)
    console.log(`  database: ${dbPath}`)
    console.log(`  repo: ${resolved.repoRoot}`)
    if (resolved.nodeRef) {
      console.log(`  scope: ${resolved.nodeRef}`)
    }
  } else {
    console.log(term.yellow("No km directory found."))
    console.log(`  repo: ${resolved.repoRoot}`)
  }
}

export function registerBdInfo(parent: BdRegistrar): void {
  const infoCmd = new Command("info")
    .argument(
      "[scopeOrBoard]",
      "Filesystem path scopes results; a non-path argument (e.g. `@km`) overrides the configured beads root[0].",
    )
    .description("Show beads configuration, statistics, and paths (use --paths to show only paths)")
    .option("--all", "Count every checkbox in the vault, not just configured beads roots")
    .option("--paths", "Show only the resolved bd paths (suppresses config + statistics)")
    // oxlint-disable-next-line complexity/complexity -- CLI action with sequential reporting steps
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(opts.scopeOrBoard)
      const kmDir = join(resolved.repoRoot, ".km")

      // --paths short-circuit: emit only the resolved paths block. No
      // need to query the issue index or run boardRoots resolution.
      if (opts.paths) {
        // Load repo for consistency with the full-info path (and so a
        // missing/corrupt .km surfaces the same way).
        using _repo = await loadRepo(resolved.repoRoot)
        const configObj = await loadKmBdConfig(resolved.repoRoot)
        printPaths(resolved, configObj)
        return
      }

      // Load repo for database access and mode
      using repo = await loadRepo(resolved.repoRoot)
      // Mirror `bd ready`: a non-path positional ("@km") overrides the
      // config[0] beads root; an explicit filesystem path scopes results
      // to a subtree.
      const cliRootOverride = resolved.wasExplicitPath ? undefined : (resolved.nodeRef ?? undefined)
      const scopePath = resolved.wasExplicitPath ? (resolved.nodeRef ?? undefined) : undefined
      const configObj = await loadKmBdConfig(resolved.repoRoot)
      const config = configObj.beads
      const dbPath = join(kmDir, "state.db")
      const repoMode = repo.mode

      // Match `bd ready` / `bd list`: scope counts to the configured beads
      // roots so vault-wide checkbox noise (markdown fixtures, archived
      // notes) doesn't drown out actual work. `--all` opts out for
      // debugging unindexed beads. Without this filter, `bd info` and
      // `bd list --status X` reported wildly divergent totals
      // (info-stats-mismatch).
      const boardRoots = resolveBoardRoots(repo, opts, cliRootOverride)
      const issues = Bead.query(repo, {}, scopePath, undefined, { boardRoots })

      console.log(term.bold("Beads Configuration"))
      console.log("===================")
      console.log(`Prefix: ${config.prefix}`)
      console.log(`Roots: ${JSON.stringify(config.roots)}`)
      console.log(`Default scope: ${config.default_scope}`)
      if (configObj.path) {
        console.log(term.dim(`Config: ${configObj.path} (overrides defaults)`))
      } else {
        console.log(term.dim(`Source: built-in defaults`))
      }

      console.log()
      console.log(term.bold("How tasks are tracked:"))
      console.log(`  bd id 'km-<scope>.<slug>' → file '<scope>/<slug>.md' with @${config.prefix}/<scope> tag.`)
      console.log(`  Cross-vault references use '@${config.prefix}/<scope>/<slug>'.`)
      console.log(`  No board/parent config — the bd id encodes the board by construction.`)

      console.log()
      console.log(term.bold("Storage"))
      console.log(`  Database: ${dbPath}`)
      console.log(`  Mode: ${repoMode}`)
      console.log(`  Repo: ${resolved.repoRoot}`)
      if (kmDir) {
        console.log(`  KM Dir: ${kmDir}`)
      }
      if (scopePath) {
        console.log(`  Scope: ${scopePath}`)
      }

      console.log()
      const scopeMsg = formatScopeMessage(scopePath)
      console.log(term.bold(`Statistics${scopeMsg}`))
      console.log(`  Total: ${issues.length} issues`)

      // Show breakdown by status
      const byStatus = {
        open: issues.filter((i) => i.status === "todo").length,
        in_progress: issues.filter((i) => i.status === "wip").length,
        blocked: issues.filter((i) => i.status === "blocked").length,
        closed: issues.filter((i) => i.status === "done").length,
        dropped: issues.filter((i) => i.status === "dropped").length,
      }
      if (issues.length > 0) {
        console.log(`  Open: ${byStatus.open}, In Progress: ${byStatus.in_progress}, Blocked: ${byStatus.blocked}`)
        console.log(`  Closed: ${byStatus.closed}, Dropped: ${byStatus.dropped}`)

        // Show files with tasks
        const pathsWithTasks = new Set<string>()
        for (const issue of issues) {
          if (issue.path) {
            pathsWithTasks.add(issue.path)
          }
        }
        if (pathsWithTasks.size > 0) {
          console.log()
          console.log(term.bold("Files with tasks:"))
          const paths = Array.from(pathsWithTasks).slice(0, 5)
          for (const path of paths) {
            const count = issues.filter((i) => i.path === path).length
            console.log(term.dim(`  ${path} (${count})`))
          }
          if (pathsWithTasks.size > 5) {
            console.log(term.dim(`  ... and ${pathsWithTasks.size - 5} more files`))
          }
        }
      } else if (!opts.all && !opts.scopeOrBoard) {
        // Bare `bd info` with default boardRoots returning 0 = same shape
        // as the bare-ready empty case. Surface the same hint instead of
        // a stranded "Total: 0 issues" line.
        printEmptyDefaultBoardHint("info", boardRoots)
      }
    })
  parent.addCommand(infoCmd)
}
