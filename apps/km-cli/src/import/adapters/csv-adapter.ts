/**
 * CSV Import Adapter
 *
 * Parses CSV/TSV files into ImportData. Columns become node properties.
 *
 * Expected columns (case-insensitive, all optional except title):
 *   title (or name, task)  — Task title (REQUIRED)
 *   status                 — todo, done, wip, blocked, dropped
 *   body (or description, notes) — Task body text
 *   assignee               — @mention name
 *   due (or due_date)      — Due date (ISO 8601 or YYYY-MM-DD)
 *   start (or start_date)  — Start date
 *   priority               — Free-form string (e.g., P1, high, A)
 *   tags                   — Comma-separated tags
 *   project (or section)   — Groups tasks into sections
 *   parent                 — Parent task title (for hierarchy)
 *   id (or source_id)      — Unique identifier
 *
 * If no "project" column exists, all tasks go into a single project.
 * The filename (without extension) is used as the project title.
 */

import { readFileSync } from "fs"
import { basename, extname } from "path"
import type { ImportAdapter, AdapterParseOptions } from "../adapter.ts"
import type { ImportData, ImportItem, ImportProject, ImportSection } from "../types.ts"

// =============================================================================
// CSV Parser (minimal, handles quoting)
// =============================================================================

/** Parse a CSV string into rows of string arrays */
export function parseCSV(text: string, delimiter = ","): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? ""
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++ // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delimiter) {
        row.push(cell)
        cell = ""
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(cell)
        cell = ""
        if (row.some((c) => c.trim())) rows.push(row)
        row = []
        if (ch === "\r") i++ // skip \n after \r
      } else {
        cell += ch
      }
    }
  }
  // Last cell/row
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)

  return rows
}

/** Detect delimiter: tab if any tabs in first line, else comma */
function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] ?? ""
  return firstLine.includes("\t") ? "\t" : ","
}

// =============================================================================
// Column mapping
// =============================================================================

type ColumnRole =
  | "title"
  | "status"
  | "body"
  | "assignee"
  | "due"
  | "start"
  | "priority"
  | "tags"
  | "project"
  | "parent"
  | "id"

const COLUMN_ALIASES: Record<string, ColumnRole> = {
  title: "title",
  name: "title",
  task: "title",
  subject: "title",
  status: "status",
  state: "status",
  body: "body",
  description: "body",
  notes: "body",
  content: "body",
  assignee: "assignee",
  assigned: "assignee",
  owner: "assignee",
  due: "due",
  due_date: "due",
  "due date": "due",
  deadline: "due",
  start: "start",
  start_date: "start",
  "start date": "start",
  priority: "priority",
  tags: "tags",
  labels: "tags",
  project: "project",
  section: "project",
  group: "project",
  category: "project",
  list: "project",
  parent: "parent",
  id: "id",
  source_id: "id",
  sourceid: "id",
}

function mapColumns(headers: string[]): Map<number, ColumnRole> {
  const mapping = new Map<number, ColumnRole>()
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    if (!header) continue
    const normalized = header
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, "_")
    // Also try without underscores for "due date" → "duedate" style
    const noUnderscore = normalized.replace(/_/g, "")
    const role = COLUMN_ALIASES[normalized] ?? COLUMN_ALIASES[noUnderscore]
    if (role) mapping.set(i, role)
  }
  return mapping
}

// =============================================================================
// Status normalization
// =============================================================================

const STATUS_MAP: Record<string, ImportItem["status"]> = {
  todo: "todo",
  "to do": "todo",
  "to-do": "todo",
  open: "todo",
  pending: "todo",
  new: "todo",
  backlog: "todo",
  done: "done",
  complete: "done",
  completed: "done",
  closed: "done",
  resolved: "done",
  finished: "done",
  wip: "wip",
  "in progress": "wip",
  "in-progress": "wip",
  doing: "wip",
  active: "wip",
  started: "wip",
  blocked: "blocked",
  dropped: "dropped",
  cancelled: "dropped",
  canceled: "dropped",
  abandoned: "dropped",
  "won't fix": "dropped",
  wontfix: "dropped",
}

function normalizeStatus(raw: string): ImportItem["status"] | undefined {
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return undefined
  return STATUS_MAP[normalized]
}

// =============================================================================
// CSV → ImportData
// =============================================================================

function csvRowToItem(row: string[], columns: Map<number, ColumnRole>, counter: { value: number }): ImportItem | null {
  // Build role→value map once per row instead of scanning columns per field
  const roleValues = new Map<ColumnRole, string | undefined>()
  for (const [idx, role] of columns) roleValues.set(role, row[idx]?.trim())
  const get = (role: ColumnRole): string | undefined => roleValues.get(role)

  const title = get("title")
  if (!title) return null

  const idRaw = get("id")
  const item: ImportItem = {
    sourceId: idRaw || `csv-${++counter.value}`,
    title,
  }

  const status = get("status")
  if (status) item.status = normalizeStatus(status)

  const body = get("body")
  if (body) item.body = body

  const assignee = get("assignee")
  if (assignee) item.assignee = assignee.replace(/^@/, "").replace(/\s+/g, "-").toLowerCase()

  const due = get("due")
  if (due) item.dueAt = due.trim()

  const start = get("start")
  if (start) item.startAt = start.trim()

  const priority = get("priority")?.trim()
  if (priority) {
    item.priority = priority
  }

  const tags = get("tags")
  if (tags) {
    item.tags = tags
      .split(",")
      .map((t) => t.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase())
      .filter(Boolean)
    if (item.tags.length === 0) delete item.tags
  }

  return item
}

