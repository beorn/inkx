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
 */
function createGtdStructure(targetDir: string): void {
  // Create folders
  const inboxDir = join(targetDir, "inbox");
  const archiveDir = join(targetDir, "archive");

  mkdirSync(inboxDir, { recursive: true });
  mkdirSync(archiveDir, { recursive: true });

  // Create board files
  writeFileSync(join(targetDir, "@inbox.md"), GTD_INBOX_MD);
  writeFileSync(join(targetDir, "@next.md"), GTD_NEXT_MD);
  writeFileSync(join(targetDir, "@someday.md"), GTD_SOMEDAY_MD);

  console.log(chalk.dim(`  Created: inbox/`));
  console.log(chalk.dim(`  Created: archive/`));
  console.log(chalk.dim(`  Created: @inbox.md`));
  console.log(chalk.dim(`  Created: @next.md`));
  console.log(chalk.dim(`  Created: @someday.md`));
}

export const initCommand = new Command("init")
  .description("Initialize km in a directory (enables disk mode)")
  .argument("[path]", "Target directory or template (gtd)")
  .option("-f, --force", "Reinitialize even if .km/ exists")
  .action((templateArg, options, command) => {
    // Priority: --root from parent > KM_ROOT env > cwd
    // Note: For init, we resolve the path directly without requiring it to exist
    const globalRoot = command.parent?.opts()?.root || process.env.KM_ROOT;
    let targetDir: string;
    let template: string | undefined;

    // Detect if templateArg is actually a path (not "gtd")
    // If it's a path, use it as targetDir; otherwise treat as template
    if (templateArg && templateArg !== "gtd") {
      // Treat as path
      const expanded = templateArg.startsWith("~")
        ? templateArg.replace("~", process.env.HOME || "")
        : templateArg;
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
      template = templateArg; // "gtd" or undefined
    } else {
      targetDir = resolve(process.cwd());
      template = templateArg; // "gtd" or undefined
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

    // Handle template
    if (template === "gtd") {
      createGtdStructure(targetDir);
    }

    console.log();
    console.log("Next steps:");
    console.log(
      chalk.cyan("  km sync    ") + chalk.dim("# Scan and import .md files"),
    );
    console.log(chalk.cyan("  km tasks   ") + chalk.dim("# List tasks"));
    console.log(chalk.cyan("  km board   ") + chalk.dim("# Open kanban board"));
  });
