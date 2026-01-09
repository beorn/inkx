/**
 * Add Command
 *
 * Creates new tasks and nodes
 */

import { Command } from "commander";
import chalk from "chalk";
import { emitNodeCreated } from "../../node/emit.ts";
import { getNode, getNodeByPath } from "../../node/db.ts";
import { parseTaskMetadata, extractTags } from "../../md/parser.ts";
import type { TaskStatus } from "../../node/types.ts";

export const addCommand = new Command("add")
  .description("Add a new task")
  .argument("<content...>", "Task content")
  .option("-p, --parent <id>", "Parent node ID")
  .option("-s, --status <status>", "Initial status", "open")
  .option("-d, --due <date>", "Due date (YYYY-MM-DD)")
  .option("-P, --priority <n>", "Priority (1-5)")
  .option("-a, --assign <actor>", "Assign to actor")
  .option("--json", "Output as JSON")
  .action((content, options) => {
    const text = content.join(" ");

    // Parse metadata from content
    const metadata = parseTaskMetadata(text);
    const tags = extractTags(text);

    // Resolve parent
    let parentId: string | null = null;
    if (options.parent) {
      const parent = getNode(options.parent) ?? getNodeByPath(options.parent);
      if (!parent) {
        console.error(chalk.red(`Parent not found: ${options.parent}`));
        process.exit(1);
      }
      parentId = parent.id;
    }

    const event = emitNodeCreated(
      {
        type: "task",
        parent_id: parentId,
        content: text,
        task_status: (options.status || "open") as TaskStatus,
        task_mark: " ",
        due_date: options.due || metadata.dueDate,
        scheduled_date: metadata.scheduledDate,
        priority: options.priority
          ? parseInt(options.priority, 10)
          : metadata.priority,
        assigned_to: options.assign,
        data: tags.length > 0 ? { tags } : {},
      },
      process.env.USER ?? "user"
    );

    const nodeId = (event.data as { id: string }).id;

    if (options.json) {
      console.log(JSON.stringify({ id: nodeId, event: event.id }));
      return;
    }

    console.log(chalk.green("Created task:"), nodeId.slice(0, 8));
  });
