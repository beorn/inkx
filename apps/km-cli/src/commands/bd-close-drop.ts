/**
 * Beads Lifecycle Transitions — `bd close | drop`
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: thin alias shims. The action
 * handlers delegate directly (in-process, same repo) to the canonical
 * `task close` / `task drop` lifecycle handlers in
 * `tasks/lifecycle.ts`. Same workflow transitions, same `closed_at`
 * stamping, same `--reason` recording — no duplicated logic.
 *
 * The bd surface (commander wiring + flag aliases) stays so
 * `bd close --help` continues to work and the print-once deprecation
 * notice fires; everything below the wiring is the task surface.
 *
 * BD_ALIASES table (see bd.ts):
 *   close → ["task", "close"]
 *   drop  → ["task", "drop"]
 */

import { Command } from "@silvery/commander"
import { closeTaskLifecycle, dropTaskLifecycle } from "./tasks/lifecycle.ts"
import type { BdRegistrar } from "./bd-register.ts"

/**
 * `bd close <id> [--reason TEXT]` — alias for `km task close`.
 *
 * Delegates to `closeTaskLifecycle` for the actual work. Same plan,
 * same applyLifecyclePlan, same JSON shape.
 */
export function registerBdClose(parent: BdRegistrar): void {
  const closeCmd = new Command("close")
    .argument("[id]", "Bead ID")
    .description("Close an issue (alias for `km task close`; sets closed_at + optional reason)")
    .option("-r, --reason <reason>", "Close reason")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      await closeTaskLifecycle(opts.id, { reason: opts.reason, json: opts.json })
    })
  parent.addCommand(closeCmd)
}

/**
 * `bd drop <id> [--reason TEXT]` — alias for `km task drop`.
 *
 * Delegates to `dropTaskLifecycle`. Drop preserves the "we considered
 * it; chose not to" signal for close-reason audits — same shape on disk
 * as a close, but distinct status.
 */
export function registerBdDrop(parent: BdRegistrar): void {
  const dropCmd = new Command("drop")
    .argument("[id]", "Bead ID")
    .description("Drop an issue (alias for `km task drop`; mark won't-do, set closed_at)")
    .option("-r, --reason <reason>", "Drop reason")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      await dropTaskLifecycle(opts.id, { reason: opts.reason, json: opts.json })
    })
  parent.addCommand(dropCmd)
}
