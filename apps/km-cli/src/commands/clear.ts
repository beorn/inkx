/**
 * `km clear` — Generic Field Clear
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: counterpart to `km set`. Pass
 * one or more node ids and one or more bare field names; nulls each
 * scalar column on each id. Pure parsing lives in `clear-plan.ts`.
 *
 * Examples:
 *   km clear abc123 due
 *   km clear abc123 priority owner
 *   km clear abc123 def456 due priority    # bulk
 */

import type { KNode } from "@km/core"
import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { planClear } from "./clear-plan.ts"
import { resolveShortId, formatAmbiguityError } from "../utils/short-id.ts"

interface ClearOptions {
  json?: boolean
  dryRun?: boolean
  where?: string
}

/**
 * Split positional args into ids vs field names. Heuristic: anything
 * that resolves as a node is an id; anything else is a field name.
 * To keep parsing pure, we use a syntactic rule: known field names go
 * to fields, the rest are ids. We accept the SCALAR set verbatim.
 */
const SCALAR_FIELD_NAMES = new Set([
  "due",
  "due_date",
  "due_at",
  "start",
  "scheduled",
  "scheduled_date",
  "start_at",
  "p",
  "priority",
  "assigned",
  "assigned_to",
  "owner",
])

function partitionArgs(args: readonly string[]): { ids: string[]; fields: string[] } {
  const ids: string[] = []
  const fields: string[] = []
  for (const arg of args) {
    if (SCALAR_FIELD_NAMES.has(arg.toLowerCase())) fields.push(arg)
    else ids.push(arg)
  }
  return { ids, fields }
}

export const clearCommand = new Command("clear")
  .description("Clear field values on one or more nodes (generic)")
  .argument("[args...]", "<id...> <field...> — ids first, then fields (or intermixed)")
  .option("--json", "Output as JSON")
  .option("--dry-run", "Show planned changes without applying")
  .option("--where <query>", "Bulk select via query DSL (mutually exclusive with positional ids)")
  .action(async (args: string[], options: ClearOptions) => {
    const { ids, fields } = partitionArgs(args ?? [])

    // --where + positional ids is ambiguous; reject (per @km/cli/bulk-multi-id-or-where).
    if (options.where !== undefined && ids.length > 0) {
      console.error(term.red("Cannot pass both positional ids and --where (mutually exclusive)"))
      process.exit(1)
    }

    if (ids.length === 0 && options.where === undefined) {
      console.error(term.red("No node ids provided"))
      process.exit(1)
    }
    if (fields.length === 0) {
      console.error(term.red("No fields provided (expected: due, priority, owner, start, ...)"))
      process.exit(1)
    }

    const resolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(resolved.repoRoot)

    // Target resolution mirrors `set.ts`: --where via repo.query, else
    // positional walk via resolveShortId.
    const targets: Array<{ idArg: string; node: KNode }> = []
    let hadError = false

    if (options.where !== undefined) {
      let nodes: KNode[]
      try {
        nodes = repo.query(options.where)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(term.red(`--where query failed: ${msg}`))
        process.exit(1)
      }
      if (nodes.length === 0) {
        console.error(term.red(`--where "${options.where}" matched no nodes`))
        process.exit(1)
      }
      for (const node of nodes) {
        const data = node.data as { id?: unknown } | undefined
        const idArg = typeof data?.id === "string" && data.id ? data.id : (node.fs_path ?? node.id)
        targets.push({ idArg, node })
      }
    } else {
      for (const idArg of ids) {
        const result = resolveShortId(repo, idArg)
        if (result.candidates.length > 0) {
          console.error(term.red(formatAmbiguityError(idArg, result.candidates)))
          hadError = true
          continue
        }
        const node = result.node
        if (!node) {
          console.error(term.red(`Node not found: ${idArg}`))
          hadError = true
          continue
        }
        targets.push({ idArg, node })
      }
    }

    const results: Array<{ id: string; cleared: string[] }> = []

    for (const { idArg, node } of targets) {
      const plan = planClear(fields)
      for (const warning of plan.warnings) {
        console.error(term.yellow(`${idArg}: ${warning}`))
      }

      if (Object.keys(plan.updates).length === 0) {
        console.error(term.red(`${idArg}: No valid fields to clear`))
        hadError = true
        continue
      }

      if (!options.dryRun) {
        repo.updateNode(node.id, plan.updates)
      }

      results.push({ id: node.id, cleared: fields })
    }

    if (options.json) {
      console.log(JSON.stringify({ dryRun: options.dryRun ?? false, results }))
    } else {
      const verb = options.dryRun ? "Would clear" : "Cleared"
      for (const r of results) {
        console.log(term.dim("○"), `${verb} ${r.cleared.join(", ")}:`, r.id.slice(-8))
      }
    }

    if (hadError) process.exit(1)
  })
