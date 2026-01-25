/**
 * Nodes to Markdown Converter
 *
 * Serializes km nodes back to markdown format
 */

import createDebug from "debug"
import { stringify as stringifyYaml } from "yaml"
import type { KNode } from "@km/core"
import { buildNodeTree } from "./ast2nodes.ts"

const debug = createDebug("km:markdown:nodes2md")

/**
 * Context for serialization - includes node lookup for embedding reconstruction
 */
interface SerializeContext {
  tree: Map<string, KNode[]>
  nodeMap: Map<string, KNode>
}

/**
 * Convert nodes to markdown
 */
export function nodesToMarkdown(nodes: KNode[]): string {
  debug("nodesToMarkdown: %d nodes", nodes.length)
  if (nodes.length === 0) {
    return ""
  }

  // Build tree structure and node lookup map
  const tree = buildNodeTree(nodes)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const ctx: SerializeContext = { tree, nodeMap }

  // Find root node (file node)
  const fileNode = nodes.find((n) => n.type === "file")
  if (!fileNode) {
    // No file node, serialize all nodes flat
    return nodes.map((n) => serializeNode(n, ctx, 0)).join("")
  }

  return serializeFile(fileNode, ctx)
}

/**
 * Check if a node is a list item type (task, ul, ol)
 */
function isListItemType(node: KNode): boolean {
  return node.type === "task" || node.type === "ul" || node.type === "ol"
}

/**
 * Serialize children with proper list grouping.
 * Consecutive list items are grouped together with no blank lines between them,
 * and a single blank line is added after each group.
 */
function serializeChildren(children: KNode[], ctx: SerializeContext): string {
  let md = ""

  for (let i = 0; i < children.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by loop condition
    const child = children[i]!
    const nextChild = children[i + 1]

    const isCurrentList = isListItemType(child)
    const isNextList = nextChild && isListItemType(nextChild)

    if (isCurrentList) {
      // For list items: serialize without trailing newline, add blank line only at end of group
      md += serializeNode(child, ctx, 0, false)
      if (!isNextList) {
        // End of list group - add blank line
        md += "\n"
      }
    } else {
      // Non-list items (sections, paragraphs, etc.) handle their own spacing
      md += serializeNode(child, ctx, 0, true)
    }
  }

  return md
}

/**
 * Serialize a file node (top-level document)
 *
 * The file node may have H1 properties merged in (content, title, rules).
 * We serialize the H1 heading first, then frontmatter (minus depth), then children.
 */
function serializeFile(node: KNode, ctx: SerializeContext): string {
  let md = ""

  // Frontmatter - exclude internal/computed fields
  // Original frontmatter values (tags, mentions, projects, title) are preserved
  const frontmatterData = { ...node.data }
  delete frontmatterData.depth // Internal: H1 merge tracking
  delete frontmatterData.rules // Internal: heading rules
  delete frontmatterData._h1Title // Internal: H1 heading title (distinct from frontmatter title)
  delete frontmatterData._allMentions // Computed: aggregated from content
  delete frontmatterData._allTags // Computed: aggregated from content
  delete frontmatterData._allProjects // Computed: aggregated from content

  if (Object.keys(frontmatterData).length > 0) {
    md += "---\n"
    md += stringifyYaml(frontmatterData)
    md += "---\n\n"
  }

  // H1 heading (merged into file node)
  if (node.content) {
    md += `# ${node.content}\n\n`
  }

  // Children (with proper list grouping)
  const children = ctx.tree.get(node.id) ?? []
  md += serializeChildren(children, ctx)

  return md
}

/**
 * Serialize a single node
 * @param addTrailingNewline - Whether to add trailing newline for list items (default true for backwards compat)
 */
function serializeNode(
  node: KNode,
  ctx: SerializeContext,
  indent: number,
  addTrailingNewline: boolean = true,
): string {
  const children = ctx.tree.get(node.id) ?? []

  switch (node.type) {
    case "file":
      return serializeFile(node, ctx)

    case "section":
      return serializeSection(node, children, ctx)

    case "paragraph":
      // If this node has link_to, it's an embedding - reconstruct ![[path|alias]]
      if (node.link_to) {
        return serializeEmbedding(node, ctx)
      }
      return (node.content ?? "") + "\n\n"

    case "quote":
      return serializeQuote(node)

    case "code":
      return serializeCode(node)

    case "ul":
      return serializeListItem(
        node,
        children,
        ctx,
        indent,
        false,
        addTrailingNewline,
      )

    case "ol":
      return serializeListItem(
        node,
        children,
        ctx,
        indent,
        true,
        addTrailingNewline,
      )

    case "task":
      return serializeTask(node, children, ctx, indent, addTrailingNewline)

    case "hr":
      return "---\n\n"

    case "table":
      return (node.content ?? "") + "\n\n"

    case "html":
      return (node.content ?? "") + "\n\n"

    default:
      return node.content ? node.content + "\n" : ""
  }
}

/**
 * Serialize a section (heading + children)
 */
function serializeSection(
  node: KNode,
  children: KNode[],
  ctx: SerializeContext,
): string {
  const depth = (node.data?.depth as number) ?? 1
  const prefix = "#".repeat(depth)
  let md = `${prefix} ${node.content ?? ""}\n\n`

  // Use serializeChildren for proper list grouping
  md += serializeChildren(children, ctx)

  return md
}

