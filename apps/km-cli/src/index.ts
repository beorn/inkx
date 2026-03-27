#!/usr/bin/env bun
/**
 * KM CLI
 *
 * Main entry point for the km command
 *
 * This module is the CLI entry point - it calls configureProgram() from program.ts
 * and then calls parse() to execute the command.
 */

// Note: "Loading..." for view command is shown by bootstrap.ts before this module loads

import { configureProgram } from "./program.ts"
import { CliError } from "./errors.ts"
import { createTerm } from "@silvery/ag-react"

// Configure the program (all commands, hooks, options)
const program = configureProgram()

// Board shortcuts: transform `km @next` → `km view @next`
// Sigils: @ (person/context), + (project), # (tag)
function isBoardShortcut(arg: string): boolean {
  return /^[@+#]/.test(arg) && !arg.startsWith("./") && !arg.startsWith("../")
}

const cliArgs = process.argv.slice(2)
const firstArg = cliArgs[0]
if (firstArg && isBoardShortcut(firstArg)) {
  // Insert 'view' command before the sigil argument
  process.argv.splice(2, 0, "view")
}

// Parse and execute — CliError gets clean display, everything else propagates
try {
  await program.parseAsync()
} catch (err) {
  if (err instanceof CliError) {
    const term = createTerm(process)
    console.error(`\n${term.bold(term.red("error:"))} ${err.message}`)
    if (err.hint) console.error(term.yellow(`  ${err.hint}`))
    console.error()
    process.exit(1)
  }
  throw err
}
