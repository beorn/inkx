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
import type { ImportData, ImportProject } from "../import/types.ts"
import type { AsanaWorkspace } from "../import/adapters/asana-api.ts"
import { convertBatch, slugify } from "../import/convert.ts"
import { writeFiles } from "../import/write.ts"
import { getRootPath } from "../program.ts"
import { ensureAsanaSetup, resetAsanaConfig } from "./import-auth.ts"
import { printDiscovery } from "./import-discovery.ts"

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

function createAsanaCommand(): Command {
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
          const parsed = JSON.parse(json)

          if (parsed.source && parsed.projects) {
            // Full ImportData (multi-project)
            importData = parsed as ImportData
            logImportSuccess("Loaded", importData.projects.length, options.from)
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

      // Stage 3+4: Convert and write (streaming, one project at a time)
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
