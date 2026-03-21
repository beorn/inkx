/**
 * Asana File Adapter
 *
 * Parses an Asana JSON export file into ImportData.
 * Handles the format from Asana's "Export to JSON" feature.
 */

import type { ImportData, ImportItem, ImportProject, ImportSection } from "../../types.ts"

/** Asana task shape (subset of fields we care about) */
interface AsanaTask {
  gid: string
  name: string
  notes?: string
  completed?: boolean
  due_on?: string
  due_at?: string
  start_on?: string
  assignee?: { name?: string; gid?: string } | null
  tags?: Array<{ name: string }>
  custom_fields?: Array<{
    name: string
    display_value?: string | null
    number_value?: number | null
  }>
  subtasks?: AsanaTask[]
  memberships?: Array<{
    project?: { gid: string; name: string }
    section?: { gid: string; name: string }
  }>
}

/** Asana JSON export top-level shape */
interface AsanaExport {
  data: AsanaTask[]
}

/** Convert an Asana task to an ImportItem */
function convertTask(task: AsanaTask): ImportItem {
  const item: ImportItem = {
    sourceId: task.gid,
    title: task.name,
    status: task.completed ? "done" : "todo",
  }

  if (task.notes?.trim()) {
    item.body = task.notes.trim()
  }

  // Due date: prefer due_on (date only), fall back to due_at (datetime)
  if (task.due_on) {
    item.dueAt = task.due_on
  } else if (task.due_at) {
    item.dueAt = task.due_at
  }

  if (task.start_on) {
    item.startAt = task.start_on
  }

  if (task.assignee?.name) {
    item.assignee = task.assignee.name.replace(/\s+/g, "-").toLowerCase()
  }

  if (task.tags?.length) {
    item.tags = [...new Set(task.tags.map((t) => t.name.replace(/\s+/g, "-").toLowerCase()))]
  }

  // Multi-project membership -> projects list + rich memberships with section context
  if (task.memberships && task.memberships.length > 0) {
    const projectNames = task.memberships.map((m) => m.project?.name).filter((n): n is string => !!n)
    if (projectNames.length > 0) {
      item.projects = [...new Set(projectNames)]
    }
    const memberships = task.memberships
      .filter((m) => m.project?.name)
      .map((m) => ({
        project: m.project?.name ?? "",
        ...(m.section?.name ? { section: m.section.name } : {}),
      }))
    if (memberships.length > 0) {
      item.projectMemberships = memberships
    }
  }

  // Priority from custom fields — map to P-string
  const priorityField = task.custom_fields?.find((f) => f.name.toLowerCase() === "priority" && f.number_value != null)
  if (priorityField?.number_value) {
    const clamped = Math.max(1, Math.min(4, priorityField.number_value))
    item.priority = `P${clamped}`
  }

  // Subtasks
  if (task.subtasks?.length) {
    item.children = task.subtasks.map(convertTask)
  }

  return item
}

/** Parse Asana JSON export into ImportData */
export function parseAsanaFile(jsonContent: string): ImportData {
  const asana = JSON.parse(jsonContent) as AsanaExport
  const tasks = asana.data

  // Group tasks by project → section
  const projectMap = new Map<
    string,
    {
      name: string
      sections: Map<string, AsanaTask[]>
      sectionNames: Map<string, string>
      loose: AsanaTask[]
    }
  >()

  for (const task of tasks) {
    const membership = task.memberships?.[0]
    const projectGid = membership?.project?.gid ?? "ungrouped"
    const projectName = membership?.project?.name ?? "Ungrouped"
    const sectionGid = membership?.section?.gid
    const sectionName = membership?.section?.name

    let project = projectMap.get(projectGid)
    if (!project) {
      project = {
        name: projectName,
        sections: new Map(),
        sectionNames: new Map(),
        loose: [],
      }
      projectMap.set(projectGid, project)
    }

    if (sectionGid && sectionName) {
      let sectionTasks = project.sections.get(sectionGid)
      if (!sectionTasks) {
        sectionTasks = []
        project.sections.set(sectionGid, sectionTasks)
      }
      // Store section name in the lookup map
      if (!project.sectionNames.has(sectionGid)) {
        project.sectionNames.set(sectionGid, sectionName)
      }
      sectionTasks.push(task)
    } else {
      project.loose.push(task)
    }
  }

  // Build ImportProject array
  const projects: ImportProject[] = []

  for (const [projectGid, projectData] of projectMap) {
    const sections: ImportSection[] = []

    for (const [sectionGid, sectionTasks] of projectData.sections) {
      const sectionName = projectData.sectionNames.get(sectionGid)?.trim() || "Untitled Section"
      sections.push({
        sourceId: sectionGid,
        title: sectionName,
        items: sectionTasks.map(convertTask),
      })
    }

    const project: ImportProject = {
      sourceId: projectGid,
      title: projectData.name,
    }
    if (sections.length > 0) project.sections = sections
    if (projectData.loose.length > 0) {
      project.items = projectData.loose.map(convertTask)
    }

    projects.push(project)
  }

  return {
    source: "asana",
    fetchedAt: new Date().toISOString(),
    projects,
  }
}
