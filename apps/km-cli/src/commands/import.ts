/**
 * Import Command
 *
 * 3-stage import pipeline: Fetch → Convert → Write.
 *
 * Usage:
 *   km import asana                       # Setup (first time) then fetch
 *   km import asana export.json           # From exported JSON file
 *   km import asana --dry-run             # Preview without writing
 *   km import asana --project "Sprint 4"  # Single project
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { basename, join, resolve } from "path"
import { Command } from "@commander-js/extra-typings"
import { createTerm } from "inkx"

const term = createTerm(process)

import { steps } from "@beorn/inkx-ui/progress"
import { CURSOR_SHOW, write } from "@beorn/inkx-ui/cli"
import type { ImportData, ImportProject, FileMap } from "../import/types.ts"
import type { AsanaProjectInfo, AsanaWorkspace } from "../import/adapters/asana-api.ts"
import { convert, slugify } from "../import/convert.ts"
import { writeFiles } from "../import/write.ts"
import { loadConfig, saveConfig } from "../import/config.ts"
import { getRootPath } from "../program.ts"

export const importCommand = new Command("import")
  .description("Import tasks from external tools (Asana, etc.)")
  .addCommand(createAsanaCommand())

// ============================================================================
// Download directory helpers
// ============================================================================

/** Load ImportData from a download directory (one JSON file per project) */
function loadDownloadDir(dirPath: string): ImportData {
  const dirName = basename(dirPath)
  // Parse: asana-2026-02-17T15-09-50 → source="asana", timestamp
  const dashIdx = dirName.indexOf("-")
  const source = dirName.slice(0, dashIdx) // "asana"
  const tsRaw = dirName.slice(dashIdx + 1) // "2026-02-17T15-09-50"
  const fetchedAt = tsRaw.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3") + "Z"

  const files = readdirSync(dirPath)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
  const projects = files.map((f) => JSON.parse(readFileSync(join(dirPath, f), "utf-8")) as ImportProject)

  return { source, fetchedAt, projects }
}

/** Find the most recent asana-* download directory, optionally scoped to a workspace */
function findLatestDownload(artifactsDir: string, workspaceSlug?: string): string | undefined {
  if (!existsSync(artifactsDir)) return undefined
  const prefix = workspaceSlug ? `asana-${workspaceSlug}-` : "asana-"
  const dirs = readdirSync(artifactsDir)
    .filter((f) => f.startsWith(prefix) && statSync(join(artifactsDir, f)).isDirectory())
    .sort()
  return dirs.length > 0 ? dirs[dirs.length - 1] : undefined
}

/** Create a new timestamped download directory path, scoped by workspace */
function newDownloadDir(artifactsDir: string, workspaceSlug?: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const prefix = workspaceSlug ? `asana-${workspaceSlug}-${ts}` : `asana-${ts}`
  return join(artifactsDir, prefix)
}

// ============================================================================
// Auth setup
// ============================================================================

/** Run interactive setup, returns token + workspace */
async function ensureAsanaSetup(tokenOverride?: string): Promise<{ token: string; workspace?: string }> {
  const config = loadConfig()

  // If token override provided, use it directly
  if (tokenOverride) {
    return { token: tokenOverride, workspace: config.asana?.defaultWorkspace }
  }

  // If already configured, reuse
  if (config.asana?.token) {
    return { token: config.asana.token, workspace: config.asana.defaultWorkspace }
  }

  // First time — walk user through setup
  const { withTextInput, withSelect } = await import("@beorn/inkx-ui/wrappers")

  console.log(term.cyan("First-time Asana setup"))
  console.log(term.dim("Get a Personal Access Token from: https://app.asana.com/0/developer-console"))
  console.log()

  const token = await withTextInput({
    message: "Asana Personal Access Token:",
    placeholder: "1/1234567890...",
  })

  if (!token?.trim()) {
    console.error(term.red("No token provided"))
    process.exit(1)
  }

  // Validate
  console.log(term.dim("Validating token..."))
  const { validateAsanaToken } = await import("../import/adapters/asana-api.ts")

  let userInfo: { name: string; email: string; workspaces: Array<{ gid: string; name: string }> }
  try {
    userInfo = await validateAsanaToken(token.trim())
  } catch (err) {
    console.error(term.red((err as Error).message))
    process.exit(1)
  }

  console.log(term.green("Authenticated as"), userInfo.name, term.dim(`(${userInfo.email})`))

  // Select workspace
  let defaultWorkspace: string | undefined
  if (userInfo.workspaces.length > 1) {
    defaultWorkspace = await withSelect({
      message: "Default workspace:",
      options: userInfo.workspaces.map((w) => ({ label: w.name, value: w.name })),
    })
  } else if (userInfo.workspaces.length === 1) {
    defaultWorkspace = userInfo.workspaces[0]!.name
    console.log(term.dim(`Workspace: ${defaultWorkspace}`))
  }

  // Save for next time
  const newConfig = loadConfig()
  newConfig.asana = {
    token: token.trim(),
    ...(defaultWorkspace && { defaultWorkspace }),
  }
  saveConfig(newConfig)
  console.log(term.green("Config saved."))
  console.log()

  return { token: token.trim(), workspace: defaultWorkspace }
}

