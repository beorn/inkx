/**
 * Asana API Adapter
 *
 * Fetches projects/tasks from Asana REST API with throttling and resumability.
 * Rate limit: 1500 req/min per PAT.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join } from "path"
import { createTerm } from "@silvery/react"

const term = createTerm(process)

import { ProgressBar } from "@silvery/ui/cli"
import { AsanaClient } from "./asana-client.ts"
import { TASK_FIELDS } from "./asana-types.ts"
import type { AsanaApiTask, FetchOptions, FetchResult } from "./asana-types.ts"
import { enrichItem, type EnrichOpts } from "./task-transform.ts"
import { slugify } from "../../convert.ts"
import type {
  ImportData,
  ImportItem,
  ImportProject,
  ImportSection,
  ImportStatusUpdate,
  ImportCustomFieldDef,
} from "../../types.ts"

// Re-export everything from sub-modules so existing imports still work
export { AsanaClient } from "./asana-client.ts"
export type {
  RecordedCall,
  AsanaApiTask,
  FetchOptions,
  FetchResult,
  AsanaWorkspace,
  AsanaProjectInfo,
} from "./asana-types.ts"
export { resolveAsanaWorkspace, listAsanaStructure, validateAsanaToken } from "./asana-discovery.ts"
export { isSystemAction, filterSystemComment, fetchComments, type FetchCommentsResult } from "./comment-filter.ts"
export { toImportItem, enrichItem, fetchSubtasks, fetchAttachments } from "./task-transform.ts"

const CONCURRENCY = 10

/** Fetch project status updates (periodic health reports) */
async function fetchProjectStatuses(client: AsanaClient, projectGid: string): Promise<ImportStatusUpdate[]> {
  const statuses = await client.getAll<{
    title?: string
    text?: string
    color?: string
    author?: { name?: string }
    created_at?: string
    modified_at?: string
  }>(`/projects/${projectGid}/project_statuses`, {
    opt_fields: "title,text,color,author.name,created_at,modified_at",
  })

  return statuses.map((s) => ({
    title: s.title ?? "",
    text: s.text ?? "",
    color: s.color ?? "unknown",
    author: s.author?.name,
    createdAt: s.created_at,
    modifiedAt: s.modified_at,
  }))
}

/** Fetch custom field definitions for a project */
async function fetchCustomFieldSettings(client: AsanaClient, projectGid: string): Promise<ImportCustomFieldDef[]> {
  const settings = await client.getAll<{
    custom_field?: {
      name?: string
      type?: string
      description?: string
      precision?: number
      enum_options?: Array<{ name?: string }>
    }
  }>(`/projects/${projectGid}/custom_field_settings`, {
    opt_fields:
      "custom_field.name,custom_field.type,custom_field.enum_options.name,custom_field.precision,custom_field.description",
  })

  return settings
    .filter((s) => s.custom_field?.name)
    .map((s) => {
      const cf = s.custom_field
      if (!cf?.name) throw new Error("unreachable: filtered above")
      const def: ImportCustomFieldDef = {
        name: cf.name,
        type: cf.type ?? "text",
      }
      if (cf.description) def.description = cf.description
      if (cf.precision !== null) def.precision = cf.precision
      if (cf.enum_options?.length) {
        def.enumOptions = cf.enum_options.map((o) => o.name).filter((n): n is string => !!n)
      }
      return def
    })
}

interface TaskListSpec {
  sourceId: string
  slug: string
  title: string
  fetchTasks: () => Promise<AsanaApiTask[]>
  sections?: Array<{ gid: string; name: string }>
  /** Fetch sections from this endpoint after fetching tasks */
  fetchSections?: () => Promise<Array<{ gid: string; name: string }>>
  workspace: string
  owner?: string
  createdAt?: string
  modifiedAt?: string
  team?: string
  /** Match task to section using project GID (for project-scoped sections) */
  projectGid?: string
  /** Use assignee_section instead of memberships for section grouping (for user task lists) */
  useAssigneeSection?: boolean
}

