/**
 * Beads Config Subcommand
 *
 * View and modify beads configuration.
 *
 * Keys exposed:
 *   - `beads.prefix`         (default `"km"`) — vault sigil for cross-vault refs
 *   - `beads.roots`          (default `["@km"]`) — search/write roots within the repo
 *   - `beads.default_scope`  (default `"inbox"`) — landing zone for fresh `bd create`
 *
 * Defaults are hard-coded in code; `.km/config.yaml` overrides them. A fresh
 * repo with no config file still has working defaults.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { loadKmBdConfig } from "./bd-load-config.ts"

export const configCommand = new Command("config").description("View and modify beads configuration")

// Canonical keys are the dotted form that mirrors `.km/config.yaml` shape.
// Bare forms (e.g. `prefix`) are accepted as aliases for ergonomics.
const VALID_KEYS = ["beads.prefix", "beads.roots", "beads.default_scope"] as const
const KEY_ALIASES: Record<string, (typeof VALID_KEYS)[number]> = {
  prefix: "beads.prefix",
  "beads.prefix": "beads.prefix",
  roots: "beads.roots",
  "beads.roots": "beads.roots",
  default_scope: "beads.default_scope",
  "beads.default_scope": "beads.default_scope",
}

function normalizeKey(key: string): (typeof VALID_KEYS)[number] | undefined {
  return KEY_ALIASES[key]
}

function printConfig(configObj: Awaited<ReturnType<typeof loadKmBdConfig>>): void {
  console.log(term.bold("Beads Configuration"))
  console.log(`  beads.prefix:        ${configObj.beads.prefix}`)
  console.log(`  beads.roots:         ${JSON.stringify(configObj.beads.roots)}`)
  console.log(`  beads.default_scope: ${configObj.beads.default_scope}`)
  if (configObj.path) {
    console.log()
    console.log(term.dim(`Source: ${configObj.path} (overrides defaults)`))
  } else {
    console.log()
    console.log(term.dim("Using built-in defaults. Create .km/config.yaml to customize."))
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
  .argument("<key>", "Config key (beads.prefix, beads.roots, beads.default_scope; bare names also accepted)")
  .description("Get a configuration value")
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)

    const canonical = normalizeKey(opts.key)
    switch (canonical) {
      case "beads.prefix":
        console.log(configObj.beads.prefix)
        break
      case "beads.roots":
        console.log(JSON.stringify(configObj.beads.roots))
        break
      case "beads.default_scope":
        console.log(configObj.beads.default_scope)
        break
      default:
        console.error(term.red(`Unknown config key: ${opts.key}`))
        console.log(term.dim(`Valid keys: ${VALID_KEYS.join(", ")}`))
        process.exitCode = 1
    }
  })

configCommand
  .command("set")
  .argument("<key>", "Config key (beads.prefix, beads.roots, beads.default_scope; bare names also accepted)")
  .argument("<value>", "Config value (for beads.roots, JSON array literal e.g. '[\"@km\",\"imports/x\"]')")
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

    // For array-typed keys (beads.roots) accept a JSON array literal so the
    // user can set `["@km", "imports/x"]` from the shell. String keys pass
    // through verbatim.
    let value: unknown = opts.value
    if (canonical === "beads.roots") {
      try {
        const parsed = JSON.parse(opts.value)
        if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === "string")) {
          throw new Error("expected JSON array of strings")
        }
        value = parsed
      } catch (err) {
        console.error(term.red(`Invalid value for beads.roots: ${String(err)}`))
        console.log(term.dim('Pass a JSON array of strings, e.g. \'["@km","imports/x"]\''))
        process.exitCode = 1
        return
      }
    }

    // `@silvery/config` handles atomic writes + scoped (local) save.
    configObj.raw.set(canonical, value, "local")
    await configObj.raw.save({ scope: "local" })

    console.log(term.green(`Set ${canonical} = ${typeof value === "string" ? value : JSON.stringify(value)}`))
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
