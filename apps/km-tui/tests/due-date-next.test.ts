/**
 * Due date filtering for @next board.
 *
 * Bead: km-tui.due-date-next
 *
 * Nodes with due_date should automatically appear on @next board.
 * The @next template's Inbox column uses add= rules to pull in tasks
 * with due dates (past, today, this week) and past start dates.
 *
 * This test verifies the query rules match the expected nodes,
 * and that the improved template rules cover all non-done/dropped statuses.
 */
import { describe, test, expect } from "vitest"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { MemoryStore, queryTasks, evaluateAllRules, createRuleContext, getChildren } from "@km/storage"
import { formatDate } from "@km/core"

function withTestRepo(
  setup: (repoDir: string) => void,
  fn: (store: MemoryStore) => void,
): void {
  const testDir = join("/tmp", `kmtest-due-${ulid()}`)
  mkdirSync(testDir, { recursive: true })
  setup(testDir)
  using store = new MemoryStore(testDir)
  try {
    fn(store)
  } finally {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  }
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return formatDate(d)
}

describe("due date queries for @next board", () => {
  test("due:past -status:done -status:dropped matches non-done overdue tasks", () => {
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] Overdue todo due:${yesterday()}
- [/] Overdue wip due:${yesterday()}
- [!] Overdue blocked due:${yesterday()}
- [x] Overdue done due:${yesterday()}
- [-] Overdue dropped due:${yesterday()}
`,
        )
      },
      (store) => {
        const db = store.getDatabase()
        const results = queryTasks(db, `due:past -status:done -status:dropped`)
        // Should match todo, wip, blocked — NOT done, dropped
        expect(results.length).toBe(3)
        const contents = results.map((r) => r.content ?? "")
        expect(contents.some((c) => c.includes("todo"))).toBe(true)
        expect(contents.some((c) => c.includes("wip"))).toBe(true)
        expect(contents.some((c) => c.includes("blocked"))).toBe(true)
      },
    )
  })

  test("current template rules miss blocked tasks with due dates", () => {
    // This test demonstrates the gap in the current template:
    // due:past status:todo + due:past status:wip covers todo and wip,
    // but not blocked tasks with past due dates
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] Overdue todo due:${yesterday()}
- [/] Overdue wip due:${yesterday()}
- [!] Overdue blocked due:${yesterday()}
`,
        )
      },
      (store) => {
        const db = store.getDatabase()

        // Current template rules for due:past
        const todoResults = queryTasks(db, "due:past status:todo")
        const wipResults = queryTasks(db, "due:past status:wip")

        expect(todoResults.length).toBe(1) // only todo
        expect(wipResults.length).toBe(1) // only wip
        // blocked is missed by both rules!

        // Better rule: use negation to catch all non-done/dropped
        const betterResults = queryTasks(db, "due:past -status:done -status:dropped")
        expect(betterResults.length).toBe(3) // todo + wip + blocked
      },
    )
  })

  test.todo("add= rule with improved queries pulls all relevant dated tasks — km-tui.due-date-next", () => {
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] Overdue todo due:${yesterday()}
- [/] Overdue wip due:${yesterday()}
- [!] Overdue blocked due:${yesterday()}
- [x] Overdue done due:${yesterday()}
`,
        )
        writeFileSync(
          join(dir, "@next.md"),
          `# Next Actions

## Inbox add="due:past -status:done -status:dropped" add="due:today -status:done -status:dropped" add="due:week -status:done -status:dropped" add="start:past -status:done -status:dropped"

## Next
`,
        )
      },
      (store) => {
        const db = store.getDatabase()
        const ctx = createRuleContext()
        for (const _ of evaluateAllRules(db, ctx)) {
          /* exhaust */
        }

        // Find the Inbox section by looking for nodes with add rules
        const allNodes = store.getAllNodes()
        const inbox = allNodes.find((n) =>
          n.rules?.add !== undefined &&
          (typeof n.rules.add === "string"
            ? n.rules.add.includes("due:past")
            : Array.isArray(n.rules.add) && n.rules.add.some((a: string) => a.includes("due:past"))),
        )
        expect(inbox).toBeDefined()

        // Check its children (should have embeds for the 3 non-done overdue tasks)
        const children = getChildren(db, inbox!.id)
        const embeds = children.filter((c) => c.type === "link" && c.embed)
        expect(embeds.length).toBe(3)
      },
    )
  })
})
