/**
 * Show Command
 *
 * Display details of a node
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { join } from "path"

const term = createTerm(process)
import { resolvePathArg, type Repo, type KLink } from "@km/storage"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import type { KNode } from "@km/core"
import { formatStatus, formatNodeBrief } from "@km/tui"

/** Options parsed from the show command flags */
interface ShowOptions {
  children?: boolean
  tree?: boolean
  links?: boolean
  json?: boolean
}

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
      console.error(term.red(`Cannot show a directory. Use 'km ls' to list contents.`))
      process.exit(1)
    }

    const node = repo.resolveNode(resolved.nodeRef)

    if (!node) {
      console.error(term.red(`Node not found: ${id}`))
      process.exit(1)
    }

    if (options.json) {
      outputJson(node, options, repo)
      return
    }

    displayFields(node, resolved.repoRoot)
    displayChildren(node, options, repo)
    displayLinks(node, options, repo)
  })

/**
 * Output node data as JSON based on the requested mode (tree, children, or single node)
 */
function outputJson(node: KNode, options: ShowOptions, repo: Repo): void {
  if (options.tree) {
    console.log(JSON.stringify(repo.getSubtree(node.id), null, 2))
  } else if (options.children) {
    console.log(JSON.stringify({ node, children: repo.getChildren(node.id) }, null, 2))
  } else {
    console.log(JSON.stringify(node, null, 2))
  }
}

/**
 * Display node fields, refs, and other data
 */
function displayFields(node: KNode, rootPath: string): void {
  for (const f of DISPLAY_FIELDS) {
    let val = f.get?.(node) ?? (node as unknown as Record<string, unknown>)[f.key]
    // Convert relative fs_path to absolute for display
    if (f.key === "fs_path" && typeof val === "string" && !val.startsWith("/")) {
      val = join(rootPath, val)
    }
    if (val !== undefined && val !== null) {
      console.log(term.bold(`${f.label}:`), val)
    }
  }

  displayRefs(node)

  // Show other data if present (excluding already-displayed ref fields)
  const otherData = { ...node.data }
  delete otherData.mentions
  delete otherData.tags
  delete otherData.projects
  if (Object.keys(otherData).length > 0) {
    console.log(term.bold("Data:"), JSON.stringify(otherData, null, 2))
  }
}

/**
 * Display children or subtree when requested
 */
function displayChildren(node: KNode, options: ShowOptions, repo: Repo): void {
  if (!options.children && !options.tree) return

  const children = options.tree
    ? repo.getSubtree(node.id).slice(1) // Exclude self
    : repo.getChildren(node.id)

  if (children.length === 0) return

  console.log(term.bold("\nChildren:"))
  for (const child of children) {
    const prefix = options.tree ? getIndent(child, node.id) : "  "
    console.log(`${prefix}${formatNodeBrief(child)}`)
  }
}

/**
 * Display outgoing links and backlinks when requested
 */
function displayLinks(node: KNode, options: ShowOptions, repo: Repo): void {
  if (!options.links) return

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
 * Format an outgoing link (v4 KLink: host_id, href, rel).
 *
 * Under the v4 schema, links carry a canonical `href` (km:Note,
 * km:Note#Section, https://…) and no cached target_id. We display the
 * href verbatim and mark embeds with an "[embed]" tag.
 */
function formatLink(link: KLink, _repo: Repo): string {
  const parts: string[] = []
  parts.push(term.cyan(link.href))
  if (link.rel === "embed") parts.push(term.dim("[embed]"))
  return parts.join(" ")
}

/**
 * Format a backlink (incoming link) — v4 KLink.
 */
function formatBacklink(link: KLink, repo: Repo): string {
  const sourceNode = repo.getNode(link.host_id)
  const parts: string[] = []

  if (sourceNode) {
    const sourceName = sourceNode.fs_path
      ? sourceNode.fs_path.split("/").pop()
      : sourceNode.content?.slice(0, 30) || link.host_id.slice(-8)
    parts.push(term.green(`← ${sourceName}`))
    parts.push(term.dim(`(${link.host_id.slice(-8)})`))
  } else {
    parts.push(term.dim(`← ${link.host_id.slice(-8)}`))
  }

  if (link.rel === "embed") parts.push(term.dim("[embed]"))

  return parts.join(" ")
}

/**
 * Field display configuration for node details
 */
interface DisplayField {
  key: string
  label: string
  get?: (node: KNode) => unknown
}

const DISPLAY_FIELDS: DisplayField[] = [
  { key: "id", label: "ID" },
  { key: "type", label: "Type" },
  { key: "fs_path", label: "Path" },
  {
    key: "title",
    label: "Title",
    get: (n) => n.title || (n.data?.title as string | undefined),
  },
  {
    key: "content",
    label: "Content",
    get: (n) => {
      const title = n.title || (n.data?.title as string | undefined)
      return n.content && n.content !== title ? n.content : undefined
    },
  },
  {
    key: "task_status",
    label: "Status",
    get: (n) => (n.item?.task?.status ? formatStatus(n.item?.task?.status) : undefined),
  },
  { key: "due_at", label: "Due" },
  { key: "priority", label: "Priority" },
  { key: "assigned_to", label: "Assigned" },
  {
    key: "parent_id",
    label: "Parent",
    get: (n) => (n.parent_id ? n.parent_id.slice(-8) : undefined),
  },
  {
    key: "created_at",
    label: "Created",
    get: (n) => new Date(n.created_at).toISOString(),
  },
  {
    key: "updated_at",
    label: "Updated",
    get: (n) => new Date(n.updated_at).toISOString(),
  },
]

/**
 * Display refs (mentions, tags, projects) from node data
 */
function displayRefs(node: KNode): void {
  const { data } = node
  const mentions = Array.isArray(data.mentions) ? (data.mentions as string[]) : []
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : []
  const projects = Array.isArray(data.projects) ? (data.projects as string[]) : []
  if (mentions.length > 0) {
    console.log(term.bold("Refs:"), mentions.map((m) => term.magenta(`@${m}`)).join(" "))
  }
  if (tags.length > 0) {
    console.log(term.bold("Tags:"), tags.map((t) => term.cyan(`#${t}`)).join(" "))
  }
  if (projects.length > 0) {
    console.log(term.bold("Projects:"), projects.map((p) => term.yellow(`+${p}`)).join(" "))
  }
}
