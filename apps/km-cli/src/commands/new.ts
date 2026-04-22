/**
 * New Command
 *
 * Quick capture - creates new task in inbox.md file
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { join } from "path"
import { parseTaskMetadata, extractTags, extractMentions } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"

/**
 * Format task metadata as inline fields
 */
function formatMetadata(options: { due?: string; start?: string; priority?: string; owner?: string }): string {
  const parts: string[] = []

  if (options.due) {
    parts.push(`due:${options.due}`)
  }
  if (options.start) {
    parts.push(`start:: ${options.start}`)
  }
  if (options.priority) {
    parts.push(`priority:: ${options.priority}`)
  }
  if (options.owner) {
    parts.push(`@${options.owner}`)
  }

  return parts.length > 0 ? " " + parts.join(" ") : ""
}

/**
 * Get the default inbox path
 */
function getInboxPath(rootPath: string): string {
  return join(rootPath, "inbox", "inbox.md")
}

export const newCommand = new Command("new")
  .description("Quick capture - create new task in inbox")
  .argument("<content...>", "Task content")
  .option("-n, --next", "Add to @next board after creation")
  .option("-p, --parent <target>", "Add to parent file (ID, path, or filename)")
  .option("-d, --due <date>", "Set due date (YYYY-MM-DD or 'today', 'tomorrow')")
  .option("-s, --start <date>", "Set start/scheduled date")
  .option("-o, --owner <user>", "Assign to user")
  .option("-P, --priority <n>", "Set priority (1-5)")
  .option("--json", "Output as JSON")
  .action(async (content, options) => {
    const rootPath = getRootPath() ?? process.cwd()
    using repo = await loadRepo(rootPath)
    const text = content.join(" ")

    // Parse any metadata already in the content
    const existingMetadata = parseTaskMetadata(text)
    const tags = extractTags(text)
    const mentions = extractMentions(text)

    // Build the task line
    const taskContent = text

    // Add metadata from options (if not already in content)
    const metadata = formatMetadata({
      due: options.due && !existingMetadata.dueAt ? options.due : undefined,
      start: options.start && !existingMetadata.startAt ? options.start : undefined,
      priority: options.priority && !existingMetadata.priority ? options.priority : undefined,
      owner: options.owner && !mentions.includes(options.owner) ? options.owner : undefined,
    })

    const taskLine = `- [ ] ${taskContent}${metadata}\n`

    // Determine target file
    let targetPath: string
    let targetName: string

    if (options.parent) {
      // Resolve parent path argument
      const resolvedParent = resolvePathArg(options.parent, rootPath)

      if (!resolvedParent.nodeRef) {
        console.error(term.red(`Cannot create task in a directory`))
        process.exit(1)
      }

      // Try to resolve parent by ID, path, or filename
      const parentNode = repo.resolveNode(resolvedParent.nodeRef)
      if (parentNode?.fs_path) {
        targetPath = parentNode.fs_path
        targetName = parentNode.fs_path.split("/").pop() || options.parent
      } else if (repo.pathExists(options.parent)) {
        // Try as relative path
        targetPath = join(repo.path, options.parent)
        targetName = options.parent
      } else {
        console.error(
          term.red(`Parent not found: ${options.parent}`),
          term.dim("\nUse ID, path, or filename (e.g., @next.md)"),
        )
        process.exit(1)
      }
    } else {
      // Default to inbox
      targetPath = getInboxPath(repo.path)
      targetName = "inbox"
    }

    // Append to target file via repo (handles directory/file creation)
    repo.appendTaskToFile(targetPath, taskLine, { ensure: true })

    if (options.json) {
      console.log(
        JSON.stringify({
          content: taskContent,
          file: targetPath,
          metadata: {
            due: options.due || existingMetadata.dueAt,
            start: options.start || existingMetadata.startAt,
            priority: options.priority || existingMetadata.priority,
            tags,
            mentions,
          },
        }),
      )
      return
    }

    console.log(term.green("✓"), `Added to ${targetName}: ${taskContent}`)

    // If --next flag, remind user to sync and add to @next
    if (options.next) {
      console.log(term.dim("  Hint: Run 'km sync' then 'km @next add' to add to board"))
    }
  })
