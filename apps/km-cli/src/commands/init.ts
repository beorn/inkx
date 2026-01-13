/**
 * Init Command
 *
 * Initialize km in a directory by creating .km/ folder.
 * Enables disk mode with full tracking.
 *
 * km init [path]       # Create .km/ in path (default: cwd)
 * km init gtd          # Create .km/ plus GTD folder structure
 * km --root /path init # Uses --root as target directory
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

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
  .argument("[template]", "Optional template: gtd")
  .option("-f, --force", "Reinitialize even if .km/ exists")
  .action((templateArg, options, command) => {
    // Priority: --root from parent > KM_ROOT env > cwd
    const globalRoot = command.parent?.opts()?.root || process.env.KM_ROOT;
    const targetDir = resolve(globalRoot ?? process.cwd());
    const kmDir = join(targetDir, ".km");

    // Check if .km/ already exists
    if (existsSync(kmDir) && !options.force) {
      console.log(chalk.yellow(`Already initialized: ${kmDir}`));
      console.log(chalk.dim("Use --force to reinitialize"));
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
    if (templateArg === "gtd") {
      createGtdStructure(targetDir);
    } else if (templateArg && templateArg !== "gtd") {
      console.log(
        chalk.yellow(`Unknown template: ${templateArg}. Available: gtd`),
      );
    }

    console.log();
    console.log("Next steps:");
    console.log(
      chalk.cyan("  km sync    ") + chalk.dim("# Scan and import .md files"),
    );
    console.log(chalk.cyan("  km tasks   ") + chalk.dim("# List tasks"));
    console.log(chalk.cyan("  km board   ") + chalk.dim("# Open kanban board"));
  });
