/**
 * Show Command
 *
 * Display details of a node
 */

import { Command } from "@commander-js/extra-typings"
import { createTerm } from "inkx"

const term = createTerm(process)
import { resolvePathArg, type Repo, type Link } from "@km/storage"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import type { KNode } from "@km/core"
import { formatStatus, formatNodeBrief } from "@km/tui"

export const showCommand = new Command("show")
  .description("Show node details")
  .argument("<id>", "Node ID, path, or filename")
  .option("-c, --children", "Show children")
  .option("-t, --tree", "Show full subtree")
  .option("-l, --links", "Show links (outgoing and backlinks)")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    // Resolve path argument - may initialize store with detected repo root
    const resolved = resolvePathArg(id, getRootPath())
    using repo = await loadRepo(resolved.repoRoot)

    // Directory paths don't resolve to a specific node
    if (!resolved.nodeRef) {
      console.error(
        term.red(`Cannot show a directory. Use 'km ls' to list contents.`),
      )
      process.exit(1)
    }

    const node = repo.resolveNode(resolved.nodeRef)

    if (!node) {
      console.error(term.red(`Node not found: ${id}`))
      process.exit(1)
    }

    if (options.json) {
      if (options.tree) {
        console.log(JSON.stringify(repo.getSubtree(node.id), null, 2))
      } else if (options.children) {
        console.log(
          JSON.stringify(
            { node, children: repo.getChildren(node.id) },
            null,
            2,
          ),
        )
      } else {
        console.log(JSON.stringify(node, null, 2))
      }
      return
    }

    // Display node details
    console.log(term.bold("ID:"), node.id)
    console.log(term.bold("Type:"), node.type)

    if (node.fs_path) {
      console.log(term.bold("Path:"), node.fs_path)
    }

    // Title can be on node.title (in-memory) or node.data.title (from DB)
    const title = node.title || (node.data?.title as string | undefined)
    if (title) {
      console.log(term.bold("Title:"), title)
    }

    if (node.content && node.content !== title) {
      console.log(term.bold("Content:"), node.content)
    }

    if (node.task_status) {
      console.log(term.bold("Status:"), formatStatus(node.task_status))
    }

    if (node.due_date) {
      console.log(term.bold("Due:"), node.due_date)
    }

    if (node.priority) {
      console.log(term.bold("Priority:"), node.priority)
    }

    if (node.assigned_to) {
      console.log(term.bold("Assigned:"), node.assigned_to)
    }

    if (node.parent_id) {
      console.log(term.bold("Parent:"), node.parent_id.slice(0, 8))
    }

    console.log(term.bold("Created:"), new Date(node.created_at).toISOString())
    console.log(term.bold("Updated:"), new Date(node.updated_at).toISOString())

    // Display refs from data
    const data = node.data as Record<string, unknown>
    if (
      data.mentions &&
      Array.isArray(data.mentions) &&
      data.mentions.length > 0
    ) {
      console.log(
        term.bold("Refs:"),
        (data.mentions as string[]).map((m) => term.magenta(`@${m}`)).join(" "),
      )
    }
    if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
      console.log(
        term.bold("Tags:"),
        (data.tags as string[]).map((t) => term.cyan(`#${t}`)).join(" "),
      )
    }
    if (
      data.projects &&
      Array.isArray(data.projects) &&
      data.projects.length > 0
    ) {
      console.log(
        term.bold("Projects:"),
        (data.projects as string[]).map((p) => term.yellow(`+${p}`)).join(" "),
      )
    }

    // Show other data if present
    const otherData = { ...data }
    delete otherData.mentions
    delete otherData.tags
    delete otherData.projects
    if (Object.keys(otherData).length > 0) {
      console.log(term.bold("Data:"), JSON.stringify(otherData, null, 2))
    }

    // Children
    if (options.children || options.tree) {
      const children = options.tree
        ? repo.getSubtree(node.id).slice(1) // Exclude self
        : repo.getChildren(node.id)

      if (children.length > 0) {
        console.log(term.bold("\nChildren:"))
        for (const child of children) {
          const prefix = options.tree ? getIndent(child, node.id) : "  "
          console.log(`${prefix}${formatNodeBrief(child)}`)
        }
      }
    }

    // Links
    if (options.links) {
      const outgoing = repo.getOutgoingLinks(node.id)
      const backlinks = repo.getBacklinks(node.id)

      if (outgoing.length > 0) {
        console.log(term.bold("\nOutgoing links:"))
        for (const link of outgoing) {
          console.log(`  ${formatLink(link, repo)}`)
        }
      }

      if (backlinks.length > 0) {
        console.log(term.bold("\nBacklinks:"))
        for (const link of backlinks) {
          console.log(`  ${formatBacklink(link, repo)}`)
        }
      }

      if (outgoing.length === 0 && backlinks.length === 0) {
        console.log(term.dim("\nNo links found."))
      }
    }
  })

/**
 * Get indentation for tree display
 */
function getIndent(node: KNode, rootId: string): string {
  let depth = 0
  const current = node

  // Count depth from root
  while (current.parent_id && current.parent_id !== rootId) {
    depth++
    // This is simplified - in real impl would need to traverse
    break
  }

  return "  ".repeat(depth + 1)
}

/**
 * Format an outgoing link
 */
function formatLink(link: Link, repo: Repo): string {
  const parts: string[] = []

  // Target name with section/block
  let target = term.cyan(`[[${link.target_name}]]`)
  if (link.section) {
    target = term.cyan(`[[${link.target_name}#${link.section}]]`)
  }
  if (link.block_id) {
    target = term.cyan(`[[${link.target_name}^${link.block_id}]]`)
  }
  parts.push(target)

  // Resolution status
  if (link.target_id) {
    const targetNode = repo.getNode(link.target_id)
    if (targetNode) {
      parts.push(
        term.dim(`→ ${targetNode.fs_path || link.target_id.slice(0, 8)}`),
      )
    }
  } else {
    parts.push(term.yellow("(unresolved)"))
  }

  // Alias
  if (link.alias) {
    parts.push(term.dim(`"${link.alias}"`))
  }

  return parts.join(" ")
}

/**
 * Format a backlink (incoming link)
 */
function formatBacklink(link: Link, repo: Repo): string {
  const sourceNode = repo.getNode(link.source_id)
  const parts: string[] = []

  if (sourceNode) {
    const sourceName = sourceNode.fs_path
      ? sourceNode.fs_path.split("/").pop()
      : sourceNode.content?.slice(0, 30) || link.source_id.slice(0, 8)
    parts.push(term.green(`← ${sourceName}`))
    parts.push(term.dim(`(${link.source_id.slice(0, 8)})`))
  } else {
    parts.push(term.dim(`← ${link.source_id.slice(0, 8)}`))
  }

  return parts.join(" ")
}
