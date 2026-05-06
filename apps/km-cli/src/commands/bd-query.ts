/**
 * Beads Query — `bd query <expression...>`
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: thin alias shim. Delegates to
 * `km query <dsl>` via in-process commander parse — same DSL, same
 * default-scope-bypass. The bead alias maps `query → ["list", "--raw"]`;
 * `km query` is itself an alias of `km list --raw`, so we go through the
 * shorter form.
 *
 * BD_ALIASES table (see bd.ts):
 *   query → ["list", "--raw"]   (equivalently: ["query"])
 */

import { Command } from "@silvery/commander"
import { queryCommand } from "./query.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdQuery(parent: BdRegistrar): void {
  const queryCmd = new Command("query")
    .argument("<expression...>", "DSL query expression")
    .description("Query nodes with raw DSL (alias for `km query`; bypasses default scope)")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const dsl = (opts.expression as string[]).join(" ")
      const args = [dsl]
      if (opts.json) args.push("--json")
      await queryCommand.parseAsync(args, { from: "user" })
    })
  parent.addCommand(queryCmd)
}
