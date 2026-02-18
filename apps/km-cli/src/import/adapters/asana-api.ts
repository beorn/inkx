/**
 * Asana API Adapter
 *
 * Fetches projects/tasks from Asana REST API with throttling and resumability.
 * Rate limit: 1500 req/min per PAT.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join } from "path"
import { createTerm } from "inkx"

const term = createTerm(process)

import { ProgressBar } from "@beorn/inkx-ui/cli"
import TurndownService from "turndown"
import { slugify } from "../convert.ts"
import type { ImportData, ImportItem, ImportComment, ImportAttachment, ImportProject, ImportSection } from "../types.ts"

/** Convert Asana HTML notes to markdown */
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" })

const ASANA_BASE = "https://app.asana.com/api/1.0"
const TASK_FIELDS = "name,notes,html_notes,completed,completed_at,created_at,modified_at,due_on,due_at,start_on,assignee.name,tags.name,custom_fields,memberships.project.name,memberships.section.name,num_subtasks,permalink_url,resource_subtype"

/** Recorded API call for test fixtures */
export interface RecordedCall {
  path: string
  params?: Record<string, string>
  response: unknown
}

/**
 * Adaptive rate-limited Asana API client.
 *
 * Uses AIMD (additive increase, multiplicative decrease):
 * - Starts at ~17 req/s (60ms delay)
 * - On 429: halves rate limit, waits Retry-After, all concurrent requests share one gate
 * - On success: slowly increases rate toward ceiling
 * - Rejected requests still count against Asana's quota, so avoiding 429s is critical
 */
class AsanaClient {
  /** Current delay between requests (ms). Starts at ~17 req/s. */
  private delayMs = 60
  /** Minimum delay (ceiling rate ~20 req/s, well under 1500/min paid limit). */
  private minDelayMs = 50
  /** Shared gate: when rate-limited, all requests wait on this single promise */
  private rateLimitGate: Promise<void> | null = null
  /** Semaphore: serialize requests to enforce delay between them */
  private queue: Promise<void> = Promise.resolve()
  /** Recorded API responses (when recording is enabled) */
  readonly recorded: RecordedCall[] = []

  constructor(
    private token: string,
    private record = false,
    /** Initial delay between requests in ms. 0 for tests. */
    initialDelayMs?: number,
  ) {
    if (initialDelayMs !== undefined) {
      this.delayMs = initialDelayMs
      this.minDelayMs = initialDelayMs
    }
  }

