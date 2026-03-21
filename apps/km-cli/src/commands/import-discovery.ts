/**
 * Import Discovery — List Asana projects, download history, and quickstart help
 */

import { existsSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { createTerm } from "@silvery/react"

const term = createTerm(process)

import type { AsanaProjectInfo } from "../import/adapters/asana/asana-api.ts"
import { ensureAsanaSetup } from "./import-auth.ts"

/** Format a project line: "gid  Name  @owner @member ..." */
export function formatProjectMeta(proj: AsanaProjectInfo, maxGid: number): string {
  const parts = [term.dim(proj.gid.padEnd(maxGid)), ` ${proj.name}`]

  // Deduplicated list of people (owner first, then other members)
  const people = new Set<string>()
  if (proj.owner) people.add(proj.owner)
  if (proj.members) for (const m of proj.members) people.add(m)

  if (people.size > 0 && people.size <= 5) {
    const names = [...people].map((n) => `@${n.replace(/\s+/g, "-").toLowerCase()}`)
    parts.push(term.dim(` ${names.join(" ")}`))
  } else if (people.size > 5) {
    parts.push(term.dim(` ${people.size} members`))
  }

  return parts.join("")
}

/** Print help + account listing + download history + quickstart */
export async function printDiscovery(
  cmd: { outputHelp(): void },
  artifactsDir: string,
  authToken?: string,
  workspaceFilter?: string,
): Promise<void> {
  cmd.outputHelp()
  console.log()

  const { token, workspace } = await ensureAsanaSetup(authToken)
  const { listAsanaStructure } = await import("../import/adapters/asana/asana-api.ts")
  const structure = await listAsanaStructure(token, workspaceFilter ?? workspace)

  // Account -> Workspace -> Team -> Active/Archived
  console.log(term.bold(`${structure.user.name}`), term.dim(`(${structure.user.email})`))
  console.log()

  for (const ws of structure.workspaces) {
    const active = ws.projects.filter((p) => !p.archived)
    const archived = ws.projects.filter((p) => p.archived)
    const countText =
      archived.length > 0 ? `${active.length} active, ${archived.length} archived` : `${active.length} projects`
    const maxGid = Math.max(...ws.projects.map((p) => p.gid.length), 0)

    console.log(`  ${term.cyan(ws.name)} ${term.dim(`(${ws.gid}) — ${countText}`)}`)

    // Group by team, sort teams alphabetically
    const byTeam = new Map<string, typeof ws.projects>()
    for (const proj of ws.projects) {
      const team = proj.team ?? "(no team)"
      const existing = byTeam.get(team)
      if (existing) {
        existing.push(proj)
      } else {
        byTeam.set(team, [proj])
      }
    }
    const teamNames = [...byTeam.keys()].sort((a, b) =>
      a === "(no team)" ? 1 : b === "(no team)" ? -1 : a.localeCompare(b),
    )
    const hasTeams = byTeam.size > 1 || !byTeam.has("(no team)")

    for (const team of teamNames) {
      const projects = byTeam.get(team) ?? []
      const teamActive = projects.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name))
      const teamArchived = projects.filter((p) => p.archived).sort((a, b) => a.name.localeCompare(b.name))

      if (hasTeams) {
        console.log()
        console.log(`    ${term.bold(team)}`)
      }
      const indent = hasTeams ? "      " : "    "

      for (const proj of teamActive) {
        const meta = formatProjectMeta(proj, maxGid)
        console.log(`${indent}${meta}`)
      }
      if (teamArchived.length > 0) {
        if (teamActive.length > 0) console.log()
        console.log(`${indent}${term.dim("Archived:")}`)
        for (const proj of teamArchived) {
          const meta = formatProjectMeta(proj, maxGid)
          console.log(`${indent}${meta}`)
        }
      }
    }
    if (ws.projects.length > 50) {
      console.log()
      console.log(term.dim(`  Use --project <gid> to fetch a specific project`))
    }

    // Users (My Tasks)
    if (ws.users.length > 0) {
      console.log()
      console.log(`    ${term.bold("Users")}`)
      for (const user of ws.users.sort((a, b) => a.name.localeCompare(b.name))) {
        const slug = `@${user.name.replace(/\s+/g, "-").toLowerCase()}`
        console.log(`      ${slug}  ${term.dim("(My Tasks)")}`)
      }
    }

    // Tags
    if (ws.tags.length > 0) {
      console.log()
      console.log(`    ${term.bold("Tags")}`)
      for (const tag of ws.tags.sort((a, b) => a.name.localeCompare(b.name))) {
        const slug = `#${tag.name.replace(/\s+/g, "-").toLowerCase()}`
        console.log(`      ${slug}`)
      }
    }

    console.log()
  }

  // Download history
  if (existsSync(artifactsDir)) {
    const downloads = readdirSync(artifactsDir)
      .filter((f) => f.startsWith("asana-") && statSync(join(artifactsDir, f)).isDirectory())
      .sort()
      .reverse()
    if (downloads.length > 0) {
      console.log(term.bold("Downloads:"), term.dim(".km/imports/"))
      console.log()
      for (const dl of downloads.slice(0, 5)) {
        const dirPath = join(artifactsDir, dl)
        const projectFiles = readdirSync(dirPath)
          .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
          .sort()
        const tsMatch = dl.match(/asana-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/)
        const ts = tsMatch ? `${tsMatch[1]}-${tsMatch[2]}-${tsMatch[3]} ${tsMatch[4]}:${tsMatch[5]}:${tsMatch[6]}` : dl
        console.log(`  ${term.dim(ts)}  ${projectFiles.length} projects`)
        for (const pf of projectFiles.slice(0, 8)) {
          console.log(`    ${term.dim(pf.replace(/\.json$/, ""))}`)
        }
        if (projectFiles.length > 8) {
          console.log(term.dim(`    ... and ${projectFiles.length - 8} more`))
        }
      }
      if (downloads.length > 5) {
        console.log(term.dim(`  ... and ${downloads.length - 5} older downloads`))
      }
      console.log()
    }
  }

  // Quickstart
  console.log(term.bold("Quickstart:"))
  console.log()
  console.log(term.dim("  Fetches everything: all projects, completed tasks, comments, attachments"))
  console.log(term.dim("  Interrupted fetches auto-resume where they left off"))
  console.log()
  console.log(`  ${term.cyan('km import asana --project "Name"')}`)
  console.log(term.dim("    Fetch + convert one project → imports/asana/name.md"))
  console.log()
  console.log(`  ${term.cyan("km import asana --fetch")}`)
  console.log(term.dim("    Fetch all projects → .km/imports/asana-<ts>/"))
  console.log()
  console.log(`  ${term.cyan("km import asana --import")}`)
  console.log(term.dim("    Convert most recent download → imports/asana/*.md"))
  console.log()
  console.log(`  ${term.cyan("km import asana data.json")}`)
  console.log(term.dim("    Convert a specific file or directory → imports/asana/*.md"))
  console.log()
}
