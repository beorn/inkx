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

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from "fs"
import { basename, join, resolve } from "path"
import { Command } from "@commander-js/extra-typings"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)

import { steps, step } from "@silvery/ag-react/ui/progress"
import { CURSOR_SHOW, write } from "@silvery/ag-react/ui/cli"
import type { ImportData, ImportProject } from "../import/types.ts"
import type { AsanaWorkspace } from "../import/adapters/asana/asana-api.ts"
import { convertBatch, slugify } from "../import/convert.ts"
import { writeFiles } from "../import/write.ts"
import { getRootPath } from "../program.ts"
import { ensureAsanaSetup, resetAsanaConfig } from "./import-auth.ts"
import { printDiscovery } from "./import-discovery.ts"

export const importCommand = new Command("import")
  .description("Import tasks from external tools (Asana, CSV, etc.)")
  .addCommand(createAsanaCommand())
  .addCommand(createCsvCommand())

// ============================================================================
// Download directory helpers
// ============================================================================

/** Load ImportData from a download directory (one JSON file per project) */
function loadDownloadDir(dirPath: string): ImportData {
  const dirName = basename(dirPath)
  // Parse: asana-stabell-2026-02-17T15-09-50 → source="asana", timestamp
  // Timestamp is always the last 19 chars: YYYY-MM-DDTHH-MM-SS
  const dashIdx = dirName.indexOf("-")
  const source = dirName.slice(0, dashIdx) // "asana"
  const tsRaw = dirName.slice(-19) // "2026-02-17T15-09-50"
  const fetchedAt = tsRaw.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3") + "Z"

  const files = readdirSync(dirPath)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
  const projects = files.map((f) => JSON.parse(readFileSync(join(dirPath, f), "utf-8")) as ImportProject)

  const data: ImportData = { source, fetchedAt, projects }

  // Load workspace metadata if available
  const wsPath = join(dirPath, "_workspace.json")
  if (existsSync(wsPath)) {
    const ws = JSON.parse(readFileSync(wsPath, "utf-8")) as {
      name?: string
      users?: ImportData["users"]
      teams?: ImportData["teams"]
      user?: { gid?: string }
    }
    data.workspace = ws.name
    data.users = ws.users
    data.teams = ws.teams
    data.importingUserGid = ws.user?.gid
  }

  return data
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
// Logging helpers
// ============================================================================

/** Log a consistent import success message: "Action N project(s) from source" */
function logImportSuccess(action: string, count: number, source?: string): void {
  const suffix = source ? ` from ${source}` : ""
  console.log(term.green(action), `${count} project(s)${suffix}`)
}

// ============================================================================
// Command
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- commander infers complex generic types
function createAsanaCommand(): Command<any[], any, any> {
  const cmd = new Command("asana")
    .description("Import from Asana")
    .addHelpText(
      "after",
      `
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
`,
    )
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
        resetAsanaConfig()
        await ensureAsanaSetup(options.authToken)
        return
      }

      const startTime = Date.now()
      let importData: ImportData
      let asanaToken: string | undefined

      if (options.from) {
        // --from: load from a specific file or directory
        const filePath = resolve(options.from)
        if (!existsSync(filePath)) {
          console.error(term.red(`Not found: ${filePath}`))
          process.exit(1)
        }

        if (statSync(filePath).isDirectory()) {
          importData = loadDownloadDir(filePath)
          logImportSuccess("Loaded", importData.projects.length, `${options.from}/`)
        } else {
          const json = readFileSync(filePath, "utf-8")
          const parsed = JSON.parse(json) as Record<string, unknown>

          if (parsed.source && parsed.projects) {
            // Full ImportData (multi-project)
            importData = parsed as unknown as ImportData
            logImportSuccess("Loaded", importData.projects.length, options.from)
          } else if (parsed.sourceId && parsed.title) {
            // Single ImportProject from download directory
            const project = parsed as unknown as ImportProject
            importData = {
              source: "asana",
              fetchedAt: new Date().toISOString(),
              projects: [project],
            }
            console.log(term.green("Loaded"), `1 project from ${options.from}: ${project.title}`)
          } else {
            const { parseAsanaFile } = await import("../import/adapters/asana/asana-file.ts")
            const result = await steps({
              parseExport: () => parseAsanaFile(json),
            }).run({ clear: true })
            importData = result.parseExport
            logImportSuccess("Parsed", importData.projects.length, options.from)
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
        logImportSuccess("Loaded", importData.projects.length, `${latest}/`)
      } else {
        // API mode — setup if needed, then fetch
        if (options.auth) {
          resetAsanaConfig()
        }

        const { token, workspace: configWorkspace } = await ensureAsanaSetup(options.authToken)
        asanaToken = token
        const { fetchFromAsana, resolveAsanaWorkspace } = await import("../import/adapters/asana/asana-api.ts")

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
          includeCommentLogs: options.includeCommentLogs, // Only system logs are opt-in
          includeUserTaskLists: true,
          includeTagTaskLists: true,
          workspace: resolved.name,
        }

        const result = await fetchFromAsana({ ...fetchOpts, record: true })
        importData = result.data
        logImportSuccess("Fetched", importData.projects.length)
        console.log(term.dim(`  Saved to ${basename(downloadDir)}/`))

        if (options.fetch) {
          console.log(term.green("Download:"), downloadDir)
          return
        }
      }

      // Pipeline: Download attachments → Convert & write → Copy attachments
      const outDir = options.out ? resolve(options.out) : join(rootPath, "imports", "asana")
      const attachDir = join(rootPath, ".km", "imports", "attachments")

      const { downloadAttachments } = await import("../import/download-attachments.ts")

      const results = await steps({
        downloadAttachments: async () => {
          const dlResult = await downloadAttachments(importData, {
            dir: attachDir,
            relativePath: ".attachments",
            dryRun: options.dryRun,
            refreshUrl: asanaToken
              ? async (att) => {
                  if (!att.sourceId) return null
                  try {
                    const res = await fetch(
                      `https://app.asana.com/api/1.0/attachments/${att.sourceId}?opt_fields=download_url`,
                      { headers: { Authorization: `Bearer ${asanaToken}` } },
                    )
                    if (!res.ok) return null
                    const json = (await res.json()) as { data?: { download_url?: string } }
                    return json.data?.download_url ?? null
                  } catch {
                    return null
                  }
                }
              : undefined,
            onProgress: (current, total) => step().progress(current, total),
          })
          return dlResult
        },
        convertAndWrite: () => {
          const { written, skipped } = writeFiles(convertBatch(importData), {
            outDir,
            dryRun: options.dryRun,
            force: options.force,
          })
          return { written, skipped }
        },
        copyAttachments: () => {
          if (options.dryRun || !existsSync(attachDir)) return 0
          const outAttachDir = join(outDir, ".attachments")
          mkdirSync(outAttachDir, { recursive: true })
          const files = readdirSync(attachDir)
          let copied = 0
          for (const f of files) {
            const src = join(attachDir, f)
            const dst = join(outAttachDir, f)
            if (!existsSync(dst)) {
              copyFileSync(src, dst)
              copied++
            }
          }
          return copied
        },
      }).run({ clear: true })

      // Summary
      const dlResult = results.downloadAttachments
      const { written, skipped } = results.convertAndWrite
      const copied = results.copyAttachments

      if (dlResult.downloaded > 0 || dlResult.failed > 0) {
        console.log(
          term.green(`  ${dlResult.downloaded} downloaded`),
          dlResult.skipped > 0 ? term.dim(`(${dlResult.skipped} cached)`) : "",
          dlResult.failed > 0 ? term.yellow(`(${dlResult.failed} failed)`) : "",
        )
      }
      if (copied > 0) {
        console.log(term.dim(`  Copied ${copied} attachment(s) to output`))
      }

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

// ============================================================================
// CSV Command
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- commander infers complex generic types
function createCsvCommand(): Command<any[], any, any> {
  const cmd = new Command("csv")
    .description("Import from CSV or TSV file")
    .addHelpText(
      "after",
      `
Pipeline:
  1. Parse    CSV/TSV → ImportData (auto-detects delimiter)
  2. Convert  ImportData → markdown files
  3. Write    Markdown → <root>/imports/csv/ (or --out)

Expected columns (case-insensitive, all optional except title):
  title (or name, task)  — Task title (required)
  status                 — todo, done, wip, blocked, dropped
  body (or description)  — Task body text
  assignee               — @mention name
  due (or due_date)      — Due date (YYYY-MM-DD)
  start (or start_date)  — Start date
  priority (or p)        — 1-4
  tags (or labels)       — Comma-separated tags
  project (or section)   — Groups tasks into sections
  parent                 — Parent task title (for hierarchy)
  id (or source_id)      — Unique identifier
`,
    )
    .argument("<file>", "CSV or TSV file to import")
    .argument("[root]", "km repository root (default: auto-detect)")
    .option("-o, --out <dir>", "Output directory (default: <root>/imports/csv/)")
    .option("--dry-run", "Preview without writing")
    .option("--force", "Overwrite existing files")
    .action(async (file, root, options) => {
      const startTime = Date.now()

      const filePath = resolve(file)
      if (!existsSync(filePath)) {
        console.error(term.red(`Not found: ${filePath}`))
        process.exit(1)
      }

      const rootPath = root ? resolve(root) : getRootPath()
      if (!rootPath) {
        console.error(term.red("No km repository found. Specify a root path or run from a km repo."))
        process.exit(1)
      }

      // Stage 1: Parse CSV
      const { parseCSVToImportData } = await import("../import/adapters/csv-adapter.ts")
      const content = readFileSync(filePath, "utf-8")
      const importData = parseCSVToImportData(content, filePath)

      if (importData.projects.length === 0) {
        console.log(term.yellow("No data found in CSV file"))
        return
      }

      const totalItems = importData.projects.reduce((n, p) => {
        const sectionItems = (p.sections ?? []).reduce((sn, s) => sn + s.items.length, 0)
        return n + (p.items?.length ?? 0) + sectionItems
      }, 0)
      console.log(term.green("Parsed"), `${totalItems} item(s) from ${basename(filePath)}`)

      // Stage 2+3: Convert and write
      const outDir = options.out ? resolve(options.out) : join(rootPath, "imports", "csv")
      console.log(term.cyan(options.dryRun ? "Dry run:" : "Writing to"), outDir)

      const { written, skipped } = writeFiles(convertBatch(importData), {
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