  /** Low-level GET: returns data + pagination offset */
  private async getRaw<T>(path: string, params?: Record<string, string>): Promise<{ data: T; nextOffset?: string }> {
    const url = new URL(`${ASANA_BASE}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
      }
    }

    let lastError: Error | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      // Wait for shared rate-limit gate (if 429 in flight)
      if (this.rateLimitGate) await this.rateLimitGate

      // Serialize: wait for previous request's delay
      await this.enqueue()

      try {
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${this.token}` },
        })

        if (res.status === 401) {
          throw new Error("Authentication failed. Run 'km import setup asana' to configure your token.")
        }

        if (res.status === 429) {
          // AIMD: multiplicative decrease — double the delay
          this.delayMs = Math.min(this.delayMs * 2, 10000)

          // Only one request sets the gate; others wait on it
          if (!this.rateLimitGate) {
            const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10)
            console.log(term.yellow(`  Rate limited, waiting ${retryAfter}s (slowing to ${(1000 / this.delayMs).toFixed(1)} req/s)...`))
            this.rateLimitGate = sleep(retryAfter * 1000).then(() => {
              this.rateLimitGate = null
            })
          }
          await this.rateLimitGate
          attempt-- // Don't count rate-limit waits as retries
          continue
        }

        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Asana API error ${res.status}: ${body}`)
        }

        // AIMD: additive increase — reduce delay slightly on success
        this.delayMs = Math.max(this.minDelayMs, this.delayMs - 10)

        const json = (await res.json()) as { data: T; next_page?: { offset: string } | null }

        if (this.record) {
          this.recorded.push({ path, params, response: json.data })
        }

        return { data: json.data, nextOffset: json.next_page?.offset }
      } catch (err) {
        lastError = err as Error
        if ((err as Error).message.includes("Authentication failed")) throw err
        const backoff = Math.min(30000, 1000 * Math.pow(2, attempt))
        console.log(term.dim(`  Retry in ${backoff / 1000}s: ${(err as Error).message}`))
        await sleep(backoff)
      }
    }
    throw lastError ?? new Error("Request failed after retries")
  }

  /** Single-page GET, returns just the data */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const result = await this.getRaw<T>(path, params)
    return result.data
  }

  /** Paginated GET — fetches all pages and concatenates results */
  async getAll<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const all: T[] = []
    let offset: string | undefined
    do {
      const p = { ...params }
      if (offset) p.offset = offset
      const result = await this.getRaw<T[]>(path, p)
      all.push(...result.data)
      offset = result.nextOffset
    } while (offset)
    return all
  }

  /** Enqueue: each request waits for the previous one's delay to elapse */
  private enqueue(): Promise<void> {
    const prev = this.queue
    this.queue = prev.then(() => sleep(this.delayMs))
    return prev
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Asana task shape from API */
interface AsanaApiTask {
  gid: string
  name: string
  notes?: string
  html_notes?: string
  completed?: boolean
  completed_at?: string
  created_at?: string
  modified_at?: string
  due_on?: string
  due_at?: string
  start_on?: string
  assignee?: { name?: string } | null
  tags?: Array<{ name?: string }>
  custom_fields?: Array<{ name: string; number_value?: number | null }>
  num_subtasks?: number
  permalink_url?: string
  resource_subtype?: string
  memberships?: Array<{
    project?: { gid: string; name?: string }
    section?: { gid: string; name?: string }
  }>
}

/** Convert Asana task to ImportItem */
function toImportItem(task: AsanaApiTask): ImportItem {
  const item: ImportItem = {
    sourceId: task.gid,
    title: task.name,
    status: task.completed ? "done" : "todo",
  }

  // Prefer html_notes (rich text) over plain notes
  if (task.html_notes?.trim()) {
    const md = turndown.turndown(task.html_notes).trim()
    if (md) item.body = md
  } else if (task.notes?.trim()) {
    item.body = task.notes.trim()
  }
  if (task.created_at) item.createdAt = task.created_at
  if (task.modified_at) item.modifiedAt = task.modified_at
  if (task.completed_at) item.completedAt = task.completed_at
  if (task.permalink_url) item.permalink = task.permalink_url
  if (task.resource_subtype === "milestone") item.milestone = true
  if (task.due_on) item.dueAt = task.due_on
  else if (task.due_at) item.dueAt = task.due_at
  if (task.start_on) item.startAt = task.start_on
  if (task.assignee?.name) item.assignee = task.assignee.name.replace(/\s+/g, "-").toLowerCase()
  if (task.tags?.length) {
    item.tags = task.tags.filter((t) => t.name).map((t) => t.name!.replace(/\s+/g, "-").toLowerCase())
    if (item.tags.length === 0) delete item.tags
  }

  // Multi-project membership → projects list
  if (task.memberships && task.memberships.length > 0) {
    const projectNames = task.memberships
      .map((m) => m.project?.name)
      .filter((n): n is string => !!n)
    if (projectNames.length > 0) {
      item.projects = [...new Set(projectNames)]
    }
  }

  const priorityField = task.custom_fields?.find(
    (f) => f.name.toLowerCase() === "priority" && f.number_value != null,
  )
  if (priorityField?.number_value) {
    item.priority = Math.max(1, Math.min(4, priorityField.number_value))
  }

  return item
}

/** Patterns that match system/audit-log style actions from old Asana (pre-2020).
 * Asana switched to proper `type: "system"` around 2019, so older action-log
 * entries were stored as `type: "comment"`. These can appear:
 * 1. As standalone comments (one action per comment)
 * 2. As consolidated comments with multiple actions separated by "----------------------"
 *    Format: "Name on Weekday Month DD, YYYY HH:MM AM/PM:\n action text"
 */
const SYSTEM_ACTION_PATTERNS = [
  /^moved this (?:task|issue)/i,
  /^completed this task/i,
  /^marked this task/i,
  /^marked today/i,
  /^unmarked today/i,
  /^changed the (?:name|due date|assignee|description)/i,
  /^added to /i,
  /^removed from /i,
  /^assigned to /i,
  /^unassigned /i,
  /^added the /i,
  /^removed the /i,
  /^created (?:this )?task/i,
  /^duplicated from /i,
  /^merged with /i,
  /^liked this task/i,
  /^moved from /i,
  /^moved into /i,
  /^moved out of /i,
  /^added subtask to /i,
  /^have a task due /i,
  /^changed the name to /i,
]

/** Matches consolidated comment block headers: "Name on Weekday Month DD, YYYY HH:MM AM/PM:" */
const CONSOLIDATED_HEADER = /^.+ on (?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \w+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M:$/

/** Cutoff: only apply pattern filtering to comments before 2020 */
const SYSTEM_COMMENT_CUTOFF = "2020-01-01T00:00:00Z"

function isSystemAction(actionText: string): boolean {
  return SYSTEM_ACTION_PATTERNS.some((p) => p.test(actionText))
}

/**
 * Filter system actions from a comment. Returns cleaned text or empty string if all system.
 * Handles both standalone and consolidated (dash-separated) formats.
 */
function filterSystemComment(text: string, createdAt: string): string {
  if (createdAt >= SYSTEM_COMMENT_CUTOFF) return text

  // Check if this is a consolidated comment (has dash separators)
  if (text.includes("----------------------")) {
    const blocks = text.split(/\s*-{20,}\s*/)
    const kept: string[] = []
    for (const block of blocks) {
      const trimmed = block.trim()
      if (!trimmed) continue
      // Consolidated block: "Name on Day Month DD, YYYY HH:MM AM/PM:\n action"
      const lines = trimmed.split("\n")
      const firstLine = lines[0]!.trim()
      if (CONSOLIDATED_HEADER.test(firstLine)) {
        // Check the action text (lines after the header)
        const actionText = lines.slice(1).join("\n").trim()
        if (!actionText || isSystemAction(actionText)) continue
      }
      kept.push(trimmed)
    }
    return kept.join("\n\n")
  }

  // Standalone comment: check against patterns
  if (isSystemAction(text)) return ""
  return text
}

/** Fetch comments (stories) for a task */
async function fetchComments(
  client: AsanaClient,
  taskGid: string,
  opts?: { includeLogs?: boolean },
): Promise<ImportComment[]> {
  const stories = await client.get<
    Array<{
      gid: string
      type: string
      text?: string
      created_at: string
      created_by?: { name?: string }
    }>
  >(`/tasks/${taskGid}/stories`, { opt_fields: "type,text,created_at,created_by.name" })

  const comments: ImportComment[] = []
  for (const s of stories) {
    if (s.type !== "comment" || !s.text?.trim()) continue
    const text = opts?.includeLogs ? s.text!.trim() : filterSystemComment(s.text!.trim(), s.created_at)
    if (!text) continue
    comments.push({
      author: s.created_by?.name?.replace(/\s+/g, "-").toLowerCase(),
      createdAt: s.created_at,
      text,
    })
  }
  return comments
}

/** Fetch attachments for a task */
async function fetchAttachments(client: AsanaClient, taskGid: string): Promise<ImportAttachment[]> {
  const attachments = await client.get<
    Array<{
      gid: string
      name: string
      download_url?: string
      permanent_url?: string
      view_url?: string
      host?: string
    }>
  >(`/tasks/${taskGid}/attachments`, { opt_fields: "name,download_url,permanent_url,view_url,host" })

  return attachments.map((a) => ({
    sourceId: a.gid,
    name: a.name,
    url: a.download_url ?? a.permanent_url ?? a.view_url ?? "",
    type: isImageName(a.name) ? "image" : a.host === "asana" ? "file" : "link",
  }))
}

function isImageName(name: string): boolean {
  return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name)
}

/** Enrich a single task with comments, attachments, subtasks (all parallel) */
async function enrichItem(
  client: AsanaClient,
  task: AsanaApiTask,
  opts?: { comments?: boolean; attachments?: boolean; commentLogs?: boolean },
): Promise<ImportItem> {
  const item = toImportItem(task)
  const [comments, attachments, children] = await Promise.all([
    opts?.comments ? fetchComments(client, task.gid, { includeLogs: opts.commentLogs }) : undefined,
    opts?.attachments ? fetchAttachments(client, task.gid) : undefined,
    task.num_subtasks && task.num_subtasks > 0 ? fetchSubtasks(client, task.gid, opts) : undefined,
  ])
  if (comments?.length) item.comments = comments
  if (attachments?.length) item.attachments = attachments
  if (children) item.children = children
  return item
}

/** Recursively fetch subtasks with optional comments/attachments */
async function fetchSubtasks(
  client: AsanaClient,
  taskGid: string,
  opts?: { comments?: boolean; attachments?: boolean; commentLogs?: boolean },
): Promise<ImportItem[]> {
  const subtasks = await client.get<AsanaApiTask[]>(
    `/tasks/${taskGid}/subtasks`,
    { opt_fields: TASK_FIELDS },
  )

  return Promise.all(subtasks.map((sub) => enrichItem(client, sub, opts)))
}

export interface FetchOptions {
  token: string
  /** Directory to save per-project JSON files (also used for resume) */
  downloadDir: string
  projectFilter?: string
  includeCompleted?: boolean
  includeComments?: boolean
  includeAttachments?: boolean
  /** Include system/audit-log comments (e.g., "moved this Task", "completed this task") */
  includeCommentLogs?: boolean
  /** Fetch per-user My Tasks lists (orphan tasks not in any project) */
  includeUserTaskLists?: boolean
  /** Fetch per-tag task lists (tasks grouped by tag) */
  includeTagTaskLists?: boolean
  workspace?: string
  /** Record raw API responses for test fixtures */
  record?: boolean
}

export interface FetchResult {
  data: ImportData
  /** Raw API responses (only when record: true) */
  recorded?: RecordedCall[]
}

/** Resolved workspace info from Asana auth */
export interface AsanaWorkspace {
  gid: string
  name: string
  user: { gid: string; name: string; email: string }
  allWorkspaces: Array<{ gid: string; name: string }>
}

/** Authenticate and resolve workspace. Lightweight pre-flight (1 API call).
 * Use this to determine workspace before creating download directories. */
export async function resolveAsanaWorkspace(
  token: string,
  workspaceFilter?: string,
  opts?: { _testMode?: boolean },
): Promise<AsanaWorkspace> {
  const client = new AsanaClient(token, false, opts?._testMode ? 0 : undefined)

  console.log(term.dim("  Validating token..."))
  const me = await client.get<{ gid: string; name: string; email: string; workspaces: Array<{ gid: string; name: string }> }>(
    "/users/me",
    { opt_fields: "name,email,workspaces.name" },
  )
  console.log(term.green("  Authenticated as"), me.name, term.dim(`(${me.email})`))

  const workspaces = me.workspaces
  if (workspaces.length === 0) {
    throw new Error("No workspaces found for this Asana account.")
  }

  let workspace: { gid: string; name: string }
  if (workspaceFilter) {
    const found = workspaces.find((w) => w.name === workspaceFilter || w.gid === workspaceFilter)
    if (!found) {
      throw new Error(
        `Workspace "${workspaceFilter}" not found. Available: ${workspaces.map((w) => w.name).join(", ")}`,
      )
    }
    workspace = found
  } else if (workspaces.length === 1) {
    workspace = workspaces[0]!
  } else {
    workspace = workspaces[0]!
    console.log(
      term.yellow(`  Multiple workspaces found, using "${workspace.name}".`),
      term.dim(`Use --workspace to select: ${workspaces.map((w) => w.name).join(", ")}`),
    )
  }
  console.log(term.dim(`  Workspace: ${workspace.name}`))

  return {
    gid: workspace.gid,
    name: workspace.name,
    user: { gid: me.gid, name: me.name, email: me.email },
    allWorkspaces: workspaces,
  }
}

/** Fetch projects and tasks from Asana API */
export async function fetchFromAsana(options: FetchOptions & { record: true }): Promise<FetchResult>
export async function fetchFromAsana(options: FetchOptions): Promise<ImportData>
export async function fetchFromAsana(options: FetchOptions & { _testMode?: boolean }): Promise<ImportData | FetchResult> {
  const CONCURRENCY = 10
  const client = new AsanaClient(options.token, options.record, options._testMode ? 0 : undefined)

  // Resolve workspace (re-does /users/me — cheap, keeps fetchFromAsana self-contained for tests)
  const me = await client.get<{ gid: string; name: string; email: string; workspaces: Array<{ gid: string; name: string }> }>(
    "/users/me",
    { opt_fields: "name,email,workspaces.name" },
  )

  let workspace: { gid: string; name: string }
  if (options.workspace) {
    workspace = me.workspaces.find((w) => w.name === options.workspace || w.gid === options.workspace) ?? me.workspaces[0]!
  } else {
    workspace = me.workspaces[0]!
  }

  // Create download dir and check for already-fetched projects (resume)
  const downloadDir = options.downloadDir
  mkdirSync(downloadDir, { recursive: true })

  // Fetch and save workspace metadata (teams, users) — only a few API calls
  const workspaceMetaPath = join(downloadDir, "_workspace.json")
  if (!existsSync(workspaceMetaPath)) {
    console.log(term.dim("  Fetching workspace metadata..."))
    const [teams, users] = await Promise.all([
      client.get<Array<{ gid: string; name: string; description?: string }>>(
        `/workspaces/${workspace.gid}/teams`,
        { opt_fields: "name,description", limit: "100" },
      ),
      client.get<Array<{ gid: string; name: string; email?: string }>>(
        `/workspaces/${workspace.gid}/users`,
        { opt_fields: "name,email", limit: "100" },
      ),
    ])
    const workspaceMeta = {
      gid: workspace.gid,
      name: workspace.name,
      user: { gid: me.gid, name: me.name, email: me.email },
      teams,
      users,
    }
    writeFileSync(workspaceMetaPath, JSON.stringify(workspaceMeta, null, 2), "utf-8")
    console.log(term.dim(`  ${teams.length} team(s), ${users.length} user(s)`))
  }

  const alreadyFetched = new Set<string>()
  // Track expected counts from API for verification
  const expectedTaskCounts = new Map<string, number>() // projectGid → task count from API
  const importData: ImportData = {
    source: "asana",
    fetchedAt: new Date().toISOString(),
    workspace: workspace.name,
    projects: [],
  }

  // Resume: read existing project JSONs from download dir
  const existingFiles = readdirSync(downloadDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  for (const f of existingFiles) {
    const proj = JSON.parse(readFileSync(join(downloadDir, f), "utf-8")) as ImportProject
    importData.projects.push(proj)
    alreadyFetched.add(proj.sourceId)
  }
  if (alreadyFetched.size > 0) {
    console.log(term.cyan(`  Resuming:`), `${alreadyFetched.size} project(s) already downloaded`)
  }

  // Fetch projects (with metadata for frontmatter)
  console.log(term.dim("  Fetching projects..."))
  const projects = await client.getAll<{
    gid: string; name: string
    created_at?: string; modified_at?: string
    owner?: { name?: string }; team?: { name?: string }
  }>(
    `/projects`,
    { workspace: workspace.gid, opt_fields: "name,created_at,modified_at,owner.name,team.name", limit: "100" },
  )

  const filteredProjects = options.projectFilter
    ? projects.filter((p) =>
        p.gid === options.projectFilter ||
        p.name.toLowerCase().includes(options.projectFilter!.toLowerCase()),
      )
    : projects

  console.log(`  Found ${filteredProjects.length} project(s)`)

  // Pre-flight: show what's missing/changed vs what's on disk
  if (alreadyFetched.size > 0) {
    const missing = filteredProjects.filter((p) => !alreadyFetched.has(p.gid))
    const stale: string[] = []
    for (const p of filteredProjects) {
      if (!alreadyFetched.has(p.gid)) continue
      const diskProj = importData.projects.find((dp) => dp.sourceId === p.gid)
      // If Asana's modified_at is newer than what we stored, it changed
      if (diskProj && p.modified_at && diskProj.modifiedAt && p.modified_at > diskProj.modifiedAt) {
        stale.push(p.name)
      }
    }
    if (missing.length > 0) {
      console.log(term.cyan(`  Missing:`), `${missing.length} project(s) not yet downloaded`)
      for (const p of missing) console.log(term.dim(`    + ${p.name}`))
    }
    if (stale.length > 0) {
      console.log(term.yellow(`  Changed:`), `${stale.length} project(s) modified since last fetch`)
      for (const name of stale) console.log(term.yellow(`    ~ ${name}`))
    }
    if (missing.length === 0 && stale.length === 0) {
      console.log(term.green(`  All ${alreadyFetched.size} project(s) up to date`))
    }
  }

  const enrichOpts = {
    comments: options.includeComments,
    attachments: options.includeAttachments,
    commentLogs: options.includeCommentLogs,
  }

  for (const project of filteredProjects) {
    if (alreadyFetched.has(project.gid)) {
      console.log(term.dim(`  skip ${project.name} (already fetched)`))
      continue
    }

    console.log(term.cyan(`  Fetching: ${project.name}`))

    // Fetch sections
    const sections = await client.get<Array<{ gid: string; name: string }>>(
      `/projects/${project.gid}/sections`,
      { opt_fields: "name" },
    )

    // Fetch tasks
    const taskParams: Record<string, string> = {
      project: project.gid,
      opt_fields: TASK_FIELDS,
      limit: "100",
    }
    if (!options.includeCompleted) {
      taskParams.completed_since = "now"
    }

    const tasks = await client.getAll<AsanaApiTask>(`/tasks`, taskParams)
    expectedTaskCounts.set(project.gid, tasks.length)

    // Group tasks by section
    const sectionMap = new Map<string, AsanaApiTask[]>()
    const looseTasks: AsanaApiTask[] = []

    for (const task of tasks) {
      // Find the membership for THIS project (not just first membership — task may be multi-project)
      const membership = task.memberships?.find((m) => m.project?.gid === project.gid)
      const sectionGid = membership?.section?.gid ?? task.memberships?.[0]?.section?.gid
      if (sectionGid) {
        if (!sectionMap.has(sectionGid)) sectionMap.set(sectionGid, [])
        sectionMap.get(sectionGid)!.push(task)
      } else {
        looseTasks.push(task)
      }
    }

    // Enrich all tasks concurrently (throttle handles rate limiting)
    const allTasks = [...tasks]
    const enrichedMap = new Map<string, ImportItem>()

    const bar = new ProgressBar({ total: allTasks.length, format: "  :bar :current/:total tasks | ETA: :eta" })
    if (allTasks.length > 0) bar.start()

    for (let i = 0; i < allTasks.length; i += CONCURRENCY) {
      const batch = allTasks.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map((t) => enrichItem(client, t, enrichOpts)))
      for (let j = 0; j < batch.length; j++) {
        enrichedMap.set(batch[j]!.gid, results[j]!)
        bar.increment()
      }
    }
    if (allTasks.length > 0) bar.stop(true)

    // Assemble sections from enriched tasks
    const importSections: ImportSection[] = []
    for (const section of sections) {
      const sectionTasks = sectionMap.get(section.gid) ?? []
      const items = sectionTasks.map((t) => enrichedMap.get(t.gid)!).filter(Boolean)
      if (items.length > 0) {
        importSections.push({ sourceId: section.gid, title: section.name, items })
      }
    }

    const looseItems = looseTasks.map((t) => enrichedMap.get(t.gid)!).filter(Boolean)

    const importProject: ImportProject = {
      sourceId: project.gid,
      title: project.name,
      workspace: workspace.name,
    }
    if (project.created_at) importProject.createdAt = project.created_at
    if (project.modified_at) importProject.modifiedAt = project.modified_at
    if (project.owner?.name) importProject.owner = project.owner.name
    if (project.team?.name) importProject.team = project.team.name
    if (importSections.length > 0) importProject.sections = importSections
    if (looseItems.length > 0) importProject.items = looseItems

    importData.projects.push(importProject)

    // Save project JSON immediately (resume checkpoint)
    const slug = slugify(project.name)
    writeFileSync(join(downloadDir, `${project.gid}-${slug}.json`), JSON.stringify(importProject, null, 2), "utf-8")

    console.log(
      term.green("  +"),
      `${project.name}: ${tasks.length} tasks`,
      importSections.length > 0 ? `in ${importSections.length} sections` : "",
    )
  }

  // Collect all task GIDs captured via projects (for dedup with user task lists)
  const capturedTaskGids = new Set<string>()
  const collectGids = (items: ImportItem[]): void => {
    for (const item of items) {
      capturedTaskGids.add(item.sourceId)
      if (item.children) collectGids(item.children)
    }
  }
  for (const proj of importData.projects) {
    for (const item of proj.items ?? []) collectGids([item])
    for (const sec of proj.sections ?? []) collectGids(sec.items)
  }

  // Fetch per-user task lists (My Tasks)
  if (options.includeUserTaskLists) {
    // Get all users from workspace metadata (or fetch fresh)
    let userList: Array<{ gid: string; name: string }>
    if (existsSync(workspaceMetaPath)) {
      const wsMeta = JSON.parse(readFileSync(workspaceMetaPath, "utf-8")) as { users?: Array<{ gid: string; name: string }> }
      userList = wsMeta.users ?? []
    } else {
      userList = await client.get<Array<{ gid: string; name: string }>>(
        `/workspaces/${workspace.gid}/users`,
        { opt_fields: "name", limit: "100" },
      )
    }

    console.log(term.dim(`  Fetching My Tasks for ${userList.length} user(s)...`))

    for (const user of userList) {
      const userSlug = slugify(user.name)
      const userFilename = `@${userSlug}`
      if (alreadyFetched.has(`user-${user.gid}`)) {
        console.log(term.dim(`  skip @${userSlug} (already fetched)`))
        continue
      }

      // Get user's task list GID
      const taskList = await client.get<{ gid: string }>(
        `/users/${user.gid}/user_task_list`,
        { workspace: workspace.gid },
      )

      // Fetch tasks from user task list
      const userTasks = await client.getAll<AsanaApiTask>(
        `/user_task_lists/${taskList.gid}/tasks`,
        { opt_fields: TASK_FIELDS, limit: "100" },
      )

      // Filter to tasks NOT already captured in projects
      const orphanTasks = userTasks.filter((t) => !capturedTaskGids.has(t.gid))

      if (orphanTasks.length === 0) {
        console.log(term.dim(`  @${userSlug}: 0 orphan tasks (${userTasks.length} total, all in projects)`))
        continue
      }

      console.log(term.cyan(`  @${userSlug}: ${orphanTasks.length} orphan tasks (${userTasks.length} total)`))

      // Enrich orphan tasks
      const enrichedItems: ImportItem[] = []
      const bar = new ProgressBar({ total: orphanTasks.length, format: `  :bar :current/:total @${userSlug} tasks | ETA: :eta` })
      bar.start()
      for (let i = 0; i < orphanTasks.length; i += CONCURRENCY) {
        const batch = orphanTasks.slice(i, i + CONCURRENCY)
        const results = await Promise.all(batch.map((t) => enrichItem(client, t, enrichOpts)))
        enrichedItems.push(...results)
        for (let j = 0; j < batch.length; j++) bar.increment()
      }
      bar.stop(true)

      // Group by section (My Tasks has sections like "Recently assigned", "Today", "Upcoming")
      const sections = await client.get<Array<{ gid: string; name: string }>>(
        `/user_task_lists/${taskList.gid}/sections` as `/projects/${string}/sections`,
        { opt_fields: "name" },
      )

      const sectionMap = new Map<string, ImportItem[]>()
      const loose: ImportItem[] = []
      for (let idx = 0; idx < orphanTasks.length; idx++) {
        const task = orphanTasks[idx]!
        const item = enrichedItems[idx]!
        const membership = task.memberships?.find((m) => m.section?.gid)
        if (membership?.section?.gid) {
          if (!sectionMap.has(membership.section.gid)) sectionMap.set(membership.section.gid, [])
          sectionMap.get(membership.section.gid)!.push(item)
        } else {
          loose.push(item)
        }
      }

      const importSections: ImportSection[] = []
      for (const sec of sections) {
        const items = sectionMap.get(sec.gid)
        if (items?.length) importSections.push({ sourceId: sec.gid, title: sec.name, items })
      }

      const userProject: ImportProject = {
        sourceId: `user-${user.gid}`,
        title: `@${user.name}`,
        workspace: workspace.name,
        owner: user.name,
      }
      if (importSections.length > 0) userProject.sections = importSections
      if (loose.length > 0) userProject.items = loose

      importData.projects.push(userProject)
      writeFileSync(join(downloadDir, `${userFilename}.json`), JSON.stringify(userProject, null, 2), "utf-8")
    }
  }

  // Fetch per-tag task lists
  if (options.includeTagTaskLists) {
    const tags = await client.getAll<{ gid: string; name: string }>(
      `/tags`,
      { workspace: workspace.gid, opt_fields: "name", limit: "100" },
    )

    console.log(term.dim(`  Fetching tasks for ${tags.length} tag(s)...`))

    for (const tag of tags) {
      const tagSlug = slugify(tag.name)
      const tagFilename = `#${tagSlug}`
      if (alreadyFetched.has(`tag-${tag.gid}`)) {
        console.log(term.dim(`  skip #${tagSlug} (already fetched)`))
        continue
      }

      const tagTasks = await client.getAll<AsanaApiTask>(
        `/tags/${tag.gid}/tasks`,
        { opt_fields: TASK_FIELDS, limit: "100" },
      )

      // Filter to tasks NOT already captured in projects or user task lists
      const orphanTasks = tagTasks.filter((t) => !capturedTaskGids.has(t.gid))

      if (orphanTasks.length === 0) {
        console.log(term.dim(`  #${tagSlug}: 0 orphan tasks (${tagTasks.length} total, all in projects)`))
        continue
      }

      console.log(term.cyan(`  #${tagSlug}: ${orphanTasks.length} orphan tasks (${tagTasks.length} total)`))

      // Enrich orphan tasks
      const enrichedItems: ImportItem[] = []
      const bar = new ProgressBar({ total: orphanTasks.length, format: `  :bar :current/:total #${tagSlug} tasks | ETA: :eta` })
      bar.start()
      for (let i = 0; i < orphanTasks.length; i += CONCURRENCY) {
        const batch = orphanTasks.slice(i, i + CONCURRENCY)
        const results = await Promise.all(batch.map((t) => enrichItem(client, t, enrichOpts)))
        enrichedItems.push(...results)
        for (let j = 0; j < batch.length; j++) bar.increment()
      }
      bar.stop(true)

      // Add these task GIDs to captured set (for dedup with subsequent tags)
      for (const item of enrichedItems) capturedTaskGids.add(item.sourceId)

      const tagProject: ImportProject = {
        sourceId: `tag-${tag.gid}`,
        title: `#${tag.name}`,
        workspace: workspace.name,
      }
      if (enrichedItems.length > 0) tagProject.items = enrichedItems

      importData.projects.push(tagProject)
      writeFileSync(join(downloadDir, `${tagFilename}.json`), JSON.stringify(tagProject, null, 2), "utf-8")
    }
  }

  // Verification: re-read JSON files from disk and compare with in-memory data
  console.log()
  console.log(term.cyan("Verification:"))

  // Count in-memory totals
  let memTasks = 0
  let memSubtasks = 0
  let memComments = 0
  let memAttachments = 0
  let emptyProjects = 0
  const countItems = (items: ImportItem[]): void => {
    for (const item of items) {
      memTasks++
      if (item.comments) memComments += item.comments.length
      if (item.attachments) memAttachments += item.attachments.length
      if (item.children) {
        memSubtasks += item.children.length
        countItems(item.children)
      }
    }
  }
  for (const proj of importData.projects) {
    const items = [...(proj.items ?? []), ...(proj.sections ?? []).flatMap((s) => s.items)]
    if (items.length === 0) emptyProjects++
    countItems(items)
  }

  // Re-read JSON files from disk and verify
  const jsonFiles = readdirSync(downloadDir).filter((f) => f.endsWith(".json") && !f.startsWith("_") && !f.startsWith("@") && !f.startsWith("#"))
  const userFiles = readdirSync(downloadDir).filter((f) => f.startsWith("@") && f.endsWith(".json"))
  const tagFiles = readdirSync(downloadDir).filter((f) => f.startsWith("#") && f.endsWith(".json"))
  let diskTasks = 0
  let diskProjects = 0
  let diskBytes = 0
  const mismatches: string[] = []

  const countProjectItems = (proj: ImportProject): number => {
    let count = 0
    const countRec = (items: ImportItem[]): void => {
      for (const item of items) {
        count++
        if (item.children) countRec(item.children)
      }
    }
    for (const item of proj.items ?? []) countRec([item])
    for (const sec of proj.sections ?? []) countRec(sec.items)
    return count
  }

  for (const f of [...jsonFiles, ...userFiles, ...tagFiles]) {
    const filePath = join(downloadDir, f)
    const raw = readFileSync(filePath, "utf-8")
    diskBytes += raw.length
    try {
      const proj = JSON.parse(raw) as ImportProject
      diskProjects++
      const diskCount = countProjectItems(proj)
      diskTasks += diskCount
      // Check in-memory project matches disk
      const memProj = importData.projects.find((p) => p.sourceId === proj.sourceId)
      if (memProj) {
        const memCount = countProjectItems(memProj)
        if (memCount !== diskCount) {
          mismatches.push(`${proj.title}: memory=${memCount} disk=${diskCount}`)
        }
      }
    } catch {
      mismatches.push(`${f}: invalid JSON`)
    }
  }

  const fileBreakdown = [
    `${jsonFiles.length} project`,
    userFiles.length > 0 ? `${userFiles.length} user` : "",
    tagFiles.length > 0 ? `${tagFiles.length} tag` : "",
  ].filter(Boolean).join(" + ")
  console.log(`  Projects: ${importData.projects.length} in memory, ${diskProjects} on disk (${fileBreakdown} files)`)
  console.log(`  Tasks: ${memTasks} top-level, ${memSubtasks} subtasks (${memTasks + memSubtasks} total)`)
  console.log(`  Comments: ${memComments}, Attachments: ${memAttachments}`)
  const totalFiles = jsonFiles.length + userFiles.length + tagFiles.length
  console.log(`  Disk: ${(diskBytes / 1024 / 1024).toFixed(1)} MB across ${totalFiles} JSON files`)

  if (diskTasks !== memTasks + memSubtasks) {
    console.log(term.yellow(`  ⚠ Task count mismatch: memory=${memTasks + memSubtasks}, disk=${diskTasks}`))
  } else {
    console.log(term.green(`  ✓ Task counts match (memory = disk)`))
  }

  if (emptyProjects > 0) {
    const empties = importData.projects.filter((p) => !(p.items?.length || p.sections?.length))
    console.log(term.yellow(`  ⚠ ${emptyProjects} empty project(s): ${empties.map((p) => p.title).join(", ")}`))
  }

  // Verify API-reported task counts match stored counts
  for (const [gid, expected] of expectedTaskCounts) {
    const proj = importData.projects.find((p) => p.sourceId === gid)
    if (!proj) {
      mismatches.push(`Project ${gid}: fetched from API but missing in output`)
      continue
    }
    const actual = (proj.items?.length ?? 0) + (proj.sections ?? []).reduce((n, s) => n + s.items.length, 0)
    if (actual !== expected) {
      mismatches.push(`${proj.title}: API returned ${expected} tasks, stored ${actual}`)
    }
  }

  // Check expected project count
  if (importData.projects.length !== diskProjects) {
    mismatches.push(`Project count: memory=${importData.projects.length}, disk=${diskProjects}`)
  }

  if (mismatches.length > 0) {
    console.log(term.yellow(`  ⚠ ${mismatches.length} mismatch(es):`))
    for (const m of mismatches) console.log(term.yellow(`    ${m}`))
  } else {
    console.log(term.green(`  ✓ All counts verified`))
  }

  // Save recording if enabled
  if (options.record && client.recorded.length > 0) {
    writeFileSync(join(downloadDir, "_recording.json"), JSON.stringify(client.recorded, null, 2), "utf-8")
  }

  if (options.record) {
    return { data: importData, recorded: client.recorded }
  }
  return importData
}