/** Batch-enrich tasks with progress bar */
async function batchEnrich(
  client: AsanaClient,
  tasks: AsanaApiTask[],
  enrichOpts: EnrichOpts,
  barFormat: string,
): Promise<Map<string, ImportItem>> {
  const enrichedMap = new Map<string, ImportItem>()

  const bar = new ProgressBar({ total: tasks.length, format: barFormat })
  if (tasks.length > 0) bar.start()

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((t) => enrichItem(client, t, enrichOpts)))
    for (let j = 0; j < batch.length; j++) {
      const task = batch[j]
      const result = results[j]
      if (task && result) enrichedMap.set(task.gid, result)
      bar.increment()
    }
  }
  if (tasks.length > 0) bar.stop(true)

  return enrichedMap
}

/** Derive section list from task memberships (preserves first-seen order) */
function deriveSections(tasks: AsanaApiTask[], projectGid?: string): Array<{ gid: string; name: string }> {
  const seen = new Set<string>()
  const result: Array<{ gid: string; name: string }> = []
  for (const task of tasks) {
    const membership = projectGid
      ? task.memberships?.find((m) => m.project?.gid === projectGid)
      : task.memberships?.find((m) => m.section?.gid)
    const section = membership?.section
    if (section?.gid && !seen.has(section.gid)) {
      seen.add(section.gid)
      result.push({ gid: section.gid, name: section.name?.trim() || "Untitled" })
    }
  }
  return result
}

/** Derive section list from assignee_section field (for user task lists / My Tasks) */
function deriveAssigneeSections(tasks: AsanaApiTask[]): Array<{ gid: string; name: string }> {
  const seen = new Set<string>()
  const result: Array<{ gid: string; name: string }> = []
  for (const task of tasks) {
    const section = task.assignee_section
    if (section?.gid && !seen.has(section.gid)) {
      seen.add(section.gid)
      result.push({ gid: section.gid, name: section.name?.trim() || "Untitled" })
    }
  }
  return result
}

/** Get the section GID for a task, using either memberships or assignee_section */
function getTaskSectionGid(task: AsanaApiTask, projectGid?: string, useAssigneeSection?: boolean): string | undefined {
  if (useAssigneeSection) {
    return task.assignee_section?.gid
  }
  const membership = projectGid
    ? task.memberships?.find((m) => m.project?.gid === projectGid)
    : task.memberships?.find((m) => m.section?.gid)
  return membership?.section?.gid ?? task.memberships?.[0]?.section?.gid
}

/** Group tasks by section, returning assembled sections and loose items */
function groupBySections(
  tasks: AsanaApiTask[],
  enrichedMap: Map<string, ImportItem>,
  sections: Array<{ gid: string; name: string }>,
  projectGid?: string,
  useAssigneeSection?: boolean,
): { importSections: ImportSection[]; looseItems: ImportItem[] } {
  const sectionMap = new Map<string, AsanaApiTask[]>()
  const looseTasks: AsanaApiTask[] = []

  for (const task of tasks) {
    const sectionGid = getTaskSectionGid(task, projectGid, useAssigneeSection)
    if (sectionGid) {
      const existing = sectionMap.get(sectionGid)
      if (existing) {
        existing.push(task)
      } else {
        sectionMap.set(sectionGid, [task])
      }
    } else {
      looseTasks.push(task)
    }
  }

  const importSections: ImportSection[] = []
  for (const section of sections) {
    const sectionTasks = sectionMap.get(section.gid) ?? []
    const items = sectionTasks.map((t) => enrichedMap.get(t.gid)).filter((item): item is ImportItem => !!item)
    if (items.length > 0) {
      importSections.push({
        sourceId: section.gid,
        title: section.name,
        items,
      })
    }
  }

  const looseItems = looseTasks.map((t) => enrichedMap.get(t.gid)).filter((item): item is ImportItem => !!item)
  return { importSections, looseItems }
}

