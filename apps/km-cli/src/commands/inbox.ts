/**
 * Inbox Command
 *
 * GTD-style inbox processing
 */

import { Command } from "commander"
import chalk from "chalk"
import { runGenerator, createVault, resolveNode } from "@km/storage"
import * as readline from "readline"

/**
 * Get the inbox node (or default to ./inbox folder)
 */
function getInboxNode() {
  // Try to find @inbox or inbox folder
  const inbox = resolveNode("inbox")
  return inbox
}

export const inboxCommand = new Command("inbox")
  .description("GTD-style inbox processing")
  .option("--json", "Output as JSON")
  .action((options: { json?: boolean }) => {
    using vault = runGenerator(createVault())

    // List inbox items
    const inbox = getInboxNode()
    if (!inbox) {
      if (options.json) {
        console.log(JSON.stringify({ items: [], count: 0 }))
      } else {
        console.log(chalk.yellow("No inbox found. Create an inbox/ folder."))
      }
      return
    }

    // Get all tasks in inbox
    const items = vault.getChildren(inbox.id).filter((n) => n.type === "task")

    if (items.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ items: [], count: 0 }))
      } else {
        console.log(chalk.green("Inbox is empty!"))
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
      console.log(chalk.bold(`Inbox (${items.length} items):\n`))
      for (const item of items) {
        console.log(`  ${chalk.dim(item.id.slice(0, 7))} ${item.content}`)
      }
    }
  })

// Subcommand: inbox process - interactive processing
inboxCommand
  .command("process")
  .description("Interactive inbox processing")
  .action(async () => {
    using vault = runGenerator(createVault())
    const inbox = getInboxNode()

    if (!inbox) {
      console.log(chalk.yellow("No inbox found. Create an inbox/ folder."))
      return
    }

    // Get all tasks in inbox
    const items = vault.getChildren(inbox.id).filter((n) => n.type === "task")

    if (items.length === 0) {
      console.log(chalk.green("Inbox is empty!"))
      return
    }

    // Find target destinations
    const nextNode = resolveNode("next")
    const somedayNode = resolveNode("someday")

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const question = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, resolve)
      })
    }

    console.log(chalk.bold("\nInbox Processing\n"))
    console.log("Keys: [n]ext  [s]omeday  [d]one  [D]elete  [q]uit\n")

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item) continue

      console.log(chalk.dim(`\nItem ${i + 1} of ${items.length}:`))
      console.log(chalk.bold(item.content || "(no content)"))

      let processed = false
      while (!processed) {
        const answer = await question("\n> ")
        const key = answer.toLowerCase().trim()

        switch (key) {
          case "n": // Move to next
            if (nextNode) {
              vault.moveNode(item.id, nextNode.id, 0)
              console.log(chalk.green("→ Moved to @next"))
            } else {
              console.log(chalk.yellow("No @next board found"))
              continue
            }
            processed = true
            break

          case "s": // Move to someday
            if (somedayNode) {
              vault.moveNode(item.id, somedayNode.id, 0)
              console.log(chalk.green("→ Moved to @someday"))
            } else {
              console.log(chalk.yellow("No @someday board found"))
              continue
            }
            processed = true
            break

          case "d": // Mark done
            vault.updateNode(item.id, {
              task_status: "done",
              task_mark: "x",
            })
            console.log(chalk.green("✓ Marked done"))
            processed = true
            break

          case "D": // Delete (drop)
            vault.updateNode(item.id, {
              task_status: "dropped",
              task_mark: "-",
            })
            console.log(chalk.red("✗ Dropped"))
            processed = true
            break

          case "q": // Quit
            console.log(chalk.dim("\nQuitting..."))
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
            console.log(chalk.dim("Unknown key. Press ? for help."))
        }
      }
    }

    rl.close()
    console.log(chalk.green("\n✓ Inbox processing complete!"))
  })

// Subcommand: inbox add <content> - quick add to inbox
inboxCommand
  .command("add")
  .description("Quick add item to inbox")
  .argument("<content...>", "Task content")
  .option("--json", "Output as JSON")
  .action((content: string[], options: { json?: boolean }) => {
    using vault = runGenerator(createVault())
    const inbox = getInboxNode()

    if (!inbox) {
      console.error(chalk.red("No inbox found. Create an inbox/ folder."))
      process.exit(1)
    }

    const taskContent = content.join(" ")

    // Find file path for inbox to append to
    const inboxPath = inbox.fs_path
    if (!inboxPath) {
      console.error(chalk.red("Inbox has no file path"))
      process.exit(1)
    }

    // Use vault method to append task
    vault.appendTaskToFile(inboxPath, taskContent)

    if (options.json) {
      console.log(JSON.stringify({ added: true, content: taskContent }))
    } else {
      console.log(chalk.green("+ Added to inbox:"), taskContent)
    }
  })
