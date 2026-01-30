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

import createDebug from "debug"
import { ulid } from "ulid"

const debug = createDebug("km:markdown:ast2nodes")
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
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    fs_path: fsPath,
    fs_ino: fsIno,
    fs_mtime: fsMtime,
    name,
    content: undefined,
    content_hash: undefined,
    data: frontmatter ? parseFrontmatter(frontmatter) : {},
    created_at: now,
    updated_at: now,
    version: "",
  }
}

/**
 * Merge H1 section properties into the file node
 */
function mergeH1IntoFileNode(fileNode: KNode, h1Section: KNode): void {
  fileNode.title = h1Section.title
  fileNode.content = h1Section.content
  fileNode.md_pos = h1Section.md_pos
  fileNode.md_slug = h1Section.md_slug

  if (h1Section.rules) {
    fileNode.rules = h1Section.rules
  }
  if (h1Section.task_status) {
    fileNode.task_status = h1Section.task_status
  }
  if (h1Section.task_mark) {
    fileNode.task_mark = h1Section.task_mark
  }
  if (h1Section.data) {
    fileNode.data = { ...h1Section.data, ...fileNode.data }
  }
  if (h1Section.title) {
    fileNode.data = { ...fileNode.data, _h1Title: h1Section.title }
  }
}

/**
 * Re-parent children from H1 section to file node
 */
function reparentH1Children(
  childNodes: KNode[],
  h1SectionId: string,
  fileNodeId: string,
): KNode[] {
  const filtered = childNodes.filter((n) => n.id !== h1SectionId)
  for (const child of filtered) {
    if (child.parent_id === h1SectionId) {
      child.parent_id = fileNodeId
    }
  }
  return filtered
}

/**
 * Extract wikilinks from a single node (content and properties)
 */
function extractNodeWikilinks(node: KNode): ExtractedLink[] {
  const links: ExtractedLink[] = []

  if (node.content) {
    for (const link of parseWikiLinks(node.content)) {
      links.push({ nodeId: node.id, link })
    }
  }

  const nodeData = node.data as
    | { props?: Record<string, PropertyValue> }
    | undefined
  if (!nodeData?.props) {
    return links
  }

  for (const [propName, propValue] of Object.entries(nodeData.props)) {
    for (const target of extractLinksFromProperty(propValue)) {
      links.push({
        nodeId: node.id,
        link: { type: "wikiLink", target, embedded: false },
        relationship: propName,
      })
    }
  }

  return links
}

/**
 * Add refs from content to aggregation sets
 */
function addRefsFromContent(
  content: string,
  mentions: Set<string>,
  tags: Set<string>,
  projects: Set<string>,
): void {
  const refs = extractAllRefs(content)
  for (const m of refs.mentions) mentions.add(m)
  for (const t of refs.tags) tags.add(t)
  for (const p of refs.projects) projects.add(p)
}

/**
 * Add refs from node data to aggregation sets
 */
function addRefsFromNodeData(
  nodeData: Record<string, unknown> | undefined,
  mentions: Set<string>,
  tags: Set<string>,
  projects: Set<string>,
): void {
  if (!nodeData) return
  if (nodeData.mentions) {
    for (const m of nodeData.mentions as string[]) mentions.add(m)
  }
  if (nodeData.tags) {
    for (const t of nodeData.tags as string[]) tags.add(t)
  }
  if (nodeData.projects) {
    for (const p of nodeData.projects as string[]) projects.add(p)
  }
}

/**
 * Aggregate refs from all nodes and store in file node data
 */
function aggregateRefsToFileNode(fileNode: KNode, childNodes: KNode[]): void {
  const mentions = new Set<string>()
  const tags = new Set<string>()
  const projects = new Set<string>()

  if (fileNode.content) {
    addRefsFromContent(fileNode.content, mentions, tags, projects)
  }

  for (const node of childNodes) {
    if (node.content) {
      addRefsFromContent(node.content, mentions, tags, projects)
    }
    addRefsFromNodeData(
      node.data as Record<string, unknown> | undefined,
      mentions,
      tags,
      projects,
    )
  }

  const fileData = fileNode.data as Record<string, unknown>
  const existingMentions = (fileData.mentions as string[] | undefined) || []
  const existingTags = (fileData.tags as string[] | undefined) || []
  const existingProjects = (fileData.projects as string[] | undefined) || []

  for (const m of existingMentions) mentions.add(m)
  for (const t of existingTags) tags.add(t)
  for (const p of existingProjects) projects.add(p)

  if (mentions.size > 0) fileData._allMentions = [...mentions]
  if (tags.size > 0) fileData._allTags = [...tags]
  if (projects.size > 0) fileData._allProjects = [...projects]
}

/**
 * Validate H1 headings and generate warnings
 */
function validateH1Headings(
  childNodes: KNode[],
  h1Section: KNode | undefined,
  fsPath: string,
): ParseWarning[] {
  const warnings: ParseWarning[] = []
  const h1Count = childNodes.filter(
    (n) => n.type === "section" && n.data?.depth === 1,
  ).length
  const totalH1s = h1Section ? h1Count + 1 : h1Count

  if (totalH1s === 0) {
    warnings.push({
      type: "missing_h1",
      message: `${fsPath}: Missing H1 heading. Each markdown file should have exactly one # heading as its title.`,
    })
    return warnings
  }

  if (totalH1s > 1) {
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

/**
 * Parse a markdown file into km nodes with wikilink extraction
 */
export function parseMarkdownWithLinks(
  content: string,
  fsPath: string,
  fsIno?: number,
  fsMtime?: number,
): ParseResult {
  debug("parsing %s (%d bytes)", fsPath, content.length)
  const start = Date.now()

  const { frontmatter, body } = extractFrontmatter(content)
  const ast = parseMarkdown(body)
  const now = Date.now()

  const fileNode = createFileNode(fsPath, fsIno, fsMtime, frontmatter, now)
  let childNodes = astToNodes(ast, fileNode, body)

  const h1Section = childNodes.find(
    (n) => n.type === "section" && n.data?.depth === 1,
  )

  if (h1Section) {
    mergeH1IntoFileNode(fileNode, h1Section)
    childNodes = reparentH1Children(childNodes, h1Section.id, fileNode.id)
  }

  const allNodes = [fileNode, ...childNodes]
  const wikilinks = allNodes.flatMap(extractNodeWikilinks)

  aggregateRefsToFileNode(fileNode, childNodes)

  const warnings = validateH1Headings(childNodes, h1Section, fsPath)

  debug("parsed", {
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