/** Project info returned by listAsanaStructure */
export interface AsanaProjectInfo {
  gid: string
  name: string
  archived?: boolean
  team?: string
  owner?: string
  members?: string[]
  notes?: string
}

/** List workspaces and projects (discovery mode) */
export async function listAsanaStructure(
  token: string,
  workspaceFilter?: string,
): Promise<{
  user: { name: string; email: string }
  workspaces: Array<{
    gid: string
    name: string
    projects: AsanaProjectInfo[]
  }>
}> {
  const client = new AsanaClient(token)
  const me = await client.get<{
    name: string
    email: string
    workspaces: Array<{ gid: string; name: string }>
  }>("/users/me", { opt_fields: "name,email,workspaces.name" })

  const workspaces = workspaceFilter
    ? me.workspaces.filter((w) => w.name === workspaceFilter || w.gid === workspaceFilter)
    : me.workspaces

  const result: Array<{
    gid: string
    name: string
    projects: Array<{ gid: string; name: string; archived?: boolean }>
  }> = []

  for (const ws of workspaces) {
    interface RawProject {
      gid: string; name: string; archived?: boolean
      team?: { name?: string }; owner?: { name?: string }
      members?: Array<{ name?: string }>; notes?: string
    }
    const allRaw = await client.getAll<RawProject>("/projects", {
      workspace: ws.gid,
      opt_fields: "name,archived,team.name,owner.name,members.name,notes",
      limit: "100",
    })

    const allProjects: AsanaProjectInfo[] = allRaw.map((p) => ({
      gid: p.gid,
      name: p.name,
      archived: p.archived,
      team: p.team?.name,
      owner: p.owner?.name,
      members: p.members?.map((m) => m.name).filter((n): n is string => !!n),
      notes: p.notes || undefined,
    }))

    result.push({
      gid: ws.gid,
      name: ws.name,
      projects: allProjects,
    })
  }

  return { user: { name: me.name, email: me.email }, workspaces: result }
}

/** Validate an Asana token by calling /users/me */
export async function validateAsanaToken(token: string): Promise<{ name: string; email: string; workspaces: Array<{ gid: string; name: string }> }> {
  const res = await fetch(`${ASANA_BASE}/users/me?opt_fields=name,email,workspaces.name`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) {
    throw new Error("Invalid token. Get a new one at https://app.asana.com/0/developer-console")
  }
  if (!res.ok) {
    throw new Error(`Asana API error ${res.status}: ${await res.text()}`)
  }

  const json = (await res.json()) as { data: { name: string; email: string; workspaces: Array<{ gid: string; name: string }> } }
  return json.data
}
