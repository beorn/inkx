/**
 * Beads Orphans — `bd orphans` thin alias shim.
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: delegates to `task orphans`.
 * The git-log scanner + `findOrphans` planner now live in
 * `tasks/orphans-plan.ts` + `tasks/orphans.ts`; this shim just
 * forwards argv via parseAsync.
 *
 * BD_ALIASES table (see bd.ts):
 *   orphans → ["task", "orphans"]
 */

import { Command } from "@silvery/commander"
import { createOrphansCommand } from "./tasks/orphans.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdOrphans(parent: BdRegistrar): void {
  const orphansCmd = new Command("orphans")
    .description("Find open beads referenced in recent commits (alias for `km task orphans`)")
    .option("--days <n>", "Look back this many days in git log")
    .option("--json", "Output as JSON")
    .option("--details", "Include the matching commits per bead")
    .actionMerged(async (opts) => {
      const argv: string[] = []
      if (opts.days !== undefined) argv.push("--days", String(opts.days))
      if (opts.json === true) argv.push("--json")
      if (opts.details === true) argv.push("--details")
      await createOrphansCommand().parseAsync(argv, { from: "user" })
    })
  parent.addCommand(orphansCmd)
}
