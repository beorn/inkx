/**
 * Init Command
 *
 * Initialize km in a directory by creating .km/ folder.
 * Enables disk mode with full tracking.
 *
 * km init [path]   # Create .km/ in path (default: cwd)
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

export const initCommand = new Command("init")
  .description("Initialize km in a directory (enables disk mode)")
  .argument("[path]", "Directory to initialize (default: current directory)")
  .option("-f, --force", "Reinitialize even if .km/ exists")
  .action((pathArg, options) => {
    const targetDir = resolve(pathArg ?? process.cwd());
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
      Bun.write(eventsPath, "");
    }

    console.log(chalk.green(`✓ Initialized km in ${targetDir}`));
    console.log(chalk.dim(`  Created: ${kmDir}/`));
    console.log();
    console.log("Next steps:");
    console.log(chalk.cyan("  km sync    ") + chalk.dim("# Scan and import .md files"));
    console.log(chalk.cyan("  km tasks   ") + chalk.dim("# List tasks"));
    console.log(chalk.cyan("  km board   ") + chalk.dim("# Open kanban board"));
  });
