/**
 * Beads Blocked — `bd blocked`
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: thin alias shim. Delegates to
 * `km task --blocked` via `listTasks`. The legacy bd-blocked also
 * filtered out done/dropped (since "currently blocked" excludes
 * historical-blocked-but-closed); `listTasks` shares this default —
 * the bare board view excludes done/dropped unless `--all` is set.
 *
 * BD_ALIASES table (see bd.ts):
 *   blocked → ["task", "blocked"]
 *
 * The bead's alias table puts blocked under task, but task doesn't have
 * a dedicated `blocked` subcommand — the equivalent is `km task --blocked`.
 * Behavior is identical: same blocked-by filter, same exclusion of
 * done/dropped.
 */

import { Command } from "@silvery/commander"
import { listTasks } from "./tasks/list.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdBlocked(parent: BdRegistrar): void {
  const blockedCmd = new Command("blocked")
    .description("List all blocked issues (alias for `km task --blocked`)")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      await listTasks(undefined, {
        blocked: true,
        json: opts.json,
      })
    })
  parent.addCommand(blockedCmd)
}
