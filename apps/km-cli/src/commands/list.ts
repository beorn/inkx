/**
 * List Command
 *
 * List nodes with optional filtering and context display.
 * Core command that other views build on.
 *
 * km list [query]              # List all nodes
 * km ls [query]                # Alias
 * km ls --type task            # Filter by type
 * km ls --type task --context  # With ancestor paths (= tasks)
 */

import { Command, intRange } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { type Repo } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { KNode, type KNode as KNodeType } from "@km/core"
import { loadRepo } from "../load-repo.ts"
import { getRootPath } from "../program.ts"
import { collapseAncestorsWithTypes, type CollapsedAncestor } from "@km/tree"
import { formatNode, formatCollapsedAncestor } from "@km/tui"
import { getBrokenLinks, filterBrokenLinksByScope, printBrokenLinks } from "./broken-links.ts"

// ============================================
// Main Export - List Command
// ============================================

export const listCommand = new Command("list")
  .alias("ls")
  .description("List nodes")
  .argument("[query]", "Filter by path, ID prefix, -status:done negation")
  .allowUnknownOption()
  .option("-t, --type <type>", "Filter by node type (task, section, file, folder)")
  .option("-s, --status <status>", "Filter tasks by status (todo, wip, done)")
  .option("-a, --all", "Show all (including done tasks)")
  .option("--assignee <name>", "Filter by assignee")
  .option("-p, --priority <value>", "Filter by priority (0-4)", intRange(0, 4))
  .option("--blocked", "Show only blocked")
  .option("--unblocked", "Show only unblocked")
  .option("--broken", "Show broken wikilinks (replaces node list). Scoped by [query] when provided")
  .option("-c, --context", "Show ancestor paths (like tasks command)")
  .option("-i, --id", "Show node IDs")
  .option("-f, --flat", "Flat output with path prefixes")
  .option("--json", "Output as JSON")
  .action(async (queryOrPath, options) => {
    // Check if argument looks like a path
    let repoRoot: string
    let query: string | undefined

    if (queryOrPath && (queryOrPath.startsWith("/") || queryOrPath.startsWith(".") || queryOrPath.startsWith("~"))) {
      // It's a path — resolve to repo root + optional node reference.
      // If the path points to a file or subdirectory inside a repo, use it
      // as the scope query (for --broken). If it points to the repo root
      // itself, there's no scope query.
      const resolved = resolvePathArg(queryOrPath, getRootPath())
      repoRoot = resolved.repoRoot
      query = resolved.nodeRef ?? undefined
    } else {
      // It's a query - use default root
      repoRoot = getRootPath() ?? process.cwd()
      query = queryOrPath
    }

    using repo = await loadRepo(repoRoot)

    // --broken: show broken wikilinks instead of the node list, optionally
    // scoped to the subtree rooted at [query]. `km doctor links` is a
    // thin alias that ends up in the same code path below.
    if (options.broken) {
      const db = (repo as unknown as { database: import("bun:sqlite").Database }).database
      const allLinks = getBrokenLinks(db)

      let scopeLabel: string | undefined
      let scopedLinks = allLinks

      if (query) {
        // Resolve the query to a scope node. Try resolveNode first
        // (handles absolute paths, relative paths, bare names, block ids,
        // and id prefixes in one shot — the same resolver `km show` uses).
        // Fall back to fs_path substring match + id-prefix if that misses.
        const scopeRoots = new Set<string>()
        const byResolve = repo.resolveNode?.(query)
        if (byResolve) scopeRoots.add(byResolve.id)

        if (scopeRoots.size === 0) {
          const byName = repo.resolveByName?.(query)
          if (byName) scopeRoots.add(byName.id)
        }

        if (scopeRoots.size === 0) {
          // fs_path / id-prefix fallback
          const allNodes = repo.query("*")
          for (const node of allNodes) {
            const ancestors = repo.getAncestors(node.id)
            if (matchesQuery(node, query, ancestors)) scopeRoots.add(node.id)
          }
        }

        // Expand scope roots to include all descendants — "scoped to the
        // subtree" means links originating anywhere under a matched node.
        const scope = new Set<string>()
        const stack = [...scopeRoots]
        while (stack.length > 0) {
          const id = stack.pop()!
          if (scope.has(id)) continue
          scope.add(id)
          for (const child of repo.getChildren(id)) stack.push(child.id)
        }

        if (scope.size === 0) {
          console.log(term.dim(`  No nodes matched "${query}"`))
          return
        }

        scopedLinks = filterBrokenLinksByScope(allLinks, scope)
        scopeLabel = query
      }

      if (options.json) {
        console.log(JSON.stringify(scopedLinks, null, 2))
        return
      }

      printBrokenLinks(scopedLinks, term, { scopeLabel })
      return
    }

    const nodes = getFilteredNodesWithQuery(repo, {
      type: options.type,
      query,
      status: options.status,
      all: options.all,
      assignee: options.assignee,
      priority: options.priority,
      blocked: options.blocked,
      unblocked: options.unblocked,
    })

    if (options.json) {
      console.log(JSON.stringify(nodes, null, 2))
      return
    }

    if (nodes.length === 0) {
      console.log(term.dim("No nodes found"))
      return
    }

    const showId = options.id ?? false
    const flat = options.flat ?? false

    if (options.context || options.type === "task") {
      displayWithContext(repo, nodes, { showId, flat })
    } else {
      displaySimple(repo, nodes, { showId })
    }

    console.log(term.dim(`\n${nodes.length} node(s)`))
  })

