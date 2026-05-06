/**
 * Beads Dependency Subcommands — `bd dep add | remove | list`
 *
 * Manages blocked-by edges between beads. Thin wrapper over `Bead.addDependency` /
 * `Bead.removeDependency` / `Bead.getDependencies` from `@km/beads`.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"

const term = createTerm(process)

export const depCommand = new Command("dep").description("Manage issue dependencies")

const depAddCmd = depCommand
  .command("add")
  .argument("[id]", "Bead ID")
  .argument("[depends-on]", "Blocking issue ID")
  .description("Add a dependency (issue is blocked by depends-on)")
  .option("--dry-run", "Print the diff without writing anything")
  .actionMerged(async (opts) => {
    if (!opts.id || !opts.dependsOn) {
      depAddCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Bead not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    // --dry-run: preview the would-add edge without writing.
    // CI-gateable invariant: dry-run NEVER calls a mutation method
    // (no `repo.updateNode`, no Bead.addDependency side effects via merge).
    if (opts.dryRun) {
      const existing = issue.blockedBy ?? []
      if (existing.includes(opts.dependsOn)) {
        console.log(term.yellow(`${issue.shortId} is already blocked-by ${opts.dependsOn} (no-op)`))
      } else {
        console.log(`Would add dependency: ${issue.shortId} blocked-by ${opts.dependsOn}`)
      }
      console.log(term.dim("No changes written. Run without --dry-run to apply."))
      return
    }

    const props = Bead.addDependency(repo, issue, opts.dependsOn)
    const node = repo.getNode(issue.id)
    repo.updateNode(issue.id, {
      data: Bead.mergeDepProps(repo, node?.data as Record<string, unknown> | undefined, props),
    })

    console.log(term.green(`Added dependency: ${issue.shortId} blocked-by ${opts.dependsOn}`))
  })

const depRemoveCmd = depCommand
  .command("remove")
  .argument("[id]", "Bead ID")
  .argument("[depends-on]", "Blocking issue ID")
  .description("Remove a dependency")
  .option("--dry-run", "Print the diff without writing anything")
  .actionMerged(async (opts) => {
    if (!opts.id || !opts.dependsOn) {
      depRemoveCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Bead not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    // --dry-run: preview the would-remove edge without writing.
    // CI-gateable invariant: dry-run NEVER calls a mutation method.
    // Bead.removeDependency is pure (returns props or null) — calling it
    // does not mutate; only the subsequent updateNode would.
    if (opts.dryRun) {
      const preview = Bead.removeDependency(repo, issue, opts.dependsOn)
      if (!preview) {
        console.log(term.yellow(`${issue.shortId} does not depend on ${opts.dependsOn} (no-op)`))
      } else {
        console.log(`Would remove dependency: ${issue.shortId} no longer blocked-by ${opts.dependsOn}`)
      }
      console.log(term.dim("No changes written. Run without --dry-run to apply."))
      return
    }

    const result = Bead.removeDependency(repo, issue, opts.dependsOn)
    if (!result) {
      console.error(term.yellow(`${issue.shortId} does not depend on ${opts.dependsOn}`))
      return
    }

    const node = repo.getNode(issue.id)
    repo.updateNode(issue.id, {
      data: Bead.mergeDepProps(repo, node?.data as Record<string, unknown> | undefined, result),
    })

    console.log(term.green(`Removed dependency: ${issue.shortId} no longer blocked-by ${opts.dependsOn}`))
  })

const depListCmd = depCommand
  .command("list")
  .argument("[id]", "Bead ID")
  .description("List dependencies for an issue")
  .actionMerged(async (opts) => {
    if (!opts.id) {
      depListCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Bead not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    const deps = Bead.getDependencies(repo, issue)
    if (deps.length === 0) {
      console.log(term.dim(`${issue.shortId} has no dependencies`))
      return
    }

    console.log(term.bold(`Dependencies for ${issue.shortId}:`))
    for (const dep of deps) {
      console.log(term.dim(`  - ${dep}`))
    }
  })
