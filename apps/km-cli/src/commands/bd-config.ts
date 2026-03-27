/**
 * Beads Config Subcommand
 *
 * View and modify beads configuration.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg, loadConfigObject } from "@km/storage"

export const configCommand = new Command("config").description("View and modify beads configuration")

configCommand
  .command("list")
  .alias("ls")
  .description("List current configuration")
  .action(() => {
    const resolved = resolvePathArg(undefined)
    const configObj = loadConfigObject(resolved.repoRoot)

    console.log(term.bold("Beads Configuration"))
    console.log(`  board:  ${configObj.beads.board || term.dim("(not set)")}`)
    console.log(`  parent: ${configObj.beads.parent || term.dim("(not set)")}`)
    console.log(`  prefix: ${configObj.beads.prefix}`)
    if (configObj.path) {
      console.log()
      console.log(term.dim(`Source: ${configObj.path}`))
    } else {
      console.log()
      console.log(term.dim("No config file found. Create .km/config.yaml to customize."))
    }
  })

configCommand
  .command("get <key>")
  .description("Get a configuration value")
  .action((key) => {
    const resolved = resolvePathArg(undefined)
    const configObj = loadConfigObject(resolved.repoRoot)

    switch (key) {
      case "board":
        console.log(configObj.beads.board || "")
        break
      case "parent":
        console.log(configObj.beads.parent || "")
        break
      case "prefix":
        console.log(configObj.beads.prefix)
        break
      default:
        console.error(term.red(`Unknown config key: ${key}`))
        console.log(term.dim("Valid keys: board, parent, prefix"))
        process.exitCode = 1
    }
  })

configCommand
  .command("set <key> <value>")
  .description("Set a configuration value (edits .km/config.yaml)")
  .action((key, value) => {
    // Validate key
    if (!["board", "parent", "prefix"].includes(key)) {
      console.error(term.red(`Unknown config key: ${key}`))
      console.log(term.dim("Valid keys: board, parent, prefix"))
      process.exitCode = 1
      return
    }

    const resolved = resolvePathArg(undefined)
    const configPath = `${resolved.repoRoot}/.km/config.yaml`

    console.log(term.yellow(`To set ${key}=${value}, edit ${configPath}:`))
    console.log()
    console.log(term.dim("beads:"))
    console.log(term.dim(`  ${key}: "${value}"`))
    console.log()
    console.log(term.dim("(Programmatic config editing coming soon)"))
  })

// Show config list by default when no subcommand
configCommand.action(() => {
  const resolved = resolvePathArg(undefined)
  const configObj = loadConfigObject(resolved.repoRoot)

  console.log(term.bold("Beads Configuration"))
  console.log(`  board:  ${configObj.beads.board || term.dim("(not set)")}`)
  console.log(`  parent: ${configObj.beads.parent || term.dim("(not set)")}`)
  console.log(`  prefix: ${configObj.beads.prefix}`)
  if (configObj.path) {
    console.log()
    console.log(term.dim(`Source: ${configObj.path}`))
  } else {
    console.log()
    console.log(term.dim("No config file found. Create .km/config.yaml to customize."))
  }
})
