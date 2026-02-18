/**
 * Import Pipeline — Stage 2: Convert
 *
 * Converts ImportData → FileMap (slug → markdown content).
 * Builds KNode trees (typed intermediate) and serializes via nodesToMarkdown().
 */

import type { KNode, TaskMarker, TaskStatus } from "@km/core"
import { getMarkerForStatus } from "@km/core"
import { nodesToMarkdown } from "@km/markdown"
import type { ImportData, ImportItem, ImportProject, ImportSection, FileMap } from "./types.ts"
import { filterSystemComment } from "./adapters/comment-filter.ts"

/** Slugify a title for use as filename */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Convert Asana task/project URLs to km block references.
 * Since each task has ^GID as its block ID, links become [[^GID]].
 */
function convertAsanaLinks(text: string): string {
  return text
    .replace(/https?:\/\/app\.asana\.com\/0\/\d+\/(\d+)(?:\/f)?/g, "[[^$1]]")
    .replace(/https?:\/\/app\.asana\.com\/1\/\d+\/task\/(\d+)(?:\?[^\s)]*)?/g, "[[^$1]]")
    .replace(/https?:\/\/app\.asana\.com\/1\/\d+\/project\/\d+\/task\/(\d+)(?:\?[^\s)]*)?/g, "[[^$1]]")
}

// =============================================================================
// ImportItem → KNode conversion
// =============================================================================

/** Map import status to km TaskStatus */
function toTaskStatus(status?: string): TaskStatus {
  switch (status) {
    case "done":
      return "done"
    case "wip":
      return "doing"
    case "blocked":
      return "blocked"
    case "dropped":
      return "dropped"
    default:
      return "todo"
  }
}

let _nextIdx = 0

/** Create a KNode with required fields */
function mkNode(fields: Partial<KNode> & Pick<KNode, "id" | "type">): KNode {
  return {
    parent_id: null,
    parent_idx: _nextIdx++,
    link_to: null,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "",
    ...fields,
  }
}

/**
 * Build the content string for a task node.
 * Title + @assignee + #tags + +projects are inline text.
 * Metadata (created::, completed::) is set on data.metadata — the serializer handles formatting.
 */
function buildTaskContent(item: ImportItem, currentProject?: string): string {
  const title = item.milestone ? `◆ ${item.title}` : item.title
  const parts: string[] = [title]
  if (item.assignee) parts.push(`@${item.assignee}`)
  if (item.tags?.length) parts.push(...item.tags.map((t) => `#${t}`))
  if (item.projects && item.projects.length > 1) {
    const otherProjects = currentProject
      ? item.projects.filter((p) => slugify(p) !== slugify(currentProject))
      : item.projects
    if (otherProjects.length > 0) {
      parts.push(...otherProjects.map((p) => `+${slugify(p)}`))
    }
  }
  return parts.join(" ")
}

