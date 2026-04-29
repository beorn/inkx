/**
 * Beads Config Subcommand
 *
 * View and modify beads configuration.
 *
 * The schema is intentionally tiny — only `prefix` (the vault sigil for
 * cross-vault refs). Board layout is encoded by the bd id itself
 * (km-<scope>.<slug> → file <scope>/<slug>.md, heading sigil @<scope>),
 * so there's no `board` or `parent` knob to set.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { loadKmBdConfig } from "./bd-load-config.ts"

export const configCommand = new Command("config").description("View and modify beads configuration")

// Canonical keys are the dotted form that mirrors `.km/config.yaml` shape.
// Bare forms (e.g. `prefix`) are accepted as aliases for ergonomics.
const VALID_KEYS = ["beads.prefix"] as const
const KEY_ALIASES: Record<string, (typeof VALID_KEYS)[number]> = {
  prefix: "beads.prefix",
  "beads.prefix": "beads.prefix",
}

function normalizeKey(key: string): (typeof VALID_KEYS)[number] | undefined {
  return KEY_ALIASES[key]
}

function printConfig(configObj: Awaited<ReturnType<typeof loadKmBdConfig>>): void {
  console.log(term.bold("Beads Configuration"))
  console.log(`  beads.prefix: ${configObj.beads.prefix}`)
  if (configObj.path) {
    console.log()
    console.log(term.dim(`Source: ${configObj.path}`))
  } else {
    console.log()
    console.log(term.dim("No config file found. Create .km/config.yaml to customize."))
  }
}

configCommand
  .command("list")
  .alias("ls")
  .description("List current configuration")
  .action(async () => {
    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)
    printConfig(configObj)
  })

configCommand
  .command("get")
  .argument("<key>", "Config key (beads.prefix; bare 'prefix' also accepted)")
  .description("Get a configuration value")
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)

    const canonical = normalizeKey(opts.key)
    switch (canonical) {
      case "beads.prefix":
        console.log(configObj.beads.prefix)
        break
      default:
        console.error(term.red(`Unknown config key: ${opts.key}`))
        console.log(term.dim(`Valid keys: ${VALID_KEYS.join(", ")}`))
        process.exitCode = 1
    }
  })

configCommand
  .command("set")
  .argument("<key>", "Config key (beads.prefix; bare 'prefix' also accepted)")
  .argument("<value>", "Config value")
  .description("Set a configuration value (edits .km/config.yaml)")
  .actionMerged(async (opts) => {
    const canonical = normalizeKey(opts.key)
    if (!canonical) {
      console.error(term.red(`Unknown config key: ${opts.key}`))
      console.log(term.dim(`Valid keys: ${VALID_KEYS.join(", ")}`))
      process.exitCode = 1
      return
    }

    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)

    // `@silvery/config` handles atomic writes + scoped (local) save.
    configObj.raw.set(canonical, opts.value, "local")
    await configObj.raw.save({ scope: "local" })

    console.log(term.green(`Set ${canonical} = ${opts.value}`))
    if (configObj.raw.projectPath) {
      console.log(term.dim(`Wrote: ${configObj.raw.projectPath}`))
    }
  })

// Show config list by default when no subcommand
configCommand.action(async () => {
  const resolved = resolvePathArg(undefined)
  const configObj = await loadKmBdConfig(resolved.repoRoot)
  printConfig(configObj)
})
