/**
 * New Command
 *
 * Quick capture - creates new task in inbox.md file
 */

import { Command } from "commander";
import chalk from "chalk";
import { join } from "path";
import {
  getStore,
  resolveNode,
  parseTaskMetadata,
  extractTags,
  extractMentions,
  resolvePathArg,
  ensureState,
} from "@km/storage";
import { getRootPath } from "../index.ts";

/**
 * Format task metadata as inline fields
 */
function formatMetadata(options: {
  due?: string;
  start?: string;
  priority?: string;
  owner?: string;
}): string {
  const parts: string[] = [];

  if (options.due) {
    parts.push(`due:${options.due}`);
  }
  if (options.start) {
    parts.push(`start:${options.start}`);
  }
  if (options.priority) {
    parts.push(`p:${options.priority}`);
  }
  if (options.owner) {
    parts.push(`@${options.owner}`);
  }

  return parts.length > 0 ? " " + parts.join(" ") : "";
}

/**
 * Get the default inbox path
 */
function getInboxPath(rootPath: string): string {
  return join(rootPath, "inbox", "inbox.md");
}

export const newCommand = new Command("new")
  .description("Quick capture - create new task in inbox")
  .argument("<content...>", "Task content")
  .option("-n, --next", "Add to @next board after creation")
  .option("-p, --parent <target>", "Add to parent file (ID, path, or filename)")
  .option(
    "-d, --due <date>",
    "Set due date (YYYY-MM-DD or 'today', 'tomorrow')",
  )
  .option("-s, --start <date>", "Set start/scheduled date")
  .option("-o, --owner <user>", "Assign to user")
  .option("-P, --priority <n>", "Set priority (1-5)")
  .option("--json", "Output as JSON")
  .action((content, options) => {
    const store = getStore();
    const text = content.join(" ");

    // Parse any metadata already in the content
    const existingMetadata = parseTaskMetadata(text);
    const tags = extractTags(text);
    const mentions = extractMentions(text);

    // Build the task line
    const taskContent = text;

    // Add metadata from options (if not already in content)
    const metadata = formatMetadata({
      due: options.due && !existingMetadata.dueDate ? options.due : undefined,
      start:
        options.start && !existingMetadata.scheduledDate
          ? options.start
          : undefined,
      priority:
        options.priority && !existingMetadata.priority
          ? options.priority
          : undefined,
      owner:
        options.owner && !mentions.includes(options.owner)
          ? options.owner
          : undefined,
    });

    const taskLine = `- [ ] ${taskContent}${metadata}\n`;

    // Determine target file
    let targetPath: string;
    let targetName: string;

    if (options.parent) {
      // Resolve parent path argument
      const resolvedParent = resolvePathArg(options.parent, getRootPath());
      ensureState(resolvedParent.vaultRoot, false);

      if (!resolvedParent.nodeRef) {
        console.error(chalk.red(`Cannot create task in a directory`));
        process.exit(1);
      }

      // Try to resolve parent by ID, path, or filename
      const parentNode = resolveNode(resolvedParent.nodeRef);
      if (parentNode && parentNode.fs_path) {
        targetPath = parentNode.fs_path;
        targetName = parentNode.fs_path.split("/").pop() || options.parent;
      } else if (store.pathExists(options.parent)) {
        // Try as relative path
        targetPath = join(store.rootPath, options.parent);
        targetName = options.parent;
      } else {
        console.error(
          chalk.red(`Parent not found: ${options.parent}`),
          chalk.dim("\nUse ID, path, or filename (e.g., @next.md)"),
        );
        process.exit(1);
      }
    } else {
      // Default to inbox
      targetPath = getInboxPath(store.rootPath);
      targetName = "inbox";
    }

    // Append to target file via store (handles directory/file creation)
    store.appendTaskToFile(targetPath, taskLine, { ensure: true });

    if (options.json) {
      console.log(
        JSON.stringify({
          content: taskContent,
          file: targetPath,
          metadata: {
            due: options.due || existingMetadata.dueDate,
            start: options.start || existingMetadata.scheduledDate,
            priority: options.priority || existingMetadata.priority,
            tags,
            mentions,
          },
        }),
      );
      return;
    }

    console.log(chalk.green("✓"), `Added to ${targetName}: ${taskContent}`);

    // If --next flag, remind user to sync and add to @next
    if (options.next) {
      console.log(
        chalk.dim("  Hint: Run 'km sync' then 'km @next add' to add to board"),
      );
    }
  });
