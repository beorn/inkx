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
 *
 * Bead-centric default: prepends `fstype:mdfile,folder` to the DSL unless
 * the user already mentions `fstype` in their expression. Beads ARE
 * file-level — either `mdfile` (file with no child dir) or `folder` (file
 * that ALSO owns a child directory of nested beads). Inline list-item
 * checkboxes inside a bead body are acceptance criteria, not separate
 * beads. `--all-tasks` opts out for the rare case where the user wants
 * to query checkboxes too. For the un-opinionated raw surface, use
 * `km query` directly.
 */

import { Command } from "@silvery/commander"
import { queryCommand } from "./query.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdQuery(parent: BdRegistrar): void {
  const queryCmd = new Command("query")
    .argument("<expression...>", "DSL query expression")
    .description("Query nodes with raw DSL (alias for `km query`; bd-style: defaults to fstype:mdfile,folder)")
    .option(
      "--all-tasks",
      "Don't add the default fstype:mdfile,folder filter — include inline-checkbox sub-tasks too",
    )
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      let dsl = (opts.expression as string[]).join(" ")
      // Prepend bead-centric default unless the user opted out or already
      // mentioned fstype in their expression. Detect the field name as
      // a whole word so a fragment like `fstype` inside a quoted string
      // doesn't accidentally suppress the default.
      if (!opts.allTasks && !/\bfstype\s*:/.test(dsl)) {
        dsl = `fstype:mdfile,folder ${dsl}`.trim()
      }
      const args = [dsl]
      if (opts.json) args.push("--json")
      await queryCommand.parseAsync(args, { from: "user" })
    })
  parent.addCommand(queryCmd)
}
