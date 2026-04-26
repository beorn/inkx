/**
 * Beads Config Subcommand
 *
 * View and modify beads configuration.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { loadKmBdConfig } from "./bd-load-config.ts"

export const configCommand = new Command("config").description("View and modify beads configuration")

configCommand
  .command("list")
  .alias("ls")
  .description("List current configuration")
  .action(async () => {
    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)

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
  .command("get")
  .argument("<key>", "Config key (board, parent, prefix)")
  .description("Get a configuration value")
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)

    switch (opts.key) {
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
        console.error(term.red(`Unknown config key: ${opts.key}`))
        console.log(term.dim("Valid keys: board, parent, prefix"))
        process.exitCode = 1
    }
  })

configCommand
  .command("set")
  .argument("<key>", "Config key (board, parent, prefix)")
  .argument("<value>", "Config value")
  .description("Set a configuration value (edits .km/config.yaml)")
  .actionMerged(async (opts) => {
    // Validate key
    if (!["board", "parent", "prefix"].includes(opts.key)) {
      console.error(term.red(`Unknown config key: ${opts.key}`))
      console.log(term.dim("Valid keys: board, parent, prefix"))
      process.exitCode = 1
      return
    }

    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)

    // `@silvery/config` handles atomic writes + scoped (local) save.
    configObj.raw.set(`beads.${opts.key}`, opts.value, "local")
    await configObj.raw.save({ scope: "local" })

    console.log(term.green(`Set beads.${opts.key} = ${opts.value}`))
    if (configObj.raw.projectPath) {
      console.log(term.dim(`Wrote: ${configObj.raw.projectPath}`))
    }
  })

// Show config list by default when no subcommand
configCommand.action(async () => {
  const resolved = resolvePathArg(undefined)
  const configObj = await loadKmBdConfig(resolved.repoRoot)

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