/** Fetch, enrich, group, and save a task list (project, user task list, or tag) */
async function fetchAndSaveTaskList(
  client: AsanaClient,
  spec: TaskListSpec,
  enrichOpts: EnrichOpts,
  downloadDir: string,
): Promise<{ project: ImportProject; tasks: AsanaApiTask[] }> {
  const tasks = await spec.fetchTasks()
  const sections = spec.fetchSections
    ? await spec.fetchSections()
    : spec.useAssigneeSection
      ? deriveAssigneeSections(tasks)
      : (spec.sections ?? deriveSections(tasks, spec.projectGid))

  const enrichedMap = await batchEnrich(
    client,
    tasks,
    enrichOpts,
    `  :bar :current/:total ${spec.slug} tasks | ETA: :eta`,
  )

  const { importSections, looseItems } = groupBySections(
    tasks,
    enrichedMap,
    sections,
    spec.projectGid,
    spec.useAssigneeSection,
  )

  const importProject: ImportProject = {
    sourceId: spec.sourceId,
    title: spec.title,
    workspace: spec.workspace,
  }
  if (spec.createdAt) importProject.createdAt = spec.createdAt
  if (spec.modifiedAt) importProject.modifiedAt = spec.modifiedAt
  if (spec.owner) importProject.owner = spec.owner
  if (spec.team) importProject.team = spec.team
  if (importSections.length > 0) importProject.sections = importSections
  if (looseItems.length > 0) importProject.items = looseItems

  writeFileSync(join(downloadDir, `${spec.slug}.json`), JSON.stringify(importProject, null, 2), "utf-8")

  console.log(
    term.green("  +"),
    `${spec.title}: ${tasks.length} tasks`,
    importSections.length > 0 ? `in ${importSections.length} sections` : "",
  )

  return { project: importProject, tasks }
}

/** Recursively count items (tasks + subtasks + comments + attachments) */
function countItems(items: ImportItem[]): {
  tasks: number
  subtasks: number
  comments: number
  attachments: number
} {
  let tasks = 0
  let subtasks = 0
  let comments = 0
  let attachments = 0
  for (const item of items) {
    tasks++
    if (item.comments) comments += item.comments.length
    if (item.attachments) attachments += item.attachments.length
    if (item.children) {
      subtasks += item.children.length
      const sub = countItems(item.children)
      subtasks += sub.subtasks
      comments += sub.comments
      attachments += sub.attachments
    }
  }
  return { tasks, subtasks, comments, attachments }
}

/** Count all items in a project (top-level + subtasks recursively) */
function countProjectItems(proj: ImportProject): number {
  const allItems = [...(proj.items ?? []), ...(proj.sections ?? []).flatMap((s) => s.items)]
  const { tasks, subtasks } = countItems(allItems)
  return tasks + subtasks
}

/** Collect all task GIDs from projects (for dedup) */
function collectTaskGids(projects: ImportProject[]): Set<string> {
  const gids = new Set<string>()
  const collect = (items: ImportItem[]): void => {
    for (const item of items) {
      gids.add(item.sourceId)
      if (item.children) collect(item.children)
    }
  }
  for (const proj of projects) {
    for (const item of proj.items ?? []) collect([item])
    for (const sec of proj.sections ?? []) collect(sec.items)
  }
  return gids
}