// ============================================
// Helper Functions
// ============================================

/**
 * Match a query against a node
 * Query can be: node ID prefix, path pattern, or relative path
 */
function matchesQuery(node: KNodeType, query: string, ancestors: KNodeType[]): boolean {
  // ID prefix match
  if (node.id.toLowerCase().startsWith(query.toLowerCase())) {
    return true
  }

  // Path match - check node's path and ancestors
  const lowerQuery = query.toLowerCase()

  // Check node's own path/content
  if (node.fs_path?.toLowerCase().includes(lowerQuery)) {
    return true
  }

  // Check ancestors' paths
  for (const ancestor of ancestors) {
    if (ancestor.fs_path?.toLowerCase().includes(lowerQuery)) {
      return true
    }
  }

  return false
}

/**
 * Get nodes filtered by type and query
 */
function getFilteredNodesWithQuery(
  repo: Repo,
  options: {
    type?: string
    query?: string
    status?: string
    all?: boolean
    assignee?: string
    priority?: number
    blocked?: boolean
    unblocked?: boolean
  },
): KNodeType[] {
  // Build query expression based on options
  let nodes: KNodeType[]

  // If assignee/priority flags are set, build a query string and use repo.query()
  const hasAdvancedFilters = options.assignee || options.priority !== undefined
  if (hasAdvancedFilters) {
    const parts: string[] = []
    if (options.type) parts.push(`type:${options.type}`)
    if (options.status) parts.push(`status:${options.status}`)
    else if (!options.all) parts.push(`-status:done`)
    if (options.assignee) parts.push(`@${options.assignee}`)
    if (options.priority !== undefined) parts.push(`#P${options.priority}`)
    if (options.query) parts.push(options.query)
    nodes = repo.query(parts.join(" ") || "*")
  } else if (options.type === "task") {
    if (options.status) {
      nodes = repo.getTasksByStatus(options.status as "todo" | "wip" | "done" | "dropped")
    } else if (options.all) {
      nodes = repo.getAllTasks()
    } else {
      // Exclude done tasks by default
      nodes = repo.getAllTasks().filter((n: KNodeType) => n.item?.task?.status !== "done")
    }
  } else if (options.type) {
    // Use query for other types
    nodes = repo.query(`type:${options.type}`)
  } else {
    // No type filter - get all nodes via subtree from root
    // Include root node itself, then all descendants
    const rootNode = repo.getRepoRootNode()
    const getAllDescendants = (parentId: string | null, depth: number): Array<KNodeType & { _depth: number }> => {
      const children = repo.getChildren(parentId)
      return children.flatMap((child: KNodeType) => [
        Object.assign(child, { _depth: depth }),
        ...getAllDescendants(child.id, depth + 1),
      ])
    }
    nodes = rootNode
      ? [Object.assign(rootNode, { _depth: 0 }), ...getAllDescendants(null, 1)]
      : getAllDescendants(null, 0)
  }

  // Apply query filter if provided (only when not already handled above)
  if (options.query && !hasAdvancedFilters) {
    const query = options.query
    nodes = nodes.filter((node) => {
      const ancestors = repo.getAncestors(node.id)
      return matchesQuery(node, query, ancestors)
    })
  }

  // Apply blocked/unblocked filter
  if (options.blocked) {
    nodes = nodes.filter((n) => {
      const data = n.data as Record<string, unknown> | undefined
      const props = data?.props as Record<string, { type: string; target?: string; values?: unknown[] }> | undefined
      return props?.["blocked-by"] !== undefined
    })
  }
  if (options.unblocked) {
    nodes = nodes.filter((n) => {
      const data = n.data as Record<string, unknown> | undefined
      const props = data?.props as Record<string, { type: string; target?: string; values?: unknown[] }> | undefined
      return !props?.["blocked-by"]
    })
  }

  return nodes
}

