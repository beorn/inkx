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

import { Command } from "@commander-js/extra-typings"
import chalk from "chalk"
import { steps } from "@beorn/inkx-ui/progress"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { SyncManager } from "@km/storage"
import { formatPath } from "../utils/format-path.ts"
import { loadRepo } from "../load-repo.ts"

/**
 * Search for .km/ in ancestors of the given directory
 * Returns the path to the ancestor .km/ if found, undefined otherwise
 */
function findAncestorKmDir(startDir: string): string | undefined {
  let current = dirname(startDir)

  while (current !== dirname(current)) {
    // Stop at filesystem root
    const kmPath = join(current, ".km")
    if (existsSync(kmPath)) {
      return kmPath
    }
    current = dirname(current)
  }

  return undefined
}

/**
 * GTD template content
 *
 * Boards are just .md files - the @ prefix is a naming convention.
 * Column rules (add=, sync=) are inline in the section heading.
 */
const GTD_INBOX_MD = `# Inbox color=white

## Unprocessed add="./inbox/**"

## Processing
`

const GTD_NEXT_MD = `# Next Actions color=cyan

## Processing default=true

## Next

## Doing

## Waiting color=yellow

## Done collapse=true color=green
`

const GTD_SOMEDAY_MD = `# Someday/Maybe color=gray

## Ideas

## Projects
`

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
    console.log(chalk.dim(`  Created: inbox/`))
  }

  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true })
    console.log(chalk.dim(`  Created: archive/`))
  }

  // Create board files (skip if exists unless --force)
  const files: [string, string][] = [
    ["@inbox.md", GTD_INBOX_MD],
    ["@next.md", GTD_NEXT_MD],
    ["@someday.md", GTD_SOMEDAY_MD],
  ]

  let skipped = false
  for (const [filename, content] of files) {
    const filepath = join(targetDir, filename)
    if (existsSync(filepath) && !force) {
      console.log(chalk.dim(`  Skipped: ${filename} (exists)`))
      skipped = true
    } else {
      writeFileSync(filepath, content)
      console.log(chalk.dim(`  Created: ${filename}`))
    }
  }

  if (skipped) {
    console.log(chalk.dim(`  Use --force to overwrite existing files`))
  }
}

export const initCommand = new Command("init")
  .description(
    "Initialize km in a directory (enables disk mode, adds GTD by default)",
  )
  .argument("[path]", "Target directory")
  .option("-f, --force", "Overwrite existing files")
  .option("--no-gtd", "Skip GTD folder structure")
  .option("--no-sync", "Skip initial sync")
  .action(async (pathArg, options, command) => {
    // Priority: --repo from parent > path arg > KM_ROOT env > cwd
    const globalRoot = command.parent?.opts()?.repo || process.env.KM_ROOT
    let targetDir: string

    if (pathArg) {
      // Path argument provided
      const expanded = pathArg.startsWith("~")
        ? pathArg.replace("~", process.env.HOME || "")
        : pathArg
      targetDir = resolve(expanded)

      // Create target directory if it doesn't exist
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
        console.log(chalk.dim(`Created directory: ${targetDir}`))
      }
    } else if (globalRoot) {
      // Expand ~ and resolve to absolute path
      const expanded = globalRoot.startsWith("~")
        ? globalRoot.replace("~", process.env.HOME || "")
        : globalRoot
      targetDir = resolve(expanded)

      // Create target directory if it doesn't exist
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
        console.log(chalk.dim(`Created directory: ${targetDir}`))
      }
    } else {
      targetDir = resolve(process.cwd())
    }

    const kmDir = join(targetDir, ".km")

    // Check if .km/ already exists
    if (existsSync(kmDir) && !options.force) {
      console.log(chalk.yellow(`Already initialized: ${kmDir}`))
      console.log(chalk.dim("Use --force to reinitialize"))
      return
    }

    // Check if there's a .km/ in an ancestor directory
    const ancestorKm = findAncestorKmDir(targetDir)
    if (ancestorKm && !options.force) {
      console.log(chalk.yellow(`Found existing km repo at ${ancestorKm}`))
      console.log(
        chalk.yellow(
          `Creating a nested repo may cause conflicts. Consider using the parent repo instead.`,
        ),
      )
      console.log(chalk.dim("Use --force to create a nested repo"))
      return
    }

    // Create .km/ directory
    mkdirSync(kmDir, { recursive: true })

    // Create empty events.jsonl
    const eventsPath = join(kmDir, "events.jsonl")
    if (!existsSync(eventsPath)) {
      writeFileSync(eventsPath, "")
    }

    console.log(
      chalk.bold("Initializing .km"),
      chalk.dim(`(repo ${formatPath(targetDir)})`),
    )
    console.log(chalk.green("✓"), "Created .km/")

    // Add GTD structure by default (unless --no-gtd)
    if (options.gtd !== false) {
      createGtdStructure(targetDir, options.force)
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
          syncFiles: () => manager.syncFromFs(),
        }).run({ clear: true })

        const result = results.syncFiles as {
          processed: number
          directories: number
        }
        console.log(
          chalk.green("✓"),
          `Synced ${result.processed} file(s) in ${result.directories} directories`,
        )
      } catch (error) {
        console.error("Sync failed:", error)
      }
    }

    console.log()
    console.log("Next steps:")
    console.log(chalk.cyan("  km tasks   ") + chalk.dim("# List tasks"))
    console.log(chalk.cyan("  km view    ") + chalk.dim("# Open kanban board"))
  })
