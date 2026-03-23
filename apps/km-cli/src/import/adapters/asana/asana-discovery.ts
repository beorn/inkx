import { createTerm } from "@silvery/ag-react"
import { AsanaClient } from "./asana-client.ts"
import { ASANA_BASE } from "./asana-types.ts"
import type { AsanaWorkspace, AsanaProjectInfo } from "./asana-types.ts"

const term = createTerm(process)

/** Authenticate and resolve workspace. Lightweight pre-flight (1 API call).
 * Use this to determine workspace before creating download directories. */
export async function resolveAsanaWorkspace(
  token: string,
  workspaceFilter?: string,
  opts?: { _testMode?: boolean },
): Promise<AsanaWorkspace> {
  const client = new AsanaClient(token, false, opts?._testMode ? 0 : undefined)

  console.log(term.dim("  Validating token..."))
  const me = await client.get<{
    gid: string
    name: string
    email: string
    workspaces: Array<{ gid: string; name: string }>
  }>("/users/me", { opt_fields: "name,email,workspaces.name" })
  console.log(term.green("  Authenticated as"), me.name, term.dim(`(${me.email})`))

  const workspaces = me.workspaces
  const firstWorkspace = workspaces[0]
  if (!firstWorkspace) {
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
    workspace = firstWorkspace
  } else {
    workspace = firstWorkspace
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
    users: Array<{ gid: string; name: string }>
    tags: Array<{ gid: string; name: string }>
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
    projects: AsanaProjectInfo[]
    users: Array<{ gid: string; name: string }>
    tags: Array<{ gid: string; name: string }>
  }> = []

  for (const ws of workspaces) {
    interface RawProject {
      gid: string
      name: string
      archived?: boolean
      team?: { name?: string }
      owner?: { name?: string }
      members?: Array<{ name?: string }>
      notes?: string
    }
    const [allRaw, users, tags] = await Promise.all([
      client.getAll<RawProject>("/projects", {
        workspace: ws.gid,
        opt_fields: "name,archived,team.name,owner.name,members.name,notes",
        limit: "100",
      }),
      client.getAll<{ gid: string; name: string }>(`/workspaces/${ws.gid}/users`, {
        opt_fields: "name",
        limit: "100",
      }),
      client.getAll<{ gid: string; name: string }>("/tags", {
        workspace: ws.gid,
        opt_fields: "name",
        limit: "100",
      }),
    ])

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
      users,
      tags,
    })
  }

  return { user: { name: me.name, email: me.email }, workspaces: result }
}

/** Validate an Asana token by calling /users/me */
export async function validateAsanaToken(token: string): Promise<{
  name: string
  email: string
  workspaces: Array<{ gid: string; name: string }>
}> {
  const res = await fetch(`${ASANA_BASE}/users/me?opt_fields=name,email,workspaces.name`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) {
    throw new Error("Invalid token. Get a new one at https://app.asana.com/0/developer-console")
  }
  if (!res.ok) {
    throw new Error(`Asana API error ${res.status}: ${await res.text()}`)
  }

  const json = (await res.json()) as {
    data: {
      name: string
      email: string
      workspaces: Array<{ gid: string; name: string }>
    }
  }
  return json.data
}
