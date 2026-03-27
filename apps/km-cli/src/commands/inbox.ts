/**
 * Inbox Command
 *
 * GTD-style inbox processing
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { isItem, isOutline } from "@km/core"
import { loadRepo } from "../load-repo.ts"
import * as readline from "readline"

export const inboxCommand = new Command("inbox")
  .description("GTD-style inbox processing")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    using repo = await loadRepo(process.cwd())

    // List inbox items
    const inbox = repo.resolveNode("inbox")
    if (!inbox) {
      if (options.json) {
        console.log(JSON.stringify({ items: [], count: 0 }))
      } else {
        console.log(term.yellow("No inbox found. Create an inbox/ folder."))
      }
      return
    }

    // Get all tasks in inbox
    const items = repo
      .getChildren(inbox.id)
      .filter((n) => isItem(n.type, n.item) && !isOutline(n.type, n.item) && n.task_marker !== undefined)

    if (items.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ items: [], count: 0 }))
      } else {
        console.log(term.green("Inbox is empty!"))
      }
      return
    }

    if (options.json) {
      console.log(
        JSON.stringify({
          items: items.map((i) => ({ id: i.id, content: i.content })),
          count: items.length,
        }),
      )
    } else {
      console.log(term.bold(`Inbox (${items.length} items):\n`))
      for (const item of items) {
        console.log(`  ${term.dim(item.id.slice(0, 7))} ${item.content}`)
      }
    }
  })

// Subcommand: inbox process - interactive processing
inboxCommand
  .command("process")
  .description("Interactive inbox processing")
  .action(async () => {
    using repo = await loadRepo(process.cwd())
    const inbox = repo.resolveNode("inbox")

    if (!inbox) {
      console.log(term.yellow("No inbox found. Create an inbox/ folder."))
      return
    }

    // Get all tasks in inbox
    const items = repo
      .getChildren(inbox.id)
      .filter((n) => isItem(n.type, n.item) && !isOutline(n.type, n.item) && n.task_marker !== undefined)

    if (items.length === 0) {
      console.log(term.green("Inbox is empty!"))
      return
    }

    // Find target destinations
    const nextNode = repo.resolveNode("next")
    const somedayNode = repo.resolveNode("someday")

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const question = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, resolve)
      })
    }

    console.log(term.bold("\nInbox Processing\n"))
    console.log("Keys: [n]ext  [s]omeday  [d]one  [D]elete  [q]uit\n")

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item) continue

      console.log(term.dim(`\nItem ${i + 1} of ${items.length}:`))
      console.log(term.bold(item.content || "(no content)"))

      let processed = false
      while (!processed) {
        const answer = await question("\n> ")
        const key = answer.toLowerCase().trim()

        switch (key) {
          case "n": // Move to next
            if (nextNode) {
              repo.moveNode(item.id, nextNode.id, 0)
              console.log(term.green("→ Moved to @next"))
            } else {
              console.log(term.yellow("No @next board found"))
              continue
            }
            processed = true
            break

          case "s": // Move to someday
            if (somedayNode) {
              repo.moveNode(item.id, somedayNode.id, 0)
              console.log(term.green("→ Moved to @someday"))
            } else {
              console.log(term.yellow("No @someday board found"))
              continue
            }
            processed = true
            break

          case "d": // Mark done
            repo.updateNode(item.id, {
              task_status: "done",
              task_marker: "[x]",
            })
            console.log(term.green("✓ Marked done"))
            processed = true
            break

          case "D": // Delete (drop)
            repo.updateNode(item.id, {
              task_status: "dropped",
              task_marker: "[-]",
            })
            console.log(term.red("✗ Dropped"))
            processed = true
            break

          case "q": // Quit
            console.log(term.dim("\nQuitting..."))
            rl.close()
            return

          case "?": // Help
            console.log("\nKeys:")
            console.log("  [n] Move to @next board")
            console.log("  [s] Move to @someday board")
            console.log("  [d] Mark as done")
            console.log("  [D] Delete/drop item")
            console.log("  [q] Quit processing")
            break

          default:
            console.log(term.dim("Unknown key. Press ? for help."))
        }
      }
    }

    rl.close()
    console.log(term.green("\n✓ Inbox processing complete!"))
  })

// Subcommand: inbox new <content> - create new item in inbox
inboxCommand
  .command("new")
  .description("Create new item in inbox")
  .argument("<content...>", "Task content")
  .option("--json", "Output as JSON")
  .action(async (content: string[], options: { json?: boolean }) => {
    using repo = await loadRepo(process.cwd())
    const inbox = repo.resolveNode("inbox")

    if (!inbox) {
      console.error(term.red("No inbox found. Create an inbox/ folder."))
      process.exit(1)
    }

    const taskContent = content.join(" ")

    // Find file path for inbox to append to
    const inboxPath = inbox.fs_path
    if (!inboxPath) {
      console.error(term.red("Inbox has no file path"))
      process.exit(1)
    }

    // Use repo method to append task
    repo.appendTaskToFile(inboxPath, taskContent)

    if (options.json) {
      console.log(JSON.stringify({ created: true, content: taskContent }))
    } else {
      console.log(term.green("+ Created in inbox:"), taskContent)
    }
  })
