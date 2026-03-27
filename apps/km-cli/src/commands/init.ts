/**
 * Init Command
 *
 * Initialize km in a directory by creating .km/ folder.
 * Enables disk mode with full tracking.
 *
 * km init              # Create .km/ in cwd
 * km init ./path       # Create .km/ in ./path
 * km init gtd          # Create .km/ plus GTD folder structure in cwd
 * km --repo /path init # Uses --repo as target directory
 * km -r ./path init gtd # Create .km/ and GTD structure in ./path
 *
 * Note: This command intentionally uses fs directly because it creates the
 * .km/ directory before any store exists. This is the bootstrap operation.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { steps } from "@silvery/ag-react/ui/progress"
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { SyncManager, findKmRootFromPath } from "@km/storage"
import { formatPath } from "../utils/format-path.ts"
import { loadRepo } from "../load-repo.ts"

// ============================================
// Main Export - Init Command
// ============================================

export const initCommand = new Command("init")
  .description("Initialize km in a directory (enables disk mode, adds GTD by default)")
  .argument("[path]", "Target directory")
  .option("-f, --force", "Overwrite existing files")
  .option("--no-gtd", "Skip GTD folder structure")
  .option("--no-sync", "Skip initial sync")
  .action(async (pathArg, options, command) => {
    // Priority: --repo from parent > path arg > KM_ROOT env > cwd
    const parentOpts = command.parent?.opts() as { repo?: string } | undefined
    const globalRoot = parentOpts?.repo || process.env.KM_ROOT
    const targetDir = resolveTargetDir(pathArg ?? globalRoot)

    const kmDir = join(targetDir, ".km")

    // Check if .km/ already exists
    if (existsSync(kmDir) && !options.force) {
      console.log(term.yellow(`Already initialized: ${kmDir}`))
      console.log(term.dim("Use --force to reinitialize"))
      return
    }

    // Check if there's a .km/ in an ancestor directory
    const ancestorKm = findKmRootFromPath(dirname(targetDir))
    if (ancestorKm && !options.force) {
      console.log(term.yellow(`Found existing km repo at ${ancestorKm}`))
      console.log(term.yellow(`Creating a nested repo may cause conflicts. Consider using the parent repo instead.`))
      console.log(term.dim("Use --force to create a nested repo"))
      return
    }

    // Create .km/ directory
    mkdirSync(kmDir, { recursive: true })

    // --force: remove stale database so loadRepo starts fresh
    if (options.force) {
      const staleDb = join(kmDir, "state.db")
      if (existsSync(staleDb)) unlinkSync(staleDb)
    }

    // Create empty events.jsonl
    const eventsPath = join(kmDir, "events.jsonl")
    writeFileSync(eventsPath, "")

    console.log(term.bold("Initializing .km"), term.dim(`(repo ${formatPath(targetDir)})`))
    console.log(term.green("✓"), "Created .km/")

    // Add GTD structure by default (unless --no-gtd)
    if (options.gtd !== false) {
      createGtdStructure(targetDir, options.force ?? false)
    }

    // Sync by default (unless --no-sync)
    if (options.sync !== false) {
      // Initialize repo to set up database
      using repo = await loadRepo(targetDir)

      // Create SyncManager with the database from repo
      const manager = new SyncManager({
        db: repo.database,
        repoPath: targetDir,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "last_write_wins",
      })
      try {
        const results = await steps({
          syncFiles: () => manager.syncFromFsWithProgress(),
        }).run({ clear: true })

        const result = results.syncFiles as {
          processed: number
          directories: number
        }
        console.log(term.green("✓"), `Synced ${result.processed} file(s) in ${result.directories} directories`)
      } catch (error) {
        console.error("Sync failed:", error)
      }
    }

    console.log()
    console.log("Next steps:")
    console.log(term.cyan("  km tasks   ") + term.dim("# List tasks"))
    console.log(term.cyan("  km view    ") + term.dim("# Open kanban board"))
  })

// ============================================
// Helper Functions
// ============================================

/**
 * Resolve target directory from a path argument (expanding ~ and creating if needed).
 * Falls back to cwd if no path provided.
 */
function resolveTargetDir(pathArg: string | undefined): string {
  if (!pathArg) return resolve(process.cwd())
  const expanded = pathArg.startsWith("~") ? pathArg.replace("~", process.env.HOME || "") : pathArg
  const dir = resolve(expanded)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(term.dim(`Created directory: ${dir}`))
  }
  return dir
}

/**
 * Create GTD folder structure
 * Skips existing files unless force is true
 */
function createGtdStructure(targetDir: string, force: boolean): void {
  // Create folders (always safe)
  const inboxDir = join(targetDir, "inbox")
  const archiveDir = join(targetDir, "archive")

  if (!existsSync(inboxDir)) {
    mkdirSync(inboxDir, { recursive: true })
    console.log(term.dim(`  Created: inbox/`))
  }

  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true })
    console.log(term.dim(`  Created: archive/`))
  }

  // Create board files (skip if exists unless --force)
  const files: [string, string][] = [
    ["@next.md", GTD_NEXT_MD],
    ["@someday.md", GTD_SOMEDAY_MD],
  ]

  let skipped = false
  for (const [filename, content] of files) {
    const filepath = join(targetDir, filename)
    if (existsSync(filepath) && !force) {
      console.log(term.dim(`  Skipped: ${filename} (exists)`))
      skipped = true
    } else {
      writeFileSync(filepath, content)
      console.log(term.dim(`  Created: ${filename}`))
    }
  }

  if (skipped) {
    console.log(term.dim(`  Use --force to overwrite existing files`))
  }
}

// ============================================
// GTD Template Content
// ============================================

/**
 * GTD template content
 *
 * Boards are just .md files - the @ prefix is a naming convention.
 * Column rules (km.add::, km.sync::) are inline in the section heading.
 */
const GTD_NEXT_MD = `# Next Actions km.color:: cyan

## Inbox km.add:: ./inbox/** km.add:: due:past -status:done -status:dropped km.add:: due:today -status:done -status:dropped km.add:: due:week -status:done -status:dropped km.add:: start:past -status:done -status:dropped

## Next

## Waiting km.color:: yellow

## Done km.collapse:: true km.color:: green

## Removed km.collapse:: true km.removed:: true
`

const GTD_SOMEDAY_MD = `# Someday/Maybe km.color:: gray

## Ideas

## Projects

## Removed km.collapse:: true km.removed:: true
`
