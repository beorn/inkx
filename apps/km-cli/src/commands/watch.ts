/**
 * Watch Command
 *
 * Start the filesystem watcher daemon
 */

import { Command } from "commander";
import chalk from "chalk";
import { SyncManager } from "@km/watch";
import { getKmDir } from "@km/core";
import { dirname } from "path";

export const watchCommand = new Command("watch")
  .description("Start watching for filesystem changes")
  .argument("[path]", "Path to watch (default: vault root)")
  .option("--debounce <ms>", "Debounce interval in ms", "5000")
  .action(async (path, options) => {
    const vaultPath = path ?? dirname(getKmDir());
    const debounceMs = parseInt(options.debounce, 10);

    console.log(chalk.dim(`Watching: ${vaultPath}`));
    console.log(chalk.dim(`Debounce: ${debounceMs}ms`));
    console.log(chalk.dim("Press Ctrl+C to stop\n"));

    const manager = new SyncManager({
      vaultPath,
      debounceFs: debounceMs,
      debounceApply: 3000,
      conflictStrategy: "last_write_wins",
    });

    manager.on("ready", () => {
      console.log(chalk.green("✓"), "Watcher ready");
    });

    manager.on("state-change", (state) => {
      console.log(chalk.dim(`State: ${state}`));
    });

    manager.on("write-complete", (data) => {
      console.log(
        chalk.green("✓"),
        `Wrote ${data.count} file(s)`,
        data.errors > 0 ? chalk.red(`(${data.errors} error(s))`) : "",
      );
    });

    manager.on("write-errors", (errors) => {
      for (const { path, error } of errors) {
        console.error(chalk.red("✗"), path, error.message);
      }
    });

    manager.on("error", (error) => {
      console.error(chalk.red("Error:"), error);
    });

    // Start watching
    manager.start();

    // Handle shutdown
    process.on("SIGINT", () => {
      console.log(chalk.dim("\nStopping watcher..."));
      void manager.stop().then(() => process.exit(0));
    });

    process.on("SIGTERM", () => {
      void manager.stop().then(() => process.exit(0));
    });
  });
