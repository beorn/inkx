/**
 * AST to Nodes Converter - KNode Transformation
 *
 * This module converts parsed markdown (mdast AST) into km's KNode structure.
 * It depends on parser.ts for the parsing utilities and @km/core for types.
 *
 * Responsibility split with parser.ts:
 * - parser.ts: Pure parsing utilities (no KNode dependency, text/AST only)
 * - ast2nodes.ts: KNode-specific transformation (uses parser.ts, creates KNodes)
 *
 * Main entry points:
 * - parseMarkdownToNodes: string → KNode[] (simple, no wikilinks)
 * - parseMarkdownWithLinks: string → { nodes, wikilinks, warnings }
 *
 * Internal helpers:
 * - astToNodes: mdast Root → KNode[] (main conversion loop)
 * - convertListItem: ListItem → KNode[] (handles tasks, nested lists)
 * - convertBlock: Content → KNode (paragraphs, quotes, code, etc.)
 *
 * For the reverse operation (KNodes → markdown), see nodes2md.ts.
 */

import { createConditionalLogger } from "@beorn/logger"
import { ulid } from "ulid"

const log = createConditionalLogger("km:markdown:ast2nodes")
import type { Root, RootContent, Heading, List, ListItem } from "mdast"
import { parse as parseYaml } from "yaml"
import type { KNode, NodeType, TaskStatus, TaskMark } from "@km/core"
import { CUSTOM_TASK_MARKS } from "@km/core"
import {
  parseMarkdown,
  extractFrontmatter,
  extractTaskMark,
  extractTitleTaskMark,
  nodeToText,
  listItemToText,
  slugify,
  parseTaskMetadata,
  extractAllRefs,
  parseWikiLinks,
  parseHeadingRules,
  parseInlineProperties,
} from "./parser.ts"
import type { WikiLink, PropertyValue } from "./parser.ts"

/**
 * Parse warning for structural issues
 */
export interface ParseWarning {
  type: "missing_h1" | "multiple_h1"
  message: string
  line?: number
}

/**
 * Extracted link with optional relationship (for property-based links)
 */
export interface ExtractedLink {
  nodeId: string
  link: WikiLink
  /** Property name for property-based links (e.g., "blocked-by"), undefined for content wikilinks */
  relationship?: string
}

/**
 * Result of parsing markdown with wikilinks
 */
export interface ParseResult {
  nodes: KNode[]
  wikilinks: ExtractedLink[]
  warnings: ParseWarning[]
}

/**
 * Extract link targets from a PropertyValue
 * Handles single links and lists of links
 */
function extractLinksFromProperty(propValue: PropertyValue): string[] {
  if (propValue.type === "link") {
    return [propValue.target]
  }
  if (propValue.type === "list") {
    const targets: string[] = []
    for (const item of propValue.values) {
      if (item.type === "link") {
        targets.push(item.target)
      }
    }
    return targets
  }
  return []
}

/**
 * Parse a markdown file into km nodes
 */
export function parseMarkdownToNodes(
  content: string,
  fsPath: string,
  fsIno?: number,
): KNode[] {
  return parseMarkdownWithLinks(content, fsPath, fsIno).nodes
}

/**
 * Parse a markdown file into km nodes with wikilink extraction
 */
export function parseMarkdownWithLinks(
  content: string,
  fsPath: string,
  fsIno?: number,
  fsMtime?: number,
): ParseResult {
  const start = Date.now()

  const { frontmatter, body } = extractFrontmatter(content)
  const ast = parseMarkdown(body)
  const now = Date.now()

  const fileNode = createFileNode(fsPath, fsIno, fsMtime, frontmatter, now)
  let childNodes = astToNodes(ast, fileNode, body)

  const { childNodes: filteredChildren, hadH1 } = mergeH1IntoFileNode(
    fileNode,
    childNodes,
  )
  childNodes = filteredChildren

  const allNodes = [fileNode, ...childNodes]
  const wikilinks = extractWikilinksFromNodes(allNodes)
  aggregateRefs(fileNode, childNodes)
  const warnings = validateH1Count(childNodes, fsPath, hadH1)

  log.debug?.("parsed", {
    fsPath,
    nodes: allNodes.length,
    wikilinks: wikilinks.length,
    warnings: warnings.length,
    ms: Date.now() - start,
  })

  return { nodes: allNodes, wikilinks, warnings }
}

