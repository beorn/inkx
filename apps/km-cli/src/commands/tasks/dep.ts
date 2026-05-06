/**
 * `km task dep add | rm | ls` — user-facing dependency surface.
 *
 * Routes every mutation through `addGraphEdge` / `removeGraphEdge` from
 * `@km/storage` so the future `km link --rel blocks` and the existing
 * `bd dep` use the same writer. The pure planner (`dep-plan.ts`) does
 * id resolution and atomicity guarding; this handler binds the planner
 * to the repo, prints results, and sets exit codes.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { addGraphEdge, getGraphEdges, removeGraphEdge } from "@km/storage"
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { planAddDeps, planListDeps, planRemoveDeps } from "./dep-plan.ts"

const term = createTerm(process)

/**
 * Build the `dep` Command tree for `km task dep add | rm | ls`.
 *
 * Returned as a factory (not a module-level const) so tests / multiple
 * registrations don't share one Command instance.
 */
export function createDepCommand(): Command {
  const dep = new Command("dep").description("Manage task dependencies")

  // ---------- dep add <id> <blocker...> ------------------------------------

  dep
    .command("add")
    .argument("<id>", "Task ID — the one being blocked")
    .argument("<blockers...>", "One or more blocker IDs — tasks that must complete first")
    .description("Add blocked-by edges from <id> to each blocker (atomic — all-or-nothing)")
    .option("--dry-run", "Print the diff without writing anything")
    .action(async (id: string, blockers: string[], options: { dryRun?: boolean }) => {
      const resolved = resolvePathArg(process.cwd(), getRootPath())
      using repo = await loadRepo(resolved.repoRoot)

      const plan = planAddDeps(repo, id, blockers)

      // Atomicity: any blocker that didn't resolve aborts the whole op.
      if (plan.errors.length > 0) {
        for (const err of plan.errors) console.error(term.red(err))
        process.exitCode = 1
        return
      }

      for (const w of plan.warnings) console.error(term.yellow(w))

      if (!plan.targetNodeId) return // unreachable when errors empty
      const targetLabel = plan.targetShortId ?? plan.targetNodeId

      // --dry-run: preview without writing. CI-gateable invariant:
      // dry-run NEVER calls a mutation method.
      if (options.dryRun) {
        // Existing-edge no-op detection: query the graph and report
        // which would-add edges already exist.
        const existing = new Set(
          getGraphEdges(repo, plan.targetNodeId, { rel: "blocks", direction: "in" }).map((e) => e.from),
        )
        for (const blocker of plan.blockers) {
          const blockerLabel = blocker.blockerShortId ?? blocker.input
          if (existing.has(blocker.blockerNodeId)) {
            console.log(term.yellow(`${targetLabel} is already blocked-by ${blockerLabel} (no-op)`))
          } else {
            console.log(`Would add dependency: ${targetLabel} blocked-by ${blockerLabel}`)
          }
        }
        console.log(term.dim("No changes written. Run without --dry-run to apply."))
        return
      }

      // Single-writer path. addGraphEdge is idempotent — re-running
      // the same edge is a no-op.
      for (const blocker of plan.blockers) {
        addGraphEdge(repo, {
          from: blocker.blockerNodeId,
          to: plan.targetNodeId,
          rel: "blocks",
        })
      }

      for (const blocker of plan.blockers) {
        const blockerLabel = blocker.blockerShortId ?? blocker.input
        console.log(term.green(`Added: ${targetLabel} blocked-by ${blockerLabel}`))
      }
    })

  // ---------- dep rm <id> <blocker...> -------------------------------------

  dep
    .command("rm")
    .alias("remove")
    .argument("<id>", "Task ID — the one whose blocker is being removed")
    .argument("<blockers...>", "One or more blocker IDs to remove")
    .description("Remove blocked-by edges from <id> for each named blocker (atomic)")
    .option("--dry-run", "Print the diff without writing anything")
    .action(async (id: string, blockers: string[], options: { dryRun?: boolean }) => {
      const resolved = resolvePathArg(process.cwd(), getRootPath())
      using repo = await loadRepo(resolved.repoRoot)

      const plan = planRemoveDeps(repo, id, blockers)

      if (plan.errors.length > 0) {
        for (const err of plan.errors) console.error(term.red(err))
        process.exitCode = 1
        return
      }

      if (!plan.targetNodeId) return
      const targetLabel = plan.targetShortId ?? plan.targetNodeId

      // --dry-run: preview without writing. Detect no-op (edge already
      // missing) so the user gets the same signal as `bd dep remove`.
      if (options.dryRun) {
        const existing = new Set(
          getGraphEdges(repo, plan.targetNodeId, { rel: "blocks", direction: "in" }).map((e) => e.from),
        )
        for (const blocker of plan.blockers) {
          const blockerLabel = blocker.blockerShortId ?? blocker.input
          if (!existing.has(blocker.blockerNodeId)) {
            console.log(term.yellow(`${targetLabel} does not depend on ${blockerLabel} (no-op)`))
          } else {
            console.log(`Would remove dependency: ${targetLabel} no longer blocked-by ${blockerLabel}`)
          }
        }
        console.log(term.dim("No changes written. Run without --dry-run to apply."))
        return
      }

      for (const blocker of plan.blockers) {
        removeGraphEdge(repo, {
          from: blocker.blockerNodeId,
          to: plan.targetNodeId,
          rel: "blocks",
        })
      }

      for (const blocker of plan.blockers) {
        const blockerLabel = blocker.blockerShortId ?? blocker.input
        console.log(term.green(`Removed: ${targetLabel} no longer blocked-by ${blockerLabel}`))
      }
    })

  // ---------- dep ls <id> --------------------------------------------------

  dep
    .command("ls")
    .alias("list")
    .argument("<id>", "Task ID — the one whose dependency edges are listed")
    .description("List incoming and outgoing dependency edges for a task")
    .action(async (id: string) => {
      const resolved = resolvePathArg(process.cwd(), getRootPath())
      using repo = await loadRepo(resolved.repoRoot)

      const plan = planListDeps(repo, id)

      if (plan.errors.length > 0) {
        for (const err of plan.errors) console.error(term.red(err))
        process.exitCode = 1
        return
      }

      const targetLabel = plan.targetShortId ?? plan.targetNodeId ?? id

      const inbound = plan.entries.filter((e) => e.direction === "in")
      const outbound = plan.entries.filter((e) => e.direction === "out")

      if (inbound.length === 0 && outbound.length === 0) {
        console.log(term.dim(`${targetLabel} has no dependencies`))
        return
      }

      if (inbound.length > 0) {
        console.log(term.bold(`${targetLabel} is blocked by:`))
        for (const e of inbound) {
          const label = e.otherShortId ?? e.otherNodeId
          console.log(`  - ${label}${e.otherTitle ? term.dim(` — ${e.otherTitle}`) : ""}`)
        }
      }

      if (outbound.length > 0) {
        if (inbound.length > 0) console.log("")
        console.log(term.bold(`${targetLabel} blocks:`))
        for (const e of outbound) {
          const label = e.otherShortId ?? e.otherNodeId
          console.log(`  - ${label}${e.otherTitle ? term.dim(` — ${e.otherTitle}`) : ""}`)
        }
      }
    })

  return dep
}
