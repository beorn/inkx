/**
 * Beads Claim — `bd claim <id>`
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: thin alias shim. Delegates
 * in-process to `claimTaskLifecycle` from `tasks/lifecycle.ts` — the
 * canonical workflow-transition path that validates not-already-
 * claimed-by-other before writing status=wip + assigned_to=$USER.
 *
 * BD_ALIASES table (see bd.ts):
 *   claim → ["task", "claim"]
 */

import { Command } from "@silvery/commander"
import { claimTaskLifecycle } from "./tasks/lifecycle.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdClaim(parent: BdRegistrar): void {
  const claimCmd = new Command("claim")
    .argument("<id>", "Bead ID")
    .description("Claim an issue (alias for `km task claim`; sets status=wip + assignee)")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      await claimTaskLifecycle(opts.id, { json: opts.json })
    })
  parent.addCommand(claimCmd)
}
