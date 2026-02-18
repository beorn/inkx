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
const ASANA_URL_PATTERNS = [
  /https?:\/\/app\.asana\.com\/0\/\d+\/(\d+)(?:\/f)?/,
  /https?:\/\/app\.asana\.com\/1\/\d+\/task\/(\d+)(?:\?[^\S)]*)?/,
  /https?:\/\/app\.asana\.com\/1\/\d+\/project\/\d+\/task\/(\d+)(?:\?[^\S)]*)?/,
]

function convertAsanaLinks(text: string): string {
  // First pass: convert markdown links [text](asana-url) → [[^GID]]
  // (turndown produces these from <a> tags in html_notes)
  for (const pattern of ASANA_URL_PATTERNS) {
    const mdLinkRe = new RegExp(`\\[([^\\]]*?)\\]\\(${pattern.source}\\)`, "g")
    text = text.replace(mdLinkRe, "[[^$2]]")
  }
  // Second pass: convert bare Asana URLs → [[^GID]]
  for (const pattern of ASANA_URL_PATTERNS) {
    text = text.replace(new RegExp(pattern.source, "g"), "[[^$1]]")
  }
  return text
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

/** Mutable counter scoped to each conversion pass (avoids module-level state) */
type IdxCounter = { value: number }

/** Create a KNode with required fields */
function mkNode(counter: IdxCounter, fields: Partial<KNode> & Pick<KNode, "id" | "type">): KNode {
  return {
    parent_id: null,
    parent_idx: counter.value++,
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
  counter: IdxCounter,
  item: ImportItem,
  parentId: string,
  nodes: KNode[],
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
  currentProject?: string,
  localRendered?: Set<string>,
): void {
  // Within-file dedup: skip entirely if already rendered in this project
  if (localRendered && item.sourceId && localRendered.has(item.sourceId)) {
    return
  }
  // Cross-project dedup: if already rendered in another project, emit embed reference
  if (rendered && primaryMap && item.sourceId && rendered.has(item.sourceId)) {
    const status = toTaskStatus(item.status)
    const marker = status === "done" ? "[x]" : "[ ]"
    nodes.push(
      mkNode(counter, {
        id: `ref-${item.sourceId}`,
        type: "li",
        parent_id: parentId,
        task_marker: marker as TaskMarker,
        task_status: status,
        content: `![[^${item.sourceId}]]`,
      }),
    )
    return
  }
  if (localRendered && item.sourceId) localRendered.add(item.sourceId)
  if (rendered && item.sourceId) rendered.add(item.sourceId)

  const status = toTaskStatus(item.status)

  const metadata: Record<string, string> = {}
  if (item.createdAt) metadata.created = item.createdAt.slice(0, 10)
  if (item.completedAt) metadata.completed = item.completedAt.slice(0, 10)

  const taskNode = mkNode(counter, {
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
      mkNode(counter, {
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
      itemToNodes(counter, child, item.sourceId, nodes, rendered, primaryMap, currentProject, localRendered)
    }
  }
}

/** Convert a section to KNode(s) */
function sectionToNodes(
  counter: IdxCounter,
  section: ImportSection,
  parentId: string,
  nodes: KNode[],
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
  currentProject?: string,
  localRendered?: Set<string>,
): void {
  const sectionId = `section-${section.sourceId}`
  nodes.push(
    mkNode(counter, {
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
    itemToNodes(counter, item, sectionId, nodes, rendered, primaryMap, currentProject, localRendered)
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
  const counter: IdxCounter = { value: 0 }
  const nodes: KNode[] = []
  // Track sourceIds within this project to skip within-file duplicates
  const localRendered = new Set<string>()

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
    mkNode(counter, {
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
      sectionToNodes(counter, section, fileId, nodes, rendered, primaryMap, project.title, localRendered)
    }
  }

  // Loose items
  if (project.items?.length) {
    for (const item of project.items) {
      itemToNodes(counter, item, fileId, nodes, rendered, primaryMap, project.title, localRendered)
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

/**
 * Build the primaryMap (task sourceId → filename) and filename list.
 * Pass 1 of the two-pass convert: lightweight ID scan only.
 */
function buildPrimaryMap(data: ImportData): { primaryMap: Map<string, string>; filenames: string[] } {
  const primaryMap = new Map<string, string>()
  const filenames: string[] = []
  for (const project of data.projects) {
    const slug = slugify(project.title)
    const filename = `${project.sourceId}-${slug}.md`
    filenames.push(filename)
    const ids: string[] = []
    if (project.sections?.length) {
      for (const section of project.sections) collectTaskIds(section.items, ids)
    }
    if (project.items?.length) collectTaskIds(project.items, ids)
    for (const id of ids) {
      if (!primaryMap.has(id)) primaryMap.set(id, filename)
    }
  }
  return { primaryMap, filenames }
}

/** Convert ImportData to a map of relative file paths → markdown content */
export function convert(data: ImportData): FileMap {
  const files: FileMap = new Map()
  for (const [filename, markdown] of convertBatch(data)) {
    files.set(filename, markdown)
  }
  return files
}

/**
 * Streaming convert: yields [filename, markdown] pairs one project at a time.
 * Memory-efficient for large imports — each project's KNode tree is GC'd after yield.
 */
export function* convertBatch(data: ImportData): Generator<[string, string]> {
  const { primaryMap, filenames } = buildPrimaryMap(data)
  const rendered = new Set<string>()

  for (const [i, project] of data.projects.entries()) {
    const filename = filenames[i]
    if (!filename) continue
    const nodes = projectToNodes(project, data.source, data.fetchedAt, rendered, primaryMap)
    const markdown = nodesToMarkdown(nodes)
    yield [filename, markdown]
  }

  // Tag aggregate files: collect items by tag across all projects
  yield* generateTagFiles(data, rendered, primaryMap)
}

/**
 * Generate #tag.md aggregate files: one per tag, containing all tasks with that tag.
 * Only includes tags that appear on 2+ tasks (single-use tags aren't worth aggregating).
 */
function* generateTagFiles(
  data: ImportData,
  rendered: Set<string>,
  primaryMap: Map<string, string>,
): Generator<[string, string]> {
  // Collect items by tag
  const tagItems = new Map<string, ImportItem[]>()
  const collectByTag = (items: ImportItem[]): void => {
    for (const item of items) {
      if (item.tags?.length) {
        for (const tag of item.tags) {
          let list = tagItems.get(tag)
          if (!list) {
            list = []
            tagItems.set(tag, list)
          }
          list.push(item)
        }
      }
      if (item.children?.length) collectByTag(item.children)
    }
  }

  for (const proj of data.projects) {
    for (const item of proj.items ?? []) collectByTag([item])
    for (const sec of proj.sections ?? []) collectByTag(sec.items)
  }

  // Generate a file per tag (only for tags with 2+ unique items)
  for (const [tag, rawItems] of tagItems) {
    // Deduplicate: same task may appear in multiple sections
    const seen = new Set<string>()
    const items = rawItems.filter((item) => {
      if (seen.has(item.sourceId)) return false
      seen.add(item.sourceId)
      return true
    })
    if (items.length < 2) continue
    const counter: IdxCounter = { value: 0 }
    const nodes: KNode[] = []
    const fileId = `tag-${tag}`
    nodes.push(
      mkNode(counter, {
        id: fileId,
        type: "oi",
        fstype: "mdfile",
        content: `#${tag}`,
        data: {
          imported_from: data.source,
          imported_at: data.fetchedAt,
          tag,
          item_count: items.length,
        },
      }),
    )

    for (const item of items) {
      // Use embed reference for items already rendered in project files
      if (rendered.has(item.sourceId)) {
        const status = toTaskStatus(item.status)
        const marker = status === "done" ? "[x]" : "[ ]"
        nodes.push(
          mkNode(counter, {
            id: `tagref-${tag}-${item.sourceId}`,
            type: "li",
            parent_id: fileId,
            task_marker: marker as TaskMarker,
            task_status: status,
            content: `![[^${item.sourceId}]]`,
          }),
        )
      } else {
        itemToNodes(counter, item, fileId, nodes, rendered, primaryMap)
      }
    }

    const markdown = nodesToMarkdown(nodes)
    yield [`#${slugify(tag)}.md`, markdown]
  }
}