/** Partition download dir files into project/user/tag buckets */
function partitionFiles(downloadDir: string): {
  projectFiles: string[]
  userFiles: string[]
  tagFiles: string[]
} {
  const allFiles = readdirSync(downloadDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  return {
    projectFiles: allFiles.filter((f) => !f.startsWith("@") && !f.startsWith("#")),
    userFiles: allFiles.filter((f) => f.startsWith("@")),
    tagFiles: allFiles.filter((f) => f.startsWith("#")),
  }
}

/** Fetch projects and tasks from Asana API */
export async function fetchFromAsana(options: FetchOptions & { record: true }): Promise<FetchResult>
export async function fetchFromAsana(options: FetchOptions): Promise<ImportData>
export async function fetchFromAsana(
  options: FetchOptions & { _testMode?: boolean },
): Promise<ImportData | FetchResult> {
  const client = new AsanaClient(options.token, options.record, options._testMode ? 0 : undefined)

  // Resolve workspace (re-does /users/me -- cheap, keeps fetchFromAsana self-contained for tests)
  const me = await client.get<{
    gid: string
    name: string
    email: string
    workspaces: Array<{ gid: string; name: string }>
  }>("/users/me", { opt_fields: "name,email,workspaces.name" })

  const firstWorkspace = me.workspaces[0]
  if (!firstWorkspace) throw new Error("No workspaces found for user")
  let workspace: { gid: string; name: string }
  if (options.workspace) {
    workspace = me.workspaces.find((w) => w.name === options.workspace || w.gid === options.workspace) ?? firstWorkspace
  } else {
    workspace = firstWorkspace
  }

  // Create download dir and check for already-fetched projects (resume)
  const downloadDir = options.downloadDir
  mkdirSync(downloadDir, { recursive: true })

  // Fetch and save workspace metadata (teams, users) -- only a few API calls
  const workspaceMetaPath = join(downloadDir, "_workspace.json")
  if (!existsSync(workspaceMetaPath)) {
    console.log(term.dim("  Fetching workspace metadata..."))
    const [teams, users] = await Promise.all([
      client.get<Array<{ gid: string; name: string; description?: string }>>(`/workspaces/${workspace.gid}/teams`, {
        opt_fields: "name,description",
        limit: "100",
      }),
      client.get<Array<{ gid: string; name: string; email?: string }>>(`/workspaces/${workspace.gid}/users`, {
        opt_fields: "name,email",
        limit: "100",
      }),
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
  const expectedTaskCounts = new Map<string, number>()
  const importData: ImportData = {
    source: "asana",
    fetchedAt: new Date().toISOString(),
    workspace: workspace.name,
    projects: [],
  }

  // Resume: read existing project JSONs from download dir
  const existingFiles = readdirSync(downloadDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  let emptyOnDisk = 0
  for (const f of existingFiles) {
    const proj = JSON.parse(readFileSync(join(downloadDir, f), "utf-8")) as ImportProject
    const hasItems = (proj.items?.length ?? 0) > 0 || (proj.sections ?? []).some((s) => s.items.length > 0)
    if (hasItems) {
      importData.projects.push(proj)
      alreadyFetched.add(proj.sourceId)
    } else {
      emptyOnDisk++
    }
  }
  if (alreadyFetched.size > 0) {
    console.log(term.cyan(`  Resuming:`), `${alreadyFetched.size} project(s) already downloaded`)
  }
  if (emptyOnDisk > 0) {
    console.log(term.yellow(`  Re-fetching:`), `${emptyOnDisk} empty project(s) on disk`)
  }

  // Fetch projects (with metadata for frontmatter)
  console.log(term.dim("  Fetching projects..."))
  const projects = await client.getAll<{
    gid: string
    name: string
    created_at?: string
    modified_at?: string
    owner?: { name?: string }
    team?: { name?: string }
  }>(`/projects`, {
    workspace: workspace.gid,
    opt_fields: "name,created_at,modified_at,owner.name,team.name",
    limit: "100",
  })

  const projectFilter = options.projectFilter
  const filteredProjects = projectFilter
    ? projects.filter((p) => p.gid === projectFilter || p.name.toLowerCase().includes(projectFilter.toLowerCase()))
    : projects

  console.log(`  Found ${filteredProjects.length} project(s)`)

  // Pre-flight: show what's missing/changed vs what's on disk
  if (alreadyFetched.size > 0) {
    const missing = filteredProjects.filter((p) => !alreadyFetched.has(p.gid))
    const stale: string[] = []
    for (const p of filteredProjects) {
      if (!alreadyFetched.has(p.gid)) continue
      const diskProj = importData.projects.find((dp) => dp.sourceId === p.gid)
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

  const enrichOpts: EnrichOpts = {
    comments: options.includeComments,
    attachments: options.includeAttachments,
    commentLogs: options.includeCommentLogs,
  }

  // Fetch projects
  for (const project of filteredProjects) {
    if (alreadyFetched.has(project.gid)) {
      console.log(term.dim(`  skip ${project.name} (already fetched)`))
      continue
    }

    console.log(term.cyan(`  Fetching: ${project.name}`))

    const taskParams: Record<string, string> = {
      project: project.gid,
      opt_fields: TASK_FIELDS,
      limit: "100",
    }
    if (!options.includeCompleted) {
      taskParams.completed_since = "now"
    }

    const { project: importProject, tasks } = await fetchAndSaveTaskList(
      client,
      {
        sourceId: project.gid,
        slug: `${project.gid}-${slugify(project.name)}`,
        title: project.name,
        fetchTasks: () => client.getAll<AsanaApiTask>(`/tasks`, taskParams),
        fetchSections: () =>
          client.get<Array<{ gid: string; name: string }>>(`/projects/${project.gid}/sections`, { opt_fields: "name" }),
        workspace: workspace.name,
        createdAt: project.created_at,
        modifiedAt: project.modified_at,
        owner: project.owner?.name,
        team: project.team?.name,
        projectGid: project.gid,
      },
      enrichOpts,
      downloadDir,
    )

    // Fetch project-level metadata (status updates + custom field definitions)
    const [statusUpdates, customFieldSettings] = await Promise.all([
      fetchProjectStatuses(client, project.gid).catch(() => []),
      fetchCustomFieldSettings(client, project.gid).catch(() => []),
    ])
    if (statusUpdates.length > 0) {
      importProject.statusUpdates = statusUpdates
    }
    if (customFieldSettings.length > 0) {
      importProject.customFieldSettings = customFieldSettings
    }

    importData.projects.push(importProject)
    expectedTaskCounts.set(project.gid, tasks.length)
  }

  // Collect all task GIDs captured via projects (for dedup with user task lists)
  const capturedTaskGids = collectTaskGids(importData.projects)

  // Fetch per-user task lists (My Tasks)
  if (options.includeUserTaskLists) {
    let userList: Array<{ gid: string; name: string }>
    if (existsSync(workspaceMetaPath)) {
      const wsMeta = JSON.parse(readFileSync(workspaceMetaPath, "utf-8")) as {
        users?: Array<{ gid: string; name: string }>
      }
      userList = wsMeta.users ?? []
    } else {
      userList = await client.get<Array<{ gid: string; name: string }>>(`/workspaces/${workspace.gid}/users`, {
        opt_fields: "name",
        limit: "100",
      })
    }

    console.log(term.dim(`  Fetching My Tasks for ${userList.length} user(s) (only tasks visible to you)...`))

    for (const user of userList) {
      const userSlug = slugify(user.name)
      if (alreadyFetched.has(`user-${user.gid}`)) {
        console.log(term.dim(`  skip @${userSlug} (already fetched)`))
        continue
      }

      let taskList: { gid: string }
      try {
        taskList = await client.get<{ gid: string }>(`/users/${user.gid}/user_task_list`, {
          workspace: workspace.gid,
        })
      } catch {
        console.log(term.dim(`  @${userSlug}: skipped (task list not accessible)`))
        continue
      }

      const allUserTasks = await client.getAll<AsanaApiTask>(`/user_task_lists/${taskList.gid}/tasks`, {
        opt_fields: TASK_FIELDS,
        limit: "100",
      })

      if (allUserTasks.length === 0) {
        console.log(term.dim(`  @${userSlug}: 0 tasks`))
        continue
      }

      const orphanCount = allUserTasks.filter((t) => !capturedTaskGids.has(t.gid)).length
      console.log(
        term.cyan(
          `  @${userSlug}: ${allUserTasks.length} tasks (${orphanCount} orphan, ${allUserTasks.length - orphanCount} in projects)`,
        ),
      )

      const { project: userProject } = await fetchAndSaveTaskList(
        client,
        {
          sourceId: `user-${user.gid}`,
          slug: `@${userSlug}`,
          title: `@${user.name}`,
          fetchTasks: async () => allUserTasks,
          // Use assignee_section for My Tasks grouping (API doesn't support /user_task_lists/sections)
          useAssigneeSection: true,
          workspace: workspace.name,
          owner: user.name,
        },
        enrichOpts,
        downloadDir,
      )

      importData.projects.push(userProject)
    }
  }

  // Fetch per-tag task lists
  if (options.includeTagTaskLists) {
    const tags = await client.getAll<{ gid: string; name: string }>(`/tags`, {
      workspace: workspace.gid,
      opt_fields: "name",
      limit: "100",
    })

    console.log(term.dim(`  Fetching tasks for ${tags.length} tag(s)...`))

    for (const tag of tags) {
      const tagSlug = slugify(tag.name)
      if (alreadyFetched.has(`tag-${tag.gid}`)) {
        console.log(term.dim(`  skip #${tagSlug} (already fetched)`))
        continue
      }

      const allTagTasks = await client.getAll<AsanaApiTask>(`/tags/${tag.gid}/tasks`, {
        opt_fields: TASK_FIELDS,
        limit: "100",
      })

      const orphanTasks = allTagTasks.filter((t) => !capturedTaskGids.has(t.gid))

      if (orphanTasks.length === 0) {
        console.log(term.dim(`  #${tagSlug}: 0 orphan tasks (${allTagTasks.length} total, all in projects)`))
        continue
      }

      console.log(term.cyan(`  #${tagSlug}: ${orphanTasks.length} orphan tasks (${allTagTasks.length} total)`))

      const { project: tagProject } = await fetchAndSaveTaskList(
        client,
        {
          sourceId: `tag-${tag.gid}`,
          slug: `#${tagSlug}`,
          title: `#${tag.name}`,
          fetchTasks: async () => orphanTasks,
          workspace: workspace.name,
        },
        enrichOpts,
        downloadDir,
      )

      importData.projects.push(tagProject)

      // Add these task GIDs to captured set (for dedup with subsequent tags)
      const addGids = (items: ImportItem[]): void => {
        for (const item of items) {
          capturedTaskGids.add(item.sourceId)
          if (item.children) addGids(item.children)
        }
      }
      for (const item of tagProject.items ?? []) addGids([item])
      for (const sec of tagProject.sections ?? []) addGids(sec.items)
    }
  }

  // Verification
  verify(importData, expectedTaskCounts, downloadDir)

  // Save recording if enabled
  if (options.record && client.recorded.length > 0) {
    writeFileSync(join(downloadDir, "_recording.json"), JSON.stringify(client.recorded, null, 2), "utf-8")
  }

  if (options.record) {
    return { data: importData, recorded: client.recorded }
  }
  return importData
}

/** Verify in-memory data matches disk */
function verify(importData: ImportData, expectedTaskCounts: Map<string, number>, downloadDir: string): void {
  console.log()
  console.log(term.cyan("Verification:"))

  // Count in-memory totals
  let memTasks = 0
  let memSubtasks = 0
  let memComments = 0
  let memAttachments = 0
  let emptyProjects = 0

  for (const proj of importData.projects) {
    const allItems = [...(proj.items ?? []), ...(proj.sections ?? []).flatMap((s) => s.items)]
    if (allItems.length === 0) emptyProjects++
    const counts = countItems(allItems)
    memTasks += counts.tasks
    memSubtasks += counts.subtasks
    memComments += counts.comments
    memAttachments += counts.attachments
  }

  // Re-read JSON files from disk and verify
  const { projectFiles, userFiles, tagFiles } = partitionFiles(downloadDir)
  let diskTasks = 0
  let diskProjects = 0
  let diskBytes = 0
  const mismatches: string[] = []

  for (const f of [...projectFiles, ...userFiles, ...tagFiles]) {
    const filePath = join(downloadDir, f)
    const raw = readFileSync(filePath, "utf-8")
    diskBytes += raw.length
    try {
      const proj = JSON.parse(raw) as ImportProject
      diskProjects++
      const diskCount = countProjectItems(proj)
      diskTasks += diskCount
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
    `${projectFiles.length} project`,
    userFiles.length > 0 ? `${userFiles.length} user` : "",
    tagFiles.length > 0 ? `${tagFiles.length} tag` : "",
  ]
    .filter(Boolean)
    .join(" + ")
  console.log(`  Projects: ${importData.projects.length} in memory, ${diskProjects} on disk (${fileBreakdown} files)`)
  console.log(`  Tasks: ${memTasks} top-level, ${memSubtasks} subtasks (${memTasks + memSubtasks} total)`)
  console.log(`  Comments: ${memComments}, Attachments: ${memAttachments}`)
  const totalFiles = projectFiles.length + userFiles.length + tagFiles.length
  console.log(`  Disk: ${(diskBytes / 1024 / 1024).toFixed(1)} MB across ${totalFiles} JSON files`)

  if (diskTasks !== memTasks + memSubtasks) {
    console.log(term.yellow(`  \u26a0 Task count mismatch: memory=${memTasks + memSubtasks}, disk=${diskTasks}`))
  } else {
    console.log(term.green(`  \u2713 Task counts match (memory = disk)`))
  }

  if (emptyProjects > 0) {
    const empties = importData.projects.filter((p) => !(p.items?.length || p.sections?.length))
    console.log(term.yellow(`  \u26a0 ${emptyProjects} empty project(s): ${empties.map((p) => p.title).join(", ")}`))
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
    console.log(term.yellow(`  \u26a0 ${mismatches.length} mismatch(es):`))
    for (const m of mismatches) console.log(term.yellow(`    ${m}`))
  } else {
    console.log(term.green(`  \u2713 All counts verified`))
  }
}