/** Build blockquote content for body, attachments, and comments */
function buildBlockquoteContent(item: ImportItem): string | null {
  const lines: string[] = []

  if (item.body) {
    for (const line of convertAsanaLinks(item.body.trim()).split("\n")) {
      lines.push(line)
    }
  }

  if (item.attachments?.length) {
    if (lines.length) lines.push("")
    for (const att of item.attachments) {
      const href = att.localPath ?? att.url
      lines.push(att.type === "image" ? `![${att.name}](${href})` : `[${att.name}](${href})`)
    }
  }

  if (item.comments?.length) {
    const filtered = item.comments
      .map((c) => ({ ...c, text: filterSystemComment(c.text, c.createdAt) }))
      .filter((c) => c.text.trim())
    if (filtered.length) {
      if (lines.length) lines.push("")
      lines.push("**Comments:**")
      for (const c of filtered) {
        const date = c.createdAt.slice(0, 10)
        const author = c.author ? `@${c.author}` : ""
        const [firstLine, ...rest] = c.text.split("\n")
        lines.push(`- ${date} ${author}: ${firstLine}`)
        for (const line of rest) {
          lines.push(`  ${line}`)
        }
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") : null
}

/** Convert an ImportItem to KNode(s) and append to the nodes array */
function itemToNodes(
  item: ImportItem,
  parentId: string,
  nodes: KNode[],
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
  currentProject?: string,
): void {
  // Multi-project dedup: if already rendered, emit compact reference
  if (rendered && primaryMap && item.sourceId && rendered.has(item.sourceId)) {
    const status = toTaskStatus(item.status)
    const marker = status === "done" ? "[x]" : "[ ]"
    nodes.push(
      mkNode({
        id: `ref-${item.sourceId}`,
        type: "li",
        parent_id: parentId,
        task_marker: marker as TaskMarker,
        task_status: status,
        content: `${item.title} → [[^${item.sourceId}]]`,
      }),
    )
    return
  }
  if (rendered && item.sourceId) rendered.add(item.sourceId)

  const status = toTaskStatus(item.status)

  const metadata: Record<string, string> = {}
  if (item.createdAt) metadata.created = item.createdAt.slice(0, 10)
  if (item.completedAt) metadata.completed = item.completedAt.slice(0, 10)

  const taskNode = mkNode({
    id: item.sourceId,
    type: "li",
    parent_id: parentId,
    task_marker: getMarkerForStatus(status),
    task_status: status,
    content: buildTaskContent(item, currentProject),
    block_id: item.sourceId,
    assigned_to: item.assignee,
    due_at: item.dueAt?.slice(0, 10),
    start_at: item.startAt?.slice(0, 10),
    priority: item.priority,
    created_at: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
    updated_at: item.modifiedAt ? new Date(item.modifiedAt).getTime() : Date.now(),
    ...(Object.keys(metadata).length > 0 && { data: { metadata } }),
  })
  nodes.push(taskNode)

  // Body/attachments/comments as a blockquote child node
  const bqContent = buildBlockquoteContent(item)
  if (bqContent) {
    nodes.push(
      mkNode({
        id: `bq-${item.sourceId}`,
        type: "quote",
        parent_id: item.sourceId,
        content: bqContent,
      }),
    )
  }

  // Recursive children (subtasks)
  if (item.children?.length) {
    for (const child of item.children) {
      itemToNodes(child, item.sourceId, nodes, rendered, primaryMap, currentProject)
    }
  }
}

/** Convert a section to KNode(s) */
function sectionToNodes(
  section: ImportSection,
  parentId: string,
  nodes: KNode[],
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
  currentProject?: string,
): void {
  const sectionId = `section-${section.sourceId}`
  nodes.push(
    mkNode({
      id: sectionId,
      type: "oi",
      parent_id: parentId,
      fstype: "mdsection",
      content: section.title,
      title: section.title,
      data: { depth: 2 },
    }),
  )

  for (const item of section.items) {
    itemToNodes(item, sectionId, nodes, rendered, primaryMap, currentProject)
  }
}

/** Convert a project to a KNode tree (file + sections + items) */
function projectToNodes(
  project: ImportProject,
  source: string,
  fetchedAt: string,
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
): KNode[] {
  _nextIdx = 0
  const nodes: KNode[] = []

  // File root node — data becomes frontmatter, content becomes H1
  const fileId = `file-${project.sourceId}`
  const frontmatter: Record<string, unknown> = {
    imported_from: source,
    imported_at: fetchedAt,
    [`${source}_project_id`]: project.sourceId,
  }
  if (project.workspace) frontmatter.workspace = project.workspace
  if (project.owner) frontmatter.owner = project.owner
  if (project.team) frontmatter.team = project.team
  if (project.createdAt) frontmatter.created_at = project.createdAt
  if (project.modifiedAt) frontmatter.modified_at = project.modifiedAt

  nodes.push(
    mkNode({
      id: fileId,
      type: "oi",
      fstype: "mdfile",
      content: project.title,
      data: frontmatter,
    }),
  )

  // Sections
  if (project.sections?.length) {
    for (const section of project.sections) {
      sectionToNodes(section, fileId, nodes, rendered, primaryMap, project.title)
    }
  }

  // Loose items
  if (project.items?.length) {
    for (const item of project.items) {
      itemToNodes(item, fileId, nodes, rendered, primaryMap, project.title)
    }
  }

  return nodes
}

// =============================================================================
// Public API
// =============================================================================

/** Collect all task sourceIds from a project, recursively including children */
function collectTaskIds(items: ImportItem[], out: string[]): void {
  for (const item of items) {
    if (item.sourceId) out.push(item.sourceId)
    if (item.children?.length) collectTaskIds(item.children, out)
  }
}

/** Export for testing: convert a single ImportItem to KNode */
export { itemToNodes, buildTaskContent, buildBlockquoteContent }

/** Convert ImportData to a map of relative file paths → markdown content */
export function convert(data: ImportData): FileMap {
  const files: FileMap = new Map()

  // Build primaryMap: task sourceId → filename of the first project that contains it
  const primaryMap = new Map<string, string>()
  const projectFilenames: string[] = []
  for (const project of data.projects) {
    const slug = slugify(project.title)
    const filename = `${project.sourceId}-${slug}.md`
    projectFilenames.push(filename)
    const ids: string[] = []
    if (project.sections?.length) {
      for (const section of project.sections) collectTaskIds(section.items, ids)
    }
    if (project.items?.length) collectTaskIds(project.items, ids)
    for (const id of ids) {
      if (!primaryMap.has(id)) primaryMap.set(id, filename)
    }
  }

  // Convert projects with dedup: first occurrence gets full content, rest get reference
  const rendered = new Set<string>()
  for (const [i, project] of data.projects.entries()) {
    const filename = projectFilenames[i]
    if (!filename) continue
    const nodes = projectToNodes(project, data.source, data.fetchedAt, rendered, primaryMap)
    const markdown = nodesToMarkdown(nodes)
    files.set(filename, markdown)
  }

  return files
}
