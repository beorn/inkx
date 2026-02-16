/**
 * Due date filtering for @next board.
 *
 * Bead: km-tui.dated-items-inbox
 *
 * Nodes with due_at/start_at should automatically appear on @next board's inbox.
 * The @next template's Inbox column uses add= rules to pull in tasks
 * with due dates (past, today, this week) and past start dates.
 *
 * Root cause: In interactive mode, loadRepo uses discoverOnly=true for instant
 * render, then parseDeferredAsync runs in background. But evaluateAllRules was
 * never called after background parsing, so add= rules never materialized
 * embed nodes for dated tasks.
 *
 * Fix: Call evaluateAllRules after background parsing + link resolution in view.ts.
 */
import { describe, test, expect } from "vitest"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { MemoryStore, queryTasks, evaluateAllRules, createRuleContext, getChildren } from "@km/storage"
import type { Database } from "bun:sqlite"
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

/** Helper to find the Inbox section (the one with add= rules containing "due:past") */
function findInboxSection(db: Database): { id: string } | undefined {
  const rows = db
    .query("SELECT * FROM nodes WHERE json_extract(data, '$.rules.add') IS NOT NULL")
    .all() as Record<string, unknown>[]

  for (const row of rows) {
    const data = JSON.parse((row.data as string) || "{}")
    const adds = Array.isArray(data.rules?.add) ? data.rules.add : data.rules?.add ? [data.rules.add] : []
    if (adds.some((a: string) => a.includes("due:past"))) {
      return { id: row.id as string }
    }
  }
  return undefined
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

  test("add= rule materializes embeds for dated tasks after evaluateAllRules", () => {
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

        const inbox = findInboxSection(db)
        expect(inbox).toBeDefined()

        // Should have embeds for the 3 non-done/dropped overdue tasks
        const children = getChildren(db, inbox!.id)
        const embeds = children.filter((c) => c.type === "link" && c.embed)
        expect(embeds.length).toBe(3)
      },
    )
  })

  test("without evaluateAllRules, inbox has no dated items (demonstrates bug)", () => {
    // This test demonstrates the root cause: MemoryStore (like discoverOnly mode)
    // does not call evaluateAllRules. Without it, the Inbox's add= rules never
    // materialize embed nodes, so dated tasks don't appear.
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

        // Before evaluateAllRules: inbox should have NO embeds
        const inbox = findInboxSection(db)
        expect(inbox).toBeDefined()

        const childrenBefore = getChildren(db, inbox!.id)
        const embedsBefore = childrenBefore.filter((c) => c.type === "link" && c.embed)
        expect(embedsBefore.length).toBe(0)

        // After evaluateAllRules: inbox should have 3 embeds
        const ctx = createRuleContext()
        for (const _ of evaluateAllRules(db, ctx)) {
          /* exhaust */
        }

        const childrenAfter = getChildren(db, inbox!.id)
        const embedsAfter = childrenAfter.filter((c) => c.type === "link" && c.embed)
        expect(embedsAfter.length).toBe(3)
      },
    )
  })
})
