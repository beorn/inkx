/**
 * `km set` — Generic Field Mutation
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: top-level node-graph mutator.
 * Accepts one or more node ids and one or more `field:value` tokens;
 * applies the same patch to every id. Pure parsing/validation lives in
 * `set-plan.ts`; this file is the I/O glue (resolve repo, resolve
 * nodes, run the planner, emit updates, render).
 *
 * Examples:
 *   km set abc123 priority:P1
 *   km set abc123 due:2025-01-20 owner:beorn
 *   km set abc123 def456 status:done       # bulk
 *   km set abc123 --priority P0 --due 2025-01-20  # flag form
 *   km set abc123 priority:P1 --dry-run    # plan-only
 */

import type { KNode } from "@km/core"
import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { planSet } from "./set-plan.ts"
import { resolveShortId, formatAmbiguityError } from "../utils/short-id.ts"

interface SetOptions {
  json?: boolean
  dryRun?: boolean
  where?: string
  priority?: string
  due?: string
  start?: string
  owner?: string
  status?: string
  type?: string
  parent?: string
  aliases?: string
}

/**
 * Convert `--flag value` options into the shared `field:value` token
 * stream. Keeps the planner as the single source of truth for field
 * validation — flags are just sugar.
 */
function flagsToFields(options: SetOptions): string[] {
  const tokens: string[] = []
  if (options.priority !== undefined) tokens.push(`priority:${options.priority}`)
  if (options.due !== undefined) tokens.push(`due:${options.due}`)
  if (options.start !== undefined) tokens.push(`start:${options.start}`)
  if (options.owner !== undefined) tokens.push(`owner:${options.owner}`)
  if (options.status !== undefined) tokens.push(`status:${options.status}`)
  if (options.type !== undefined) tokens.push(`type:${options.type}`)
  if (options.parent !== undefined) tokens.push(`parent:${options.parent}`)
  if (options.aliases !== undefined) tokens.push(`aliases:${options.aliases}`)
  return tokens
}

/**
 * Split positional args into ids vs field:value tokens. Tokens with a
 * `:` are field:value; bare tokens are ids. Bulk semantics: every id
 * gets every field. Mirrors taskwarrior `task <ids> modify <fields>`.
 */
function partitionArgs(args: readonly string[]): { ids: string[]; fields: string[] } {
  const ids: string[] = []
  const fields: string[] = []
  for (const arg of args) {
    if (arg.includes(":")) fields.push(arg)
    else ids.push(arg)
  }
  return { ids, fields }
}

export const setCommand = new Command("set")
  .description("Set field values on one or more nodes (generic; tasks, notes, anything)")
  .argument("[args...]", "<id...> <field:value...> — ids and field:value tokens may be intermixed")
  .option("--json", "Output as JSON")
  .option("--dry-run", "Show planned changes without applying")
  .option("--where <query>", "Bulk select via query DSL (mutually exclusive with positional ids)")
  .option("-p, --priority <value>", "Priority (P0..P4)")
  .option("--due <date>", "Due date (ISO; natural-language deferred)")
  .option("--start <date>", "Start date")
  .option("--owner <user>", "Assignee (alias: --assigned)")
  .option("--status <status>", "Task status (todo|wip|blocked|done|dropped)")
  .option("--type <type>", "Bead-style type tag")
  .option("--parent <ref>", "Reparent under another node")
  .option("--aliases <list>", "Comma-separated alias list")
  .action(async (args: string[], options: SetOptions) => {
    const { ids, fields: positionalFields } = partitionArgs(args ?? [])
    const allFields = [...positionalFields, ...flagsToFields(options)]

    // --where + positional ids is ambiguous; reject (per @km/cli/bulk-multi-id-or-where).
    if (options.where !== undefined && ids.length > 0) {
      console.error(term.red("Cannot pass both positional ids and --where (mutually exclusive)"))
      process.exit(1)
    }

    if (ids.length === 0 && options.where === undefined) {
      console.error(term.red("No node ids provided"))
      process.exit(1)
    }
    if (allFields.length === 0) {
      console.error(term.red("No fields provided (expected field:value or --flag)"))
      process.exit(1)
    }

    const resolved = resolvePathArg(process.cwd(), getRootPath())
    using repo = await loadRepo(resolved.repoRoot)

    // Resolve target ids: --where via repo.query, else positional walk
    // through resolveShortId. `targets` carries `(idArg, node)` so we
    // can echo the user's input verbatim in error messages.
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

    const results: Array<{ id: string; updates: Record<string, unknown>; parent?: string }> = []

    for (const { idArg, node } of targets) {
      const plan = planSet(repo, node.id, allFields)
      for (const warning of plan.warnings) {
        console.error(term.yellow(`${idArg}: ${warning}`))
      }
      if (plan.errors.length > 0) {
        for (const err of plan.errors) {
          console.error(term.red(`${idArg}: ${err}`))
        }
        hadError = true
        continue
      }

      const hasUpdates = Object.keys(plan.updates).length > 0
      if (!hasUpdates && plan.newParentId === undefined) {
        console.error(term.red(`${idArg}: No valid field updates`))
        hadError = true
        continue
      }

      if (!options.dryRun) {
        if (hasUpdates) {
          repo.updateNode(node.id, plan.updates)
        }
        if (plan.newParentId) {
          const siblings = repo.getChildren(plan.newParentId)
          repo.moveNode(node.id, plan.newParentId, siblings.length)
        }
      }

      results.push({
        id: node.id,
        updates: plan.updates,
        ...(plan.newParentId ? { parent: plan.newParentId } : {}),
      })
    }

    if (options.json) {
      console.log(JSON.stringify({ dryRun: options.dryRun ?? false, results }))
    } else {
      const verb = options.dryRun ? "Would update" : "Updated"
      for (const r of results) {
        const keys = [...Object.keys(r.updates), ...(r.parent ? ["parent"] : [])]
        console.log(term.green("✓"), `${verb} ${keys.join(", ")}:`, r.id.slice(-8))
      }
    }

    if (hadError) process.exit(1)
  })
