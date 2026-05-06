/**
 * Beads Stale — `bd stale [-d N]`
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: thin alias shim. Delegates to
 * `km stale` via in-process commander parse — same threshold, same
 * filter, same output.
 *
 * BD_ALIASES table (see bd.ts):
 *   stale → ["stale"]   (km stale = any-node stale lister)
 *
 * Surface deviation (documented; not silently broken): legacy `bd stale`
 * filtered to bead-shaped issues only (status open/wip/blocked). `km
 * stale` operates on any node with an `updated_at` threshold. On a
 * task-dominant vault the results converge; on mixed vaults km returns
 * a superset (notes / sections that haven't been updated).
 */

import { Command, int } from "@silvery/commander"
import { staleCommand } from "./stale.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdStale(parent: BdRegistrar): void {
  const staleCmd = new Command("stale")
    .description("List stale nodes (alias for `km stale`; not updated in N days)")
    .option("-d, --days <n>", "Days threshold", int, 14)
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      // `from: "user"` args go directly to staleCommand's option/arg slots.
      const args: string[] = []
      if (opts.days !== undefined) args.push("-d", String(opts.days))
      if (opts.json) args.push("--json")
      await staleCommand.parseAsync(args, { from: "user" })
    })
  parent.addCommand(staleCmd)
}