/**
 * Display nodes with context (ancestor paths)
 */
function displayWithContext(repo: Repo, nodes: KNodeType[], options: { showId: boolean; flat: boolean }): void {
  // Group nodes by their collapsed ancestor paths
  interface NodeWithContext {
    node: KNodeType
    collapsed: CollapsedAncestor[]
    pathKey: string
  }

  const nodesWithContext: NodeWithContext[] = nodes.map((node) => {
    const ancestors = repo.getAncestors(node.id)
    const collapsed = collapseAncestorsWithTypes(ancestors)
    const pathKey = collapsed.map((ca) => ca.node.id).join("/")
    return { node, collapsed, pathKey }
  })

  // Sort by path
  nodesWithContext.sort((a, b) => a.pathKey.localeCompare(b.pathKey))

  if (options.flat) {
    // Flat mode: each node on one line with path prefix
    for (const { node, collapsed } of nodesWithContext) {
      const pathParts = collapsed.map((ca) => term.dim(formatCollapsedAncestor(repo, ca, false)))
      const pathStr = pathParts.length > 0 ? pathParts.join(" › ") + " › " : ""
      console.log(pathStr + formatNode(repo, node, options.showId))
    }
  } else {
    // Tree mode: show ancestors once, then nodes indented
    let lastPathKey = ""
    for (const { node, collapsed, pathKey } of nodesWithContext) {
      // Print path if different from last
      if (pathKey !== lastPathKey) {
        if (lastPathKey !== "") {
          console.log() // Blank line between groups
        }
        let depth = 0
        for (const ca of collapsed) {
          const prefix = " ".repeat(depth)
          console.log(prefix + term.dim(formatCollapsedAncestor(repo, ca, options.showId)))
          if (!(KNode.isOutline(ca.node) && ca.node.fstype === "mdsection")) {
            depth++
          }
        }
        lastPathKey = pathKey
      }

      // Print node
      const indent = " ".repeat(Math.max(0, collapsed.length))
      console.log(indent + formatNode(repo, node, options.showId))
    }
  }
}

/**
 * Display nodes as a tree with indentation
 */
function displaySimple(repo: Repo, nodes: KNodeType[], options: { showId: boolean }): void {
  for (const node of nodes) {
    const depth = (node as KNodeType & { _depth?: number })._depth ?? 0
    const indent = "  ".repeat(depth)
    console.log(indent + formatNode(repo, node, options.showId))
  }
}
