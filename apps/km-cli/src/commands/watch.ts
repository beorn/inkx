/**
 * Watch Command (deprecated)
 *
 * This command is deprecated. Use `km sync --watch` instead.
 * Kept for backwards compatibility - forwards to sync --watch.
 */

import { Command } from "@commander-js/extra-typings"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { syncCommand } from "./sync.ts"

export const watchCommand = new Command("watch")
  .description("Watch for filesystem changes (deprecated: use 'km sync --watch')")
  .argument("[path]", "Path to watch (default: repo root)")
  .option("--debounce <ms>", "Debounce interval in ms", "5000")
  .action(async (path, options) => {
    console.log(term.yellow("Note: 'km watch' is deprecated. Use 'km sync --watch' instead.\n"))

    // Forward to sync --watch by parsing args
    const args = ["sync"]
    if (path) args.push(path)
    args.push("--watch")
    if (options.debounce) args.push("--debounce", options.debounce)

    // Parse and execute through sync command
    await syncCommand.parseAsync(args, { from: "user" })
  })