// ============================================================================
// Discovery mode
// ============================================================================

/** Format a project line: "gid  Name  @owner @member ..." */
function formatProjectMeta(proj: AsanaProjectInfo, maxGid: number): string {
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
async function printDiscovery(
  cmd: Command,
  artifactsDir: string,
  authToken?: string,
  workspaceFilter?: string,
): Promise<void> {
  cmd.outputHelp()
  console.log()

  const { token, workspace } = await ensureAsanaSetup(authToken)
  const { listAsanaStructure } = await import("../import/adapters/asana-api.ts")
  const structure = await listAsanaStructure(token, workspaceFilter ?? workspace)

  // Account → Workspace → Team → Active/Archived
  console.log(term.bold(`${structure.user.name}`), term.dim(`(${structure.user.email})`))
  console.log()

  for (const ws of structure.workspaces) {
    const active = ws.projects.filter((p) => !p.archived)
    const archived = ws.projects.filter((p) => p.archived)
    const countText = archived.length > 0
      ? `${active.length} active, ${archived.length} archived`
      : `${active.length} projects`
    const maxGid = Math.max(...ws.projects.map((p) => p.gid.length), 0)

    console.log(`  ${term.cyan(ws.name)} ${term.dim(`(${ws.gid}) — ${countText}`)}`)

    // Group by team, sort teams alphabetically
    const byTeam = new Map<string, typeof ws.projects>()
    for (const proj of ws.projects) {
      const team = proj.team ?? "(no team)"
      if (!byTeam.has(team)) byTeam.set(team, [])
      byTeam.get(team)!.push(proj)
    }
    const teamNames = [...byTeam.keys()].sort((a, b) =>
      a === "(no team)" ? 1 : b === "(no team)" ? -1 : a.localeCompare(b),
    )
    const hasTeams = byTeam.size > 1 || !byTeam.has("(no team)")

    for (const team of teamNames) {
      const projects = byTeam.get(team)!
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
        const ts = tsMatch
          ? `${tsMatch[1]}-${tsMatch[2]}-${tsMatch[3]} ${tsMatch[4]}:${tsMatch[5]}:${tsMatch[6]}`
          : dl
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
  console.log(`  ${term.cyan("km import asana --project \"Name\"")}`)
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

// ============================================================================
// Command
// ============================================================================

function createAsanaCommand(): Command {
  const cmd = new Command("asana")
    .description("Import from Asana")
    .addHelpText("after", `
Pipeline:
  1. Auth     Prompts for Asana PAT on first run, validates, saves to
              ~/.config/km/import.json (token + default workspace).
              Use --auth to reconfigure, --auth-token for one-time override.

  2. Fetch    Asana API → .km/imports/asana-<ts>/<project>.json
              One JSON file per project with tasks, subtasks, comments,
              attachments. Also saves raw API responses (_recording.json).
              Auto-resumes if interrupted (use --fetch-restart to start over).

  3. Convert  Download → imports/asana/*.md (or --out)
              One markdown file per project with sections, task metadata,
              comments, attachments, and subtask hierarchy.

  Downloads go to <root>/.km/imports/ (hidden from km).
  Markdown output goes to <root>/imports/asana/ (browsable in km).
  By default steps 2+3 run together. Use --fetch or --import to run one step.
  Run with no flags to list your Asana projects and download history.

  [root] can be a km repository path. If omitted, auto-detects from cwd.
`)
    .argument("[root]", "km repository root (default: auto-detect)")

    // Input source
    .option("--from <path>", "JSON file or download directory to convert")

    // What to fetch
    .option("--project <name|gid>", "Fetch a single project (name substring or GID)")
    .option("--workspace <name|gid>", "Workspace (name or GID, default: first)")

    // Output control
    .option("-o, --out <dir>", "Output directory (default: <root>/imports/asana/)")
    .option("--dry-run", "Preview without writing")
    .option("--force", "Overwrite existing files")
    .option("--fetch", "Fetch only (save JSON, skip markdown conversion)")
    .option("--fetch-restart", "Restart fetch from scratch (default: resumes)")
    .option("--import", "Import only (convert saved JSON to markdown)")

    // Auth
    .option("--auth-token <pat>", "One-time token (not saved)")
    .option("--auth", "Reconfigure saved token/workspace")

    // Advanced
    .option("--no-record", "Skip saving raw API responses")
    .option("--include-comment-logs", "Include system/audit-log comments (moved, completed, etc.)")

    .action(async (root, options) => {
      // Restore cursor on SIGINT (Ctrl-C) — ProgressBar hides cursor during operation
      const sigintHandler = () => {
        write(CURSOR_SHOW)
        process.exit(130) // Standard SIGINT exit code
      }
      process.on("SIGINT", sigintHandler)

      // Resolve km root: explicit argument > auto-detect
      const rootPath = root ? resolve(root) : getRootPath()
      if (!rootPath) {
        console.error(term.red("No km repository found. Specify a root path or run from a km repo."))
        process.exit(1)
      }
      const artifactsDir = join(rootPath, ".km", "imports")

      // Determine if this is an action (fetch/import) or discovery (list) mode
      const isAction = !!(options.from || options.project || options.fetch || options.import || options.fetchRestart)

      if (!isAction && !options.auth) {
        await printDiscovery(cmd, artifactsDir, options.authToken, options.workspace)
        return
      }

      if (options.auth && !isAction) {
        // Just re-run auth setup, don't fetch
        const config = loadConfig()
        delete config.asana
        saveConfig(config)
        await ensureAsanaSetup(options.authToken)
        return
      }

      const startTime = Date.now()
      let importData: ImportData

      if (options.from) {
        // --from: load from a specific file or directory
        const filePath = resolve(options.from)
        if (!existsSync(filePath)) {
          console.error(term.red(`Not found: ${filePath}`))
          process.exit(1)
        }

        if (statSync(filePath).isDirectory()) {
          importData = loadDownloadDir(filePath)
          console.log(term.green("Loaded"), `${importData.projects.length} project(s) from ${options.from}/`)
        } else {
          const json = readFileSync(filePath, "utf-8")
          const parsed = JSON.parse(json)

          if (parsed.source && parsed.projects) {
            // Full ImportData (multi-project)
            importData = parsed as ImportData
            console.log(term.green("Loaded"), `${importData.projects.length} project(s) from ${options.from}`)
          } else if (parsed.sourceId && parsed.title) {
            // Single ImportProject from download directory
            const project = parsed as ImportProject
            importData = {
              source: "asana",
              fetchedAt: new Date().toISOString(),
              projects: [project],
            }
            console.log(term.green("Loaded"), `1 project from ${options.from}: ${project.title}`)
          } else {
            const { parseAsanaFile } = await import("../import/adapters/asana-file.ts")
            const result = await steps({
              parseExport: () => parseAsanaFile(json),
            }).run({ clear: true })
            importData = result.parseExport
            console.log(term.green("Parsed"), `${importData.projects.length} project(s) from ${options.from}`)
          }
        }
      } else if (options.import) {
        // --import: find most recent download directory and convert it
        const latest = findLatestDownload(artifactsDir)
        if (!latest) {
          console.error(term.red("No downloads found in .km/imports/. Run a fetch first."))
          process.exit(1)
        }
        const dirPath = join(artifactsDir, latest)
        importData = loadDownloadDir(dirPath)
        console.log(term.green("Loaded"), `${importData.projects.length} project(s) from ${latest}/`)
      } else {
        // API mode — setup if needed, then fetch
        if (options.auth) {
          const config = loadConfig()
          delete config.asana
          saveConfig(config)
        }

        const { token, workspace: configWorkspace } = await ensureAsanaSetup(options.authToken)
        const { fetchFromAsana, resolveAsanaWorkspace } = await import("../import/adapters/asana-api.ts")

        console.log(term.cyan("Fetching from Asana API..."))

        // Resolve workspace first (1 API call) — needed to scope download directory
        const effectiveWorkspace = options.workspace ?? configWorkspace
        const resolved: AsanaWorkspace = await resolveAsanaWorkspace(token, effectiveWorkspace)
        const wsSlug = slugify(resolved.name)

        // Determine download dir: resume into latest for this workspace, or create new
        const latestDir = options.fetchRestart ? undefined : findLatestDownload(artifactsDir, wsSlug)
        const downloadDir = latestDir ? join(artifactsDir, latestDir) : newDownloadDir(artifactsDir, wsSlug)

        const fetchOpts = {
          token,
          downloadDir,
          projectFilter: options.project,
          includeCompleted: true,
          includeComments: true,
          includeAttachments: true,
          includeCommentLogs: options.includeCommentLogs,  // Only system logs are opt-in
          includeUserTaskLists: true,
          includeTagTaskLists: true,
          workspace: resolved.name,
        }

        // Always record API responses (unless --no-record)
        const shouldRecord = options.record !== false

        if (shouldRecord) {
          const result = await fetchFromAsana({ ...fetchOpts, record: true })
          importData = result.data
        } else {
          importData = await fetchFromAsana(fetchOpts)
        }
        console.log(term.green("Fetched"), `${importData.projects.length} project(s)`)
        console.log(term.dim(`  Saved to ${basename(downloadDir)}/`))

        if (options.fetch) {
          console.log(term.green("Download:"), downloadDir)
          return
        }
      }

      // Stage 2: Download attachments
      const outDir = options.out ? resolve(options.out) : join(rootPath, "imports", "asana")
      const attachDir = join(rootPath, ".km", "imports", "attachments")
      // Relative path from markdown output dir to attachments dir
      const attachRelative = "../../.km/imports/attachments"

      const { downloadAttachments } = await import("../import/download-attachments.ts")
      const dlResult = await downloadAttachments(importData, {
        dir: attachDir,
        relativePath: attachRelative,
        dryRun: options.dryRun,
      })
      if (dlResult.downloaded > 0 || dlResult.failed > 0) {
        console.log(
          term.green(`  ${dlResult.downloaded} attachment(s) downloaded`),
          dlResult.skipped > 0 ? term.dim(`(${dlResult.skipped} cached)`) : "",
          dlResult.failed > 0 ? term.yellow(`(${dlResult.failed} failed)`) : "",
        )
      } else if (dlResult.skipped > 0) {
        console.log(term.dim(`  ${dlResult.skipped} attachment(s) cached`))
      }

      // Stage 3: Convert
      const convertResult = await steps({
        convert: () => convert(importData),
      }).run({ clear: true })
      const files: FileMap = convertResult.convert

      console.log(term.dim(`  ${files.size} file(s) to write`))

      // Stage 4: Write
      console.log(term.cyan(options.dryRun ? "Dry run:" : "Writing to"), outDir)

      const { written, skipped } = writeFiles(files, {
        outDir,
        dryRun: options.dryRun,
        force: options.force,
      })

      // Summary
      console.log()
      if (written.length > 0) {
        console.log(term.green(`${options.dryRun ? "Would write" : "Wrote"} ${written.length} file(s)`))
      }
      if (skipped.length > 0) {
        console.log(term.yellow(`Skipped ${skipped.length} file(s) (use --force to overwrite)`))
      }
      if (written.length === 0 && skipped.length === 0) {
        console.log(term.yellow("No files to write (empty import)"))
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(term.dim(`Done in ${elapsed}s`))
    })

  return cmd
}
