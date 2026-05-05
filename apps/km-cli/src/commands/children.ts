/**
 * `km children` — Discoverability Alias
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: ergonomic alias of
 * `km show <id> -c`. "Show me the children" reads more naturally as
 * `km children <id>`. Reuses the same resolver / repo / output as
 * `km show -c`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { formatNodeBrief } from "@km/tui"

export const childrenCommand = new Command("children")
  .description("Show the children of a node (alias of `km show <id> -c`)")
  .argument("<id>", "Node ID, path, or filename")
  .option("--json", "Output as JSON")
  .action(async (id: string, options: { json?: boolean }) => {
    const resolved = resolvePathArg(id, getRootPath())
    using repo = await loadRepo(resolved.repoRoot)

    if (!resolved.nodeRef) {
      console.error(term.red(`Cannot show a directory. Use 'km ls' to list contents.`))
      process.exit(1)
    }

    const node = repo.resolveNode(resolved.nodeRef)
    if (!node) {
      console.error(term.red(`Node not found: ${id}`))
      process.exit(1)
    }

    const children = repo.getChildren(node.id)

    if (options.json) {
      console.log(JSON.stringify({ node, children }, null, 2))
      return
    }

    if (children.length === 0) {
      console.log(term.dim("No children."))
      return
    }

    for (const child of children) {
      console.log(`  ${formatNodeBrief(child)}`)
    }
  })