/**
 * Parse YAML frontmatter into data object
 */
function parseFrontmatter(yaml: string): Record<string, unknown> {
  try {
    const data = parseYaml(yaml) as Record<string, unknown>
    return data ?? {}
  } catch {
    return {}
  }
}

/**
 * Convert AST children to km nodes
 */
// oxlint-disable-next-line complexity/max-cognitive -- Recursive AST conversion with many node types
function astToNodes(ast: Root, fileNode: KNode, sourceText: string): KNode[] {
  const nodes: KNode[] = []
  const sectionStack: Array<{ depth: number; node: KNode }> = []
  let currentParent = fileNode
  let sortOrder = 0
  const now = Date.now()

  for (const child of ast.children) {
    // Handle headings - create section hierarchy
    if (child.type === "heading") {
      const heading = child as Heading

      // Pop stack until we find a shallower heading
      while (sectionStack.length > 0) {
        const top = sectionStack[sectionStack.length - 1]
        if (top && top.depth >= heading.depth) {
          sectionStack.pop()
        } else {
          break
        }
      }

      const text = nodeToText(heading)
      const { title: titleWithRules, rules } = parseHeadingRules(text)
      const { mark: taskMark, cleanText: title } =
        extractTitleTaskMark(titleWithRules)
      const hasRules = Object.keys(rules).length > 0
      const sectionName = slugify(title)

      // Determine task status from mark (same logic as list items)
      let taskStatus: TaskStatus | undefined
      if (taskMark !== undefined) {
        switch (taskMark) {
          case "x":
          case "X":
            taskStatus = "done"
            break
          case "!":
            taskStatus = "blocked"
            break
          case "-":
            taskStatus = "dropped"
            break
          case "/":
            taskStatus = "wip"
            break
          case " ":
          default:
            taskStatus = "todo"
        }
      }

      const parentSection = sectionStack[sectionStack.length - 1]
      const sectionNode: KNode = {
        id: ulid(),
        type: "section",
        parent_id: parentSection ? parentSection.node.id : fileNode.id,
        parent_idx: sortOrder++,
        link_to: null,
        name: sectionName, // Slug/identifier derived from heading
        md_pos: heading.position?.start.offset,
        md_slug: sectionName, // Keep for backwards compatibility
        content: text, // Keep original content for serialization
        content_hash: undefined,
        title, // Clean title without rules and task mark
        rules: hasRules ? rules : undefined, // Only set if rules exist
        task_status: taskStatus,
        task_mark: taskMark as TaskMark,
        data: {
          depth: heading.depth,
          ...(hasRules ? { rules, title } : {}), // Store rules and clean title in data for DB persistence
        },
        created_at: now,
        updated_at: now,
        version: "",
      }

      nodes.push(sectionNode)
      sectionStack.push({ depth: heading.depth, node: sectionNode })
      currentParent = sectionNode
      continue
    }

    // Handle lists - create list items/tasks
    if (child.type === "list") {
      const list = child as List

      for (const item of list.children) {
        const listItem = item as ListItem
        const itemNodes = convertListItem(
          listItem,
          currentParent,
          list.ordered ?? false,
          sortOrder++,
          sourceText,
        )
        nodes.push(...itemNodes)
      }
      continue
    }

    // Handle other block types
    const blockNode = convertBlock(child, currentParent, sortOrder++)
    if (blockNode) {
      nodes.push(blockNode)
    }
  }

  return nodes
}

/**
 * Convert a list item to nodes (may include nested items)
 */