/**
 * Serialize an embedding node back to ![[path|alias]] syntax
 */
function serializeEmbedding(node: KNode, ctx: SerializeContext): string {
  if (!node.link_to) {
    // Fallback to content if no link_to
    return (node.content ?? "") + "\n\n"
  }

  // Look up target node to get its path
  const targetNode = ctx.nodeMap.get(node.link_to)
  if (!targetNode) {
    // Target not found - fallback to content
    debug("serializeEmbedding: target not found %s", node.link_to)
    return (node.content ?? "") + "\n\n"
  }

  // Reconstruct the embedding path from target's fs_path
  let path = ""
  if (targetNode.fs_path) {
    // Use filename without .md extension
    const filename = targetNode.fs_path.split("/").pop() ?? ""
    path = filename.replace(/\.md$/, "")
  } else if (targetNode.title) {
    // Use title for sections
    path = targetNode.title
  } else {
    // Fallback to ID
    path = targetNode.id
  }

  // Add alias if present and different from path
  const alias = node.link_alias
  if (alias && alias !== path) {
    return `![[${path}|${alias}]]\n\n`
  }

  return `![[${path}]]\n\n`
}

/**
 * Serialize a blockquote
 */
function serializeQuote(node: KNode): string {
  const content = node.content ?? ""
  const lines = content.split("\n")
  return lines.map((l) => "> " + l).join("\n") + "\n\n"
}

/**
 * Serialize a code block
 */
function serializeCode(node: KNode): string {
  const lang = (node.data?.lang as string) ?? ""
  const meta = (node.data?.meta as string) ?? ""
  const header = lang + (meta ? " " + meta : "")
  return "```" + header + "\n" + (node.content ?? "") + "\n```\n\n"
}

/**
 * Serialize a list item
 */
function serializeListItem(
  node: KNode,
  children: KNode[],
  ctx: SerializeContext,
  indent: number,
  ordered: boolean,
  addTrailingNewline: boolean = true,
): string {
  const indentStr = "  ".repeat(indent)
  const marker = ordered ? "1." : "-"
  let md = `${indentStr}${marker} ${node.content ?? ""}\n`

  // Nested items
  for (const child of children) {
    if (child.type === "ul" || child.type === "ol" || child.type === "task") {
      md += serializeNode(child, ctx, indent + 1)
    }
  }

  // Add trailing newline only at top level when requested
  if (indent === 0 && addTrailingNewline) {
    md += "\n"
  }

  return md
}

/**
 * Derive the checkbox mark from task_status.
 * This ensures edits to task_status are reflected in the serialized output.
 */
function statusToMark(
  status: string | undefined,
  existingMark?: string,
): string {
  switch (status) {
    case "done":
      return "x"
    case "blocked":
      return "!"
    case "dropped":
      return "-"
    case "wip":
      return "/"
    case "todo":
      return " "
    default:
      // If no status, use existing mark or default to space
      return existingMark ?? " "
  }
}

/**
 * Serialize a task item
 */
function serializeTask(
  node: KNode,
  children: KNode[],
  ctx: SerializeContext,
  indent: number,
  addTrailingNewline: boolean = true,
): string {
  const indentStr = "  ".repeat(indent)
  // Derive mark from task_status (which may have been updated)
  // Fall back to task_mark for backwards compatibility
  const mark = statusToMark(node.task_status, node.task_mark)
  let content = node.content ?? ""

  // Add task metadata if not already in content
  const metadata: string[] = []

  if (node.due_date && !content.includes("📅")) {
    metadata.push(`📅 ${node.due_date}`)
  }

  if (node.scheduled_date && !content.includes("⏳")) {
    metadata.push(`⏳ ${node.scheduled_date}`)
  }

  if (node.priority && !content.match(/[⏫🔼🔽]/)) {
    if (node.priority === 1) metadata.push("⏫")
    else if (node.priority === 2) metadata.push("🔼")
    else if (node.priority === 3) metadata.push("🔽")
  }

  if (metadata.length > 0 && content) {
    content += " " + metadata.join(" ")
  }

  let md = `${indentStr}- [${mark}] ${content}\n`

  // Nested items
  for (const child of children) {
    if (child.type === "ul" || child.type === "ol" || child.type === "task") {
      md += serializeNode(child, ctx, indent + 1)
    }
  }

  // Add trailing newline only at top level when requested
  if (indent === 0 && addTrailingNewline) {
    md += "\n"
  }

  return md
}

/**
 * Regenerate a file's markdown from its nodes
 */
export function regenerateFile(fileNodeId: string, allNodes: KNode[]): string {
  // Filter to just this file's nodes
  const fileNodes = getFileSubtree(fileNodeId, allNodes)
  debug("regenerateFile: %s → %d nodes", fileNodeId, fileNodes.length)
  return nodesToMarkdown(fileNodes)
}

/**
 * Get all nodes belonging to a file
 */
function getFileSubtree(fileId: string, allNodes: KNode[]): KNode[] {
  const result: KNode[] = []
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))

  function addWithDescendants(nodeId: string) {
    const node = nodeMap.get(nodeId)
    if (!node) return

    result.push(node)

    // Find children
    for (const n of allNodes) {
      if (n.parent_id === nodeId) {
        addWithDescendants(n.id)
      }
    }
  }

  addWithDescendants(fileId)
  return result
}