// oxlint-disable-next-line complexity/complexity -- CSV header detection + per-column mapping: separate branches for each detected column kind (id, title, status, priority, due, assignee, notes, tags, parent) plus fallback heuristics — flat dispatch, splitting would duplicate detection state
export function parseCSVToImportData(text: string, filename?: string): ImportData {
  const nextId = { value: 0 }

  const delimiter = detectDelimiter(text)
  const rows = parseCSV(text, delimiter)

  if (rows.length === 0) {
    return {
      source: "csv",
      fetchedAt: new Date().toISOString(),
      projects: [],
    }
  }

  const headers = rows[0]
  if (!headers) {
    return {
      source: "csv",
      fetchedAt: new Date().toISOString(),
      projects: [],
    }
  }
  const columns = mapColumns(headers)

  // Check for required title column
  const hasTitleCol = [...columns.values()].includes("title")
  if (!hasTitleCol) {
    throw new Error(
      `CSV has no title column. Expected one of: title, name, task, subject. Found: ${headers.join(", ")}`,
    )
  }

  const hasProjectCol = [...columns.values()].includes("project")
  const hasParentCol = [...columns.values()].includes("parent")

  // Parse all items
  const items: Array<{ item: ImportItem; project?: string; parent?: string }> = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const item = csvRowToItem(row, columns, nextId)
    if (!item) continue

    // Extract project/section grouping
    let project: string | undefined
    if (hasProjectCol) {
      for (const [idx, role] of columns) {
        if (role === "project") {
          project = row[idx]?.trim()
          break
        }
      }
    }

    // Extract parent for hierarchy
    let parent: string | undefined
    if (hasParentCol) {
      for (const [idx, role] of columns) {
        if (role === "parent") {
          parent = row[idx]?.trim()
          break
        }
      }
    }

    items.push({ item, project, parent })
  }

  // Build hierarchy from parent column
  if (hasParentCol) {
    const itemByTitle = new Map<string, (typeof items)[number]>()
    for (const entry of items) {
      itemByTitle.set(entry.item.title, entry)
    }
    // Attach children to parents
    const topLevel = new Set(items)
    for (const entry of items) {
      if (entry.parent) {
        const parentEntry = itemByTitle.get(entry.parent)
        if (parentEntry) {
          if (!parentEntry.item.children) parentEntry.item.children = []
          parentEntry.item.children.push(entry.item)
          topLevel.delete(entry)
        }
      }
    }
    // Replace items with only top-level
    items.length = 0
    items.push(...topLevel)
  }

  // Group into projects/sections
  const projectTitle = filename ? basename(filename, extname(filename)) : "Import"

  if (!hasProjectCol) {
    // Single project with all items
    const project: ImportProject = {
      sourceId: "csv-project",
      title: projectTitle,
      items: items.map((e) => e.item),
    }
    return {
      source: "csv",
      fetchedAt: new Date().toISOString(),
      projects: [project],
    }
  }

  // Group by project column into sections
  const sectionMap = new Map<string, ImportItem[]>()
  const noSection: ImportItem[] = []
  for (const entry of items) {
    if (entry.project) {
      let list = sectionMap.get(entry.project)
      if (!list) {
        list = []
        sectionMap.set(entry.project, list)
      }
      list.push(entry.item)
    } else {
      noSection.push(entry.item)
    }
  }

  const sections: ImportSection[] = []
  let sectionIdx = 0
  for (const [name, sectionItems] of sectionMap) {
    sections.push({
      sourceId: `csv-section-${++sectionIdx}`,
      title: name,
      items: sectionItems,
    })
  }

  const project: ImportProject = {
    sourceId: "csv-project",
    title: projectTitle,
    ...(sections.length > 0 ? { sections } : {}),
    ...(noSection.length > 0 ? { items: noSection } : {}),
  }

  return {
    source: "csv",
    fetchedAt: new Date().toISOString(),
    projects: [project],
  }
}

// =============================================================================
// Adapter
// =============================================================================

export const csvAdapter: ImportAdapter = {
  id: "csv",
  name: "CSV/TSV",
  fileExtensions: [".csv", ".tsv"],

  parse(options: AdapterParseOptions): ImportData {
    const content = options.isPath ? readFileSync(options.input, "utf-8") : options.input
    const filename = options.isPath ? options.input : undefined
    return parseCSVToImportData(content, filename)
  },
}
