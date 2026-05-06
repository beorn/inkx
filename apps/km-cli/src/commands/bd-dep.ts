/**
 * Beads Dependency Subcommands — `bd dep add | rm | list` thin alias shim.
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: delegates to `task dep`. Both
 * `task dep add` and `task dep rm` ship `--dry-run` after the lift in
 * this same wave, so this collapses to a thin re-export of the task
 * dep tree.
 *
 * BD_ALIASES table (see bd.ts):
 *   dep → ["task", "dep"]
 *
 * Exported as `depCommand` (not `registerBdDep`) for backward
 * compat with the existing `bdCommand.addCommand(depCommand)` wiring.
 */

import { createDepCommand } from "./tasks/dep.ts"

/**
 * Build a fresh `bd dep` command tree. The factory pattern in
 * createDepCommand mirrors what we need — multiple registrations
 * never share commander state. We only override the description so
 * `bd dep --help` reads as a bd command.
 */
export const depCommand = (() => {
  const cmd = createDepCommand()
  cmd.description("Manage issue dependencies (alias for `km task dep`)")
  return cmd
})()
