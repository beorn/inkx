/**
 * Init Command
 *
 * Initialize km in a directory by creating .km/ folder.
 * Enables disk mode with full tracking.
 *
 * km init              # Create .km/ in cwd
 * km init ./path       # Create .km/ in ./path
 * km init gtd          # Create .km/ plus GTD folder structure in cwd
 * km --root /path init # Uses --root as target directory
 * km -r ./path init gtd # Create .km/ and GTD structure in ./path
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

/**
 * Search for .km/ in ancestors of the given directory
 * Returns the path to the ancestor .km/ if found, undefined otherwise
 */
function findAncestorKmDir(startDir: string): string | undefined {
  let current = dirname(startDir);

  while (current !== dirname(current)) {
    // Stop at filesystem root
    const kmPath = join(current, ".km");
    if (existsSync(kmPath)) {
      return kmPath;
    }
    current = dirname(current);
  }

  return undefined;
}

/**
 * GTD template content
 */
const GTD_INBOX_MD = `---
title: Inbox
type: board
add: ./inbox/**
---

# Inbox

Unprocessed items awaiting triage.
`;

const GTD_NEXT_MD = `---
title: Next Actions
type: board
---

# Next Actions

## Today

Items to focus on today.

## This Week

Items to complete this week.

## Waiting

Items waiting on someone/something.
`;

const GTD_SOMEDAY_MD = `---
title: Someday/Maybe
type: board
---

# Someday/Maybe

Ideas and projects for the future.
`;

/**
 * Create GTD folder structure
 * Skips existing files unless force is true
 */
function createGtdStructure(targetDir: string, force: boolean): void {
  // Create folders (always safe)
  const inboxDir = join(targetDir, "inbox");
  const archiveDir = join(targetDir, "archive");

  if (!existsSync(inboxDir)) {
    mkdirSync(inboxDir, { recursive: true });
    console.log(chalk.dim(`  Created: inbox/`));
  }

  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
    console.log(chalk.dim(`  Created: archive/`));
  }

  // Create board files (skip if exists unless --force)
  const files: [string, string][] = [
    ["@inbox.md", GTD_INBOX_MD],
    ["@next.md", GTD_NEXT_MD],
    ["@someday.md", GTD_SOMEDAY_MD],
  ];

  let skipped = false;
  for (const [filename, content] of files) {
    const filepath = join(targetDir, filename);
    if (existsSync(filepath) && !force) {
      console.log(chalk.dim(`  Skipped: ${filename} (exists)`));
      skipped = true;
    } else {
      writeFileSync(filepath, content);
      console.log(chalk.dim(`  Created: ${filename}`));
    }
  }

  if (skipped) {
    console.log(chalk.dim(`  Use --force to overwrite existing files`));
  }
}

export const initCommand = new Command("init")
  .description(
    "Initialize km in a directory (enables disk mode, adds GTD by default)",
  )
  .argument("[path]", "Target directory")
  .option("-f, --force", "Overwrite existing files")
  .option("--no-gtd", "Skip GTD folder structure")
  .action((pathArg, options, command) => {
    // Priority: --root from parent > path arg > KM_ROOT env > cwd
    const globalRoot = command.parent?.opts()?.root || process.env.KM_ROOT;
    let targetDir: string;

    if (pathArg) {
      // Path argument provided
      const expanded = pathArg.startsWith("~")
        ? pathArg.replace("~", process.env.HOME || "")
        : pathArg;
      targetDir = resolve(expanded);

      // Create target directory if it doesn't exist
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
        console.log(chalk.dim(`Created directory: ${targetDir}`));
      }
    } else if (globalRoot) {
      // Expand ~ and resolve to absolute path
      const expanded = globalRoot.startsWith("~")
        ? globalRoot.replace("~", process.env.HOME || "")
        : globalRoot;
      targetDir = resolve(expanded);

      // Create target directory if it doesn't exist
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
        console.log(chalk.dim(`Created directory: ${targetDir}`));
      }
    } else {
      targetDir = resolve(process.cwd());
    }

    const kmDir = join(targetDir, ".km");

    // Check if .km/ already exists
    if (existsSync(kmDir) && !options.force) {
      console.log(chalk.yellow(`Already initialized: ${kmDir}`));
      console.log(chalk.dim("Use --force to reinitialize"));
      return;
    }

    // Check if there's a .km/ in an ancestor directory
    const ancestorKm = findAncestorKmDir(targetDir);
    if (ancestorKm && !options.force) {
      console.log(chalk.yellow(`Found existing km vault at ${ancestorKm}`));
      console.log(
        chalk.yellow(
          `Creating a nested vault may cause conflicts. Consider using the parent vault instead.`,
        ),
      );
      console.log(chalk.dim("Use --force to create a nested vault"));
      return;
    }

    // Create .km/ directory
    mkdirSync(kmDir, { recursive: true });

    // Create empty events.jsonl
    const eventsPath = join(kmDir, "events.jsonl");
    if (!existsSync(eventsPath)) {
      writeFileSync(eventsPath, "");
    }

    console.log(chalk.green(`Initialized km in ${targetDir}`));
    console.log(chalk.dim(`  Created: ${kmDir}/`));

    // Add GTD structure by default (unless --no-gtd)
    if (options.gtd !== false) {
      createGtdStructure(targetDir, options.force);
    }

    console.log();
    console.log("Next steps:");
    console.log(
      chalk.cyan("  km sync    ") + chalk.dim("# Scan and import .md files"),
    );
    console.log(chalk.cyan("  km tasks   ") + chalk.dim("# List tasks"));
    console.log(chalk.cyan("  km board   ") + chalk.dim("# Open kanban board"));
  });
