/**
 * `km query` — Raw DSL Query
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: alias of `km list --raw <dsl>`.
 * Bypasses default scoping (no "hide done", no implicit type filter)
 * so power users can run the full FTS / query-language surface
 * directly. Mirrors `bd query`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { formatNode } from "@km/tui"
import { emitJson, normalizeJsonJq } from "../utils/jq.ts"

export const queryCommand = new Command("query")
  .description("Run a raw query DSL expression (no default scoping; alias of `km list --raw <dsl>`)")
  .argument("<dsl>", "Query expression (status:todo @person #tag, etc.)")
  .option("--json", "Output as JSON")
  .option("--jq <expr>", "Filter JSON output through jq (implies --json; requires `jq` in PATH)")
  .option("-i, --id", "Show node IDs")
  .action(async (dsl: string, options: { json?: boolean; jq?: string; id?: boolean }) => {
    const resolved = resolvePathArg(undefined, getRootPath() || process.cwd())
    using repo = await loadRepo(resolved.repoRoot)

    const nodes = repo.query(dsl || "*")

    const { json, jq } = normalizeJsonJq(options)
    if (json) {
      await emitJson(nodes, jq)
      return
    }

    if (nodes.length === 0) {
      console.log(term.dim("No nodes matched"))
      return
    }

    for (const node of nodes) {
      console.log(formatNode(repo, node, options.id ?? false))
    }
    console.log(term.dim(`\n${nodes.length} node(s)`))
  })
