/**
 * Beads Children — `bd children <id>` thin alias shim.
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: delegates to `km children`.
 * `km children` now walks both structural parent_id children AND the
 * path-form sibling-folder shape (was bd-children only); single source
 * of truth for "show me the children of this thing" lives at km level.
 *
 * BD_ALIASES table (see bd.ts):
 *   children → ["children"]
 *
 * (Originally `["show", "-c"]` per the bead's design, but km children
 * is the dedicated discoverability alias and matches the bd surface
 * shape exactly.)
 */

import { Command } from "@silvery/commander"
import { childrenCommand } from "./children.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdChildren(parent: BdRegistrar): void {
  const childrenCmd = new Command("children")
    .argument("<id>", "Bead ID")
    .description("List children of an issue (alias for `km children`)")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const argv: string[] = [opts.id]
      if (opts.json === true) argv.push("--json")
      await childrenCommand.parseAsync(argv, { from: "user" })
    })
  parent.addCommand(childrenCmd)
}