function convertListItem(
  item: ListItem,
  parent: KNode,
  ordered: boolean,
  sortOrder: number,
  sourceText: string,
): KNode[] {
  const nodes: KNode[] = []
  const now = Date.now()

  let text = listItemToText(item)
  // Convert position to the expected format for extractTaskMark
  const position =
    item.position?.start.offset !== undefined
      ? { start: { offset: item.position.start.offset } }
      : undefined
  const taskMark = extractTaskMark(sourceText, position)

  // A task is either:
  // 1. A GFM task list item (item.checked is boolean) - [ ] or [x]
  // 2. A list item with a custom task mark - [/], [-], [!]
  const isGfmTask = item.checked !== null && item.checked !== undefined
  const isCustomTask =
    taskMark && (CUSTOM_TASK_MARKS as readonly string[]).includes(taskMark)
  const isTask = isGfmTask || isCustomTask

  // For custom task marks, mdast includes the mark in the text (e.g., "[/] task content")
  // Strip it to get the clean content
  if (isCustomTask && !isGfmTask) {
    text = text.replace(/^\[.\]\s*/, "")
  }

  // Determine task status from mark
  let taskStatus: TaskStatus | undefined
  if (isTask) {
    switch (taskMark) {
      case "x":
      case "X":
        taskStatus = "done"
        break
      case "!":
        taskStatus = "blocked"
        break
      case "-":
        taskStatus = "dropped"
        break
      case "/":
        taskStatus = "wip"
        break
      default:
        taskStatus = "todo"
    }
  }

  // Parse task metadata from text
  const metadata = isTask ? parseTaskMetadata(text) : {}
  // km-load-perf.1: Single-pass extraction for refs
  const { tags, mentions, projects } = extractAllRefs(text)
  const parsedProps = parseInlineProperties(text)

  // Priority from metadata only
  const priority: number | undefined = metadata.priority

  const node: KNode = {
    id: ulid(),
    type: isTask ? "task" : ordered ? "ol" : "ul",
    parent_id: parent.id,
    parent_idx: sortOrder,
    link_to: null,
    md_pos: item.position?.start.offset,
    md_line: item.position?.start.line
      ? item.position.start.line - 1
      : undefined, // Convert 1-indexed to 0-indexed
    content: text,
    content_hash: undefined,
    task_status: taskStatus,
    task_mark: taskMark as KNode["task_mark"],
    due_date: metadata.dueDate,
    scheduled_date: metadata.scheduledDate,
    priority,
    data: {
      ...(tags.length > 0 ? { tags } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(projects.length > 0 ? { projects } : {}),
      ...(metadata.recurrence ? { recurrence: metadata.recurrence } : {}),
      ...(Object.keys(parsedProps.props).length > 0
        ? { props: parsedProps.props }
        : {}),
      ...(Object.keys(parsedProps.propsRaw).length > 0
        ? { propsRaw: parsedProps.propsRaw }
        : {}),
    },
    created_at: now,
    updated_at: now,
    version: "",
  }

  nodes.push(node)

  // Handle nested lists
  for (const child of item.children) {
    if (child.type === "list") {
      const list = child as List
      let nestedSort = 0

      for (const nestedItem of list.children) {
        const nestedNodes = convertListItem(
          nestedItem,
          node,
          list.ordered ?? false,
          nestedSort++,
          sourceText,
        )
        nodes.push(...nestedNodes)
      }
    }
  }

  return nodes
}

/**
 * Check if text is purely an embedding (nothing but ![[...]])
 * Returns the embedding text if so, null otherwise
 *
 * TODO: Used in Phase 2 of km-xexz for target resolution
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getEmbeddingText(text: string): string | null {
  const trimmed = text.trim()
  // Match ![[...]] with optional section/blockId/alias
  const match = trimmed.match(
    /^!\[\[([^\]|#^]+)(?:#([^\]|^]+))?(?:\^([^\]|]+))?(?:\|([^\]]+))?\]\]$/,
  )
  return match ? trimmed : null
}

/**
 * Convert a block element to a node
 */
function convertBlock(
  block: RootContent,
  parent: KNode,
  sortOrder: number,
): KNode | null {
  const now = Date.now()

  let type: NodeType
  let content: string | null = null
  const data: Record<string, unknown> = {}

  switch (block.type) {
    case "paragraph": {
      type = "paragraph"
      content = nodeToText(block)
      // TODO: When embedding detected (getEmbeddingText), resolve target and set link_to
      // This requires Phase 2 of km-xexz (target resolution)
      break
    }

    case "blockquote":
      type = "quote"
      content = nodeToText(block)
      break

    case "code":
      type = "code"
      content = block.value
      if (block.lang) {
        data.lang = block.lang
      }
      if (block.meta) {
        data.meta = block.meta
      }
      break

    case "thematicBreak":
      type = "hr"
      break

    case "table":
      type = "table"
      content = nodeToText(block)
      break

    case "html":
      type = "html"
      content = block.value
      break

    default:
      // Skip unknown types
      return null
  }

  return {
    id: ulid(),
    type,
    parent_id: parent.id,
    parent_idx: sortOrder,
    link_to: null,
    md_pos: block.position?.start.offset,
    content: content ?? undefined,
    content_hash: undefined,
    data,
    created_at: now,
    updated_at: now,
    version: "",
  }
}

/**
 * Build a tree structure from flat nodes
 */
export function buildNodeTree(nodes: KNode[]): Map<string, KNode[]> {
  const tree = new Map<string, KNode[]>()

  for (const node of nodes) {
    const parentId = node.parent_id ?? "__root__"
    if (!tree.has(parentId)) {
      tree.set(parentId, [])
    }
    tree.get(parentId)?.push(node)
  }

  // Sort children by parent_idx
  for (const children of tree.values()) {
    children.sort((a, b) => a.parent_idx - b.parent_idx)
  }

  return tree
}

// ---------------------------------------------------------------------------
// Helpers for parseMarkdownWithLinks (extracted to reduce cognitive complexity)
// ---------------------------------------------------------------------------

/**
 * Create the initial file node from filesystem path and frontmatter
 */
function createFileNode(
  fsPath: string,
  fsIno: number | undefined,
  fsMtime: number | undefined,
  frontmatter: string | null,
  now: number,
): KNode {
  const filename = fsPath.split("/").pop() || ""
  const name = filename.replace(/\.md$/i, "")

  return {
    id: ulid(),
    type: "file",
    parent_id: null, // Will be set based on folder structure
    parent_idx: 0,
    link_to: null,
    fs_path: fsPath,
    fs_ino: fsIno,
    fs_mtime: fsMtime,
    name, // Slug/identifier derived from filename
    content: undefined,
    content_hash: undefined,
    data: frontmatter ? parseFrontmatter(frontmatter) : {},
    created_at: now,
    updated_at: now,
    version: "",
  }
}

/**
 * Merge H1 section into file node (file + H1 = one conceptual node).
 * The H1 title becomes the file's title, and H1's children become file's children.
 * Returns filtered childNodes (H1 removed) and whether an H1 was found.
 */
function mergeH1IntoFileNode(
  fileNode: KNode,
  childNodes: KNode[],
): { childNodes: KNode[]; hadH1: boolean } {
  const h1Section = childNodes.find(
    (n) => n.type === "section" && n.data?.depth === 1,
  )

  if (!h1Section) {
    return { childNodes, hadH1: false }
  }

  // Copy H1 properties to file node
  fileNode.title = h1Section.title
  fileNode.content = h1Section.content
  fileNode.md_pos = h1Section.md_pos
  fileNode.md_slug = h1Section.md_slug
  if (h1Section.rules) {
    fileNode.rules = h1Section.rules
  }
  // Copy task properties from H1 (if present)
  if (h1Section.task_status) {
    fileNode.task_status = h1Section.task_status
  }
  if (h1Section.task_mark) {
    fileNode.task_mark = h1Section.task_mark
  }
  // Merge H1's data into file data, but frontmatter takes precedence
  // (frontmatter fields overwrite H1 data fields)
  if (h1Section.data) {
    fileNode.data = { ...h1Section.data, ...fileNode.data }
  }
  // Store H1 title in data for DB persistence (using _h1Title to avoid collision with frontmatter title)
  if (h1Section.title) {
    fileNode.data = { ...fileNode.data, _h1Title: h1Section.title }
  }

  // Re-parent H1's children to the file node
  const filtered = childNodes.filter((n) => n.id !== h1Section.id)
  for (const child of filtered) {
    if (child.parent_id === h1Section.id) {
      child.parent_id = fileNode.id
    }
  }

  return { childNodes: filtered, hadH1: true }
}

/**
 * Extract wikilinks from all nodes (both inline content and property-based links)
 */
function extractWikilinksFromNodes(allNodes: KNode[]): ExtractedLink[] {
  const wikilinks: ExtractedLink[] = []

  for (const node of allNodes) {
    // Extract wikilinks from content
    if (node.content) {
      const links = parseWikiLinks(node.content)
      for (const link of links) {
        wikilinks.push({ nodeId: node.id, link })
      }
    }

    // Extract links from properties (e.g., blocked-by:: [[target]])
    const nodeData = node.data as
      | { props?: Record<string, PropertyValue> }
      | undefined
    if (nodeData?.props) {
      for (const [propName, propValue] of Object.entries(nodeData.props)) {
        const propLinks = extractLinksFromProperty(propValue)
        for (const target of propLinks) {
          wikilinks.push({
            nodeId: node.id,
            link: { type: "wikiLink", target, embedded: false },
            relationship: propName,
          })
        }
      }
    }
  }

  return wikilinks
}

/**
 * Aggregate mentions, tags, projects from all nodes to file node's data.
 * This enables queries like @issue to find files where any content has that mention.
 * Mutates fileNode.data to add _allMentions, _allTags, _allProjects.
 */
// oxlint-disable-next-line complexity/max-cognitive -- Nested iteration over nodes/refs is inherent to aggregation
function aggregateRefs(fileNode: KNode, childNodes: KNode[]): void {
  const aggregatedMentions = new Set<string>()
  const aggregatedTags = new Set<string>()
  const aggregatedProjects = new Set<string>()

  // km-load-perf.1: Use single-pass extraction for all refs
  // Include file node's own content (e.g., H1 heading with @issue #feature)
  if (fileNode.content) {
    const refs = extractAllRefs(fileNode.content)
    for (const m of refs.mentions) aggregatedMentions.add(m)
    for (const t of refs.tags) aggregatedTags.add(t)
    for (const p of refs.projects) aggregatedProjects.add(p)
  }

  for (const node of childNodes) {
    if (node.content) {
      // Single-pass extraction instead of 3 separate passes
      const refs = extractAllRefs(node.content)
      for (const m of refs.mentions) aggregatedMentions.add(m)
      for (const t of refs.tags) aggregatedTags.add(t)
      for (const p of refs.projects) aggregatedProjects.add(p)
    }
    // Also include from node's own data (for list items that already extracted these)
    const nodeData = node.data as Record<string, unknown> | undefined
    if (nodeData?.mentions) {
      for (const m of nodeData.mentions as string[]) aggregatedMentions.add(m)
    }
    if (nodeData?.tags) {
      for (const t of nodeData.tags as string[]) aggregatedTags.add(t)
    }
    if (nodeData?.projects) {
      for (const p of nodeData.projects as string[]) aggregatedProjects.add(p)
    }
  }

  // Store aggregated refs in separate fields to preserve original frontmatter
  // Original frontmatter values stay in data.tags/mentions/projects
  // Aggregated values (content + frontmatter) go in data._allTags/_allMentions/_allProjects
  const fileData = fileNode.data as Record<string, unknown>
  const existingMentions = (fileData.mentions as string[] | undefined) || []
  const existingTags = (fileData.tags as string[] | undefined) || []
  const existingProjects = (fileData.projects as string[] | undefined) || []

  // Add original frontmatter values to aggregation
  for (const m of existingMentions) aggregatedMentions.add(m)
  for (const t of existingTags) aggregatedTags.add(t)
  for (const p of existingProjects) aggregatedProjects.add(p)

  // Store aggregated values in separate fields (for queries)
  // Original frontmatter values (data.tags etc.) are preserved for serialization
  if (aggregatedMentions.size > 0) {
    fileData._allMentions = [...aggregatedMentions]
  }
  if (aggregatedTags.size > 0) {
    fileData._allTags = [...aggregatedTags]
  }
  if (aggregatedProjects.size > 0) {
    fileData._allProjects = [...aggregatedProjects]
  }
}

/**
 * Validate that the file has exactly one H1 heading.
 * Returns warnings for missing or multiple H1s.
 */
function validateH1Count(
  childNodes: KNode[],
  fsPath: string,
  hadH1: boolean,
): ParseWarning[] {
  const warnings: ParseWarning[] = []
  const h1Count = childNodes.filter(
    (n) => n.type === "section" && n.data?.depth === 1,
  ).length
  // Add 1 for the merged H1 if it existed
  const totalH1s = hadH1 ? h1Count + 1 : h1Count

  if (totalH1s === 0) {
    warnings.push({
      type: "missing_h1",
      message: `${fsPath}: Missing H1 heading. Each markdown file should have exactly one # heading as its title.`,
    })
  } else if (totalH1s > 1) {
    // Find the second H1 for line number
    const secondH1 = childNodes.find(
      (n) => n.type === "section" && n.data?.depth === 1,
    )
    warnings.push({
      type: "multiple_h1",
      message: `${fsPath}: Multiple H1 headings found (${totalH1s}). Each markdown file should have exactly one # heading.`,
      line: secondH1?.md_line,
    })
  }

  return warnings
}
