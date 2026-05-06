/**
 * `km stale` — Generic Stale-Node Listing
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: where `task stale` lists
 * untouched-≥N-days TASKS, `km stale` lists ANY stale node — notes,
 * sections, project pages — by `updated_at` threshold. Filtering lives
 * in `stale-plan.ts` (pure); this file owns the I/O surface.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../load-repo.ts"
import { getRootPath } from "../program.ts"
import { planStale } from "./stale-plan.ts"
import { emitJson, normalizeJsonJq } from "../utils/jq.ts"

interface StaleOptions {
  days?: number
  showIds?: boolean
  json?: boolean
  jq?: string
  /** Include folder/file container nodes (off by default — see stale-plan.ts). */
  includeContainers?: boolean
}

export const staleCommand = new Command("stale")
  .description("List nodes not updated in N days (any node, not just tasks)")
  .option("-d, --days <n>", "Days threshold (default 14)", (v) => parseInt(v, 10), 14)
  .option("-i, --show-ids", "Show node ids")
  .option("--json", "Output as JSON")
  .option("--jq <expr>", "Filter JSON output through jq (implies --json; requires `jq` in PATH)")
  .option("--include-containers", "Include folder/file container nodes")
  .action(async (options: StaleOptions) => {
    const resolved = resolvePathArg(undefined, getRootPath() || process.cwd())
    using repo = await loadRepo(resolved.repoRoot)

    // `repo.query("*")` returns every node — the same surface `km list`
    // uses when no filters are provided.
    const allNodes = repo.query("*")
    const plan = planStale(allNodes, options.days, Date.now(), {
      includeContainers: options.includeContainers,
    })

    const { json, jq } = normalizeJsonJq(options)
    if (json) {
      await emitJson(
        plan.rows.map((r) => r.node),
        jq,
      )
      return
    }

    if (plan.rows.length === 0) {
      console.log(term.green(`No stale nodes (threshold: ${plan.days} days).`))
      return
    }

    console.log(term.bold(`Stale nodes (not updated in ${plan.days}+ days):`))
    console.log()
    for (const { node, staleness } of plan.rows) {
      const idSuffix = options.showIds ? ` ${term.dim(`(${node.id.slice(-8)})`)}` : ""
      const label = node.content?.split("\n")[0]?.slice(0, 80) ?? node.id.slice(-8)
      console.log(`  ${label}${idSuffix} ${term.dim(`(${staleness})`)}`)
    }
    console.log()
    console.log(term.dim(`${plan.rows.length} stale node(s)`))
  })
