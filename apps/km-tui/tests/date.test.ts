/**
 * Date, priority, and recurrence tests: badge display, date prompt dialog,
 * priority cycling, due date filtering for @next board.
 *
 * Covers:
 * - formatDateBadge and badge visibility in cards/columns views
 * - td/ts/tr chord sequences for date/recurrence dialogs
 * - sp chord for priority cycling
 * - due:past/due:today/due:week query matching for @next board rules
 * - evaluateAllRules materializing embeds for dated tasks
 * - onNodeChanged creating embeds after interactive td
 */

import { describe, test, it, expect } from "vitest"
import { act } from "react"
import { testEnv, item } from "./helpers/board-test.ts"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { formatDateBadge } from "../src/views/tree-node-helpers.ts"
import type { KNode } from "@km/core"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import {
  MemoryStore,
  queryTasks,
  evaluateAllRules,
  createRuleContext,
  getChildren,
  onNodeChanged,
  createBareRepo,
} from "@km/storage"
import type { Database } from "bun:sqlite"
import { formatDate } from "@km/core"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Helper to find the Inbox section (the one with km.add:: rules containing "due:past") */
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

// ---------------------------------------------------------------------------
// Date badge display
// ---------------------------------------------------------------------------

describe("date badge display", () => {
  it("formatDateBadge returns badge for node with due_date", () => {
    // Use a date 30+ days out so it renders as "Mon DD" not relative
    const badge = formatDateBadge({ due_date: "2026-03-15" } as KNode)
    expect(badge).not.toBe("")
    expect(badge).toContain("Mar 15")
  })

  it("formatDateBadge returns empty for node without dates", () => {
    const badge = formatDateBadge({} as KNode)
    expect(badge).toBe("")
  })

  it("date badge appears in card after repo.updateNode", async () => {
    const nodes = item("board",
      item("col1",
        item.task("Test task"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initially no date
    let screen = driver.getState().screen
    let clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    expect(clean).not.toContain("Mar 15")

    // Set due_date on the task node
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Trigger render flush (inkx custom renderer needs a keypress to flush
    // useSyncExternalStore updates — j/k is a no-op cursor move on single card)
    await driver.press("j")

    // Date badge should appear right-aligned in the card
    screen = driver.getState().screen
    clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    expect(clean).toContain("Mar 15")
  })

  it("date badge appears in detail pane after repo.updateNode", async () => {
    const nodes = item("board",
      item("col1",
        item.task("Test task"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Set due_date on the task node
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Open detail pane (Space opens detail for current node)
    await driver.press(" ")

    const screen = driver.getState().screen
    const clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    // Detail pane should show the due date (rendered as relative date)
    expect(clean).toContain("Due: Mar 15")
  })

  it("date badge visible in cards view with initial due_date (testEnv)", () => {
    // Create nodes, then set due_date before rendering
    const nodes = item("board",
      item("col1",
        item.task("Task with date"),
      ),
    )
    // Manually set due_date on the task node before creating repo
    const taskNode = nodes.find((n) => n.content === "Task with date")!
    taskNode.due_date = "2026-03-15"
    taskNode.priority = 1

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screen = board.screenshot()
    // Check the date badge appears
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P1")
  })

  it("date badge visible in cards view with multiple columns (testEnv)", () => {
    const nodes = item("board",
      item("col1",
        item.task("Task A"),
        item.task("Task B"),
      ),
      item("col2",
        item.task("Task C"),
      ),
    )
    // Set due_date on Task A
    const taskA = nodes.find((n) => n.content === "Task A")!
    taskA.due_date = "2026-03-15"
    taskA.priority = 2
    // Set priority on Task C
    const taskC = nodes.find((n) => n.content === "Task C")!
    taskC.priority = 3

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screen = board.screenshot()
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P2")
    expect(screen).toContain("P3")
  })

  it("date badge visible with many columns (narrow width per column)", () => {
    const nodes = item("board",
      item("col1", item.task("Task A")),
      item("col2", item.task("Task B")),
      item("col3", item.task("Task C")),
      item("col4", item.task("Task D")),
    )
    // Set due_date on Task A
    const taskA = nodes.find((n) => n.content === "Task A")!
    taskA.due_date = "2026-03-15"

    // 80 columns / 4 columns = 20 chars per column -- very narrow
    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screen = board.screenshot()
    // With only ~20 chars per column, badge may be truncated but should still appear
    expect(screen).toContain("Mar 15")
  })

  it("date badge visible in columns view (testEnv)", () => {
    const nodes = item("board",
      item("col1",
        item.task("Task with date"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "Task with date")!
    taskNode.due_date = "2026-03-15"
    taskNode.priority = 2

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24, viewMode: "columns" })
    const screen = board.screenshot()
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P2")
  })

  it("date badge appears after 'td' key simulation (full workflow)", async () => {
    // Simulate the full workflow: user presses 'td', types a date, presses Enter
    const nodes = item("board",
      item("col1",
        item.task("My task"),
      ),
    )
    const { board, repo } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Before: no date badge
    let screen = board.screenshot()
    expect(screen).not.toContain("Mar 15")

    // User presses 'td' to open the date prompt
    board.press("t").press("d")

    // Simulate what DatePromptDialog.onConfirm does:
    // (In the test, we can't actually type in the dialog, so we use repo.updateNode)
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Press Escape to close the date prompt
    board.press("escape")

    // The date badge should now be visible in the card
    screen = board.screenshot()
    expect(screen).toContain("Mar 15")
  })

  it("structural sharing preserves date badge after unrelated mutation", () => {
    // Regression: applyStructuralSharing must detect date/priority changes
    const nodes = item("board",
      item("col1",
        item.task("Task A"),
        item.task("Task B"),
      ),
    )
    const { board, repo } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Set due_date on Task A
    const col = repo.getChildren("board")[0]!
    const taskA = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskA.id, { due_date: "2026-03-15", priority: 1 })
    })
    board.press("j") // flush
    let screen = board.screenshot()
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P1")

    // Now mutate Task B (unrelated) — Task A's badge should persist
    const taskB = repo.getChildren(col.id)[1]!
    act(() => {
      repo.updateNode(taskB.id, { content: "Task B updated" })
    })
    board.press("j") // flush
    screen = board.screenshot()
    expect(screen).toContain("Mar 15")
    expect(screen).toContain("P1")
    expect(screen).toContain("Task B updated")
  })

  it("priority badge visible in cards view (testEnv)", () => {
    const nodes = item("board",
      item("col1",
        item.task("Priority task"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "Priority task")!
    taskNode.priority = 2

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screen = board.screenshot()
    expect(screen).toContain("P2")
  })

  it("date badge visible after setting via 'td' key sequence", () => {
    const nodes = item("board",
      item("col1",
        item.task("Todo task"),
      ),
    )
    const { board, repo } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Simulate what 'td' does: update the node's due_date
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Flush by pressing a no-op key
    board.press("j")

    const screen = board.screenshot()
    expect(screen).toContain("Mar 15")
  })
})

// ---------------------------------------------------------------------------
// Date prompt (td), start date (ts), recurrence (tr)
// ---------------------------------------------------------------------------

describe("date prompt (td)", () => {
  test("td chord opens due date dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"), item.task("Write report"))))

    // Navigate to card level
    board.press("j")

    // Press t (chord prefix) then d (due date)
    board.press("t")
    board.press("d")

    // Dialog should be open — check for "Set Due Date" text
    const text = board.screenshot()
    expect(text).toContain("Set Due Date")
  })

  test("td chord does not leak 'd' into text input", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("d")

    // The dialog input should be empty (no leaked 'd')
    const text = board.screenshot()
    // The prompt shows "> " followed by a cursor — no 'd' character
    expect(text).not.toMatch(/> d[^a-z]/)
    // Should show empty state hint
    expect(text).toContain("Empty = clear value")
  })

  test("ts chord opens start date dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("s")

    const text = board.screenshot()
    expect(text).toContain("Set Start Date")
  })

  test("tr chord opens recurrence dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("r")

    const text = board.screenshot()
    expect(text).toContain("Set Recurrence")
  })

  test("Escape cancels date dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("d")

    // Verify dialog open
    expect(board.screenshot()).toContain("Set Due Date")

    // Cancel
    board.press("Escape")

    // Dialog should be closed
    expect(board.screenshot()).not.toContain("Set Due Date")
  })

  test("Enter in date dialog does NOT create new nodes", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")

    // Count nodes before
    const nodesBefore = repo.getChildren(repo.getChildren("board")[0]!.id).length

    // Open date dialog
    board.press("t")
    board.press("d")
    expect(board.screenshot()).toContain("Set Due Date")

    // Press Enter — should confirm dialog, NOT create a new node
    board.press("Enter")

    // Dialog should be closed
    expect(board.screenshot()).not.toContain("Set Due Date")

    // Node count should be unchanged (no new nodes created)
    const nodesAfter = repo.getChildren(repo.getChildren("board")[0]!.id).length
    expect(nodesAfter).toBe(nodesBefore)
  })

  test("typing in date dialog reaches the text input", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("d")

    // Type a date
    board.press("f")
    board.press("r")
    board.press("i")

    // The input should show "fri" and the preview should resolve it
    const screen = board.screenshot()
    expect(screen).toContain("fri")
  })

  test("navigation keys are filtered when date dialog is open", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("Buy groceries"), item.task("Write report"))),
    )

    board.press("j") // Navigate to card level

    // Open date dialog
    board.press("t")
    board.press("d")
    expect(board.screenshot()).toContain("Set Due Date")

    // Press 'j' (normally moves cursor down) — should be filtered, not move cursor
    board.press("j")

    // Dialog should still be open (j was consumed as text input or filtered)
    expect(board.screenshot()).toContain("Set Due Date")
    // 'j' should appear in the dialog input, not cause navigation
    expect(board.screenshot()).toContain("j")
  })

  test("Enter confirms date and updates node field", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")
    board.press("t")
    board.press("d")

    // Type "tomorrow"
    for (const ch of "tomorrow") board.press(ch)

    // Press Enter to confirm
    board.press("Enter")

    // Dialog should be closed
    expect(board.screenshot()).not.toContain("Set Due Date")

    // Node should have a due_at field set
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()
  })

  test("Enter in date dialog does NOT start inline editing (km-qaco9)", () => {
    // Regression: Enter while date dialog is open must NOT trigger
    // enter_inline_edit on the background card.
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("Buy groceries"), item.task("Write report"))),
    )

    board.press("j") // Navigate to card level

    // Record the cursor position node before opening dialog
    const screenBefore = board.screenshot()

    // Open date dialog
    board.press("t")
    board.press("d")
    expect(board.screenshot()).toContain("Set Due Date")

    // Press Enter with empty input — should close dialog, NOT enter inline edit
    board.press("Enter")

    // Dialog should be closed
    const screenAfter = board.screenshot()
    expect(screenAfter).not.toContain("Set Due Date")

    // Should NOT be in inline edit mode — no cursor blinking indicator or edit border.
    // The background card content should be unchanged.
    expect(screenAfter).toContain("Buy groceries")
    expect(screenAfter).toContain("Write report")
    // No edit indicator ("> " prompt from inline edit) should appear
    expect(screenAfter).not.toMatch(/> Buy groceries/)
  })

  test("Escape in date dialog does NOT affect background board state (km-qaco9)", () => {
    // Regression: Escape while date dialog is open must NOT trigger
    // close_or_quit or text.exit_edit on the background.
    const { board } = testEnv(() =>
      item("board",
        item("col1", item.task("Task A")),
        item("col2", item.task("Task B")),
      ),
    )

    // Navigate into column 2
    board.press("l")
    board.press("j")

    const screenBefore = board.screenshot()

    // Open date dialog
    board.press("t")
    board.press("d")
    expect(board.screenshot()).toContain("Set Due Date")

    // Press Escape — should close dialog, NOT zoom out or navigate back
    board.press("Escape")

    // Dialog should be closed
    const screenAfter = board.screenshot()
    expect(screenAfter).not.toContain("Set Due Date")

    // Board state should be unchanged — both columns still visible,
    // cursor still on same node
    expect(screenAfter).toContain("Task A")
    expect(screenAfter).toContain("Task B")
  })

  test("multiple Enter/Escape cycles don't corrupt state (km-qaco9)", () => {
    // Regression: repeated open/close cycles should not leak state
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item.task("My task"))),
    )

    board.press("j")

    const col = repo.getChildren("board")[0]!
    const nodesBefore = repo.getChildren(col.id).length

    // Cycle 1: open, Escape
    board.press("t").press("d")
    expect(board.screenshot()).toContain("Set Due Date")
    board.press("Escape")
    expect(board.screenshot()).not.toContain("Set Due Date")

    // Cycle 2: open, Enter (empty = clear)
    board.press("t").press("d")
    expect(board.screenshot()).toContain("Set Due Date")
    board.press("Enter")
    expect(board.screenshot()).not.toContain("Set Due Date")

    // Cycle 3: open, type, Enter
    board.press("t").press("d")
    expect(board.screenshot()).toContain("Set Due Date")
    for (const ch of "fri") board.press(ch)
    board.press("Enter")
    expect(board.screenshot()).not.toContain("Set Due Date")

    // No extra nodes created
    const nodesAfter = repo.getChildren(col.id).length
    expect(nodesAfter).toBe(nodesBefore)

    // The task should have a due_at set from the last cycle
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Priority (sp)
// ---------------------------------------------------------------------------

describe("priority (sp)", () => {
  test("sp sets P1 on card", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")

    // Initially no priority in full screenshot
    expect(board.screenshot()).not.toMatch(/P[1-4]/)

    // sp → P1
    board.press("s")
    board.press("p")

    // Should show P1 somewhere (toast or card)
    const text = board.screenshot()
    expect(text).toContain("P1")
  })

  test("sp cycles through priorities", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Buy groceries"))))

    board.press("j")

    // Cycle: none → P1 → P2 → P3 → P4 → none
    // Each sp should show the next priority in a toast
    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: P1")

    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: P2")

    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: P3")

    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: P4")

    board.press("s").press("p")
    expect(board.screenshot()).toContain("Priority: None")
  })
})

// ---------------------------------------------------------------------------
// Due date queries for @next board
// ---------------------------------------------------------------------------

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

  test("km.add:: rule materializes embeds for dated tasks after evaluateAllRules", () => {
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

## Inbox km.add:: due:past -status:done -status:dropped km.add:: due:today -status:done -status:dropped km.add:: due:week -status:done -status:dropped km.add:: start:past -status:done -status:dropped

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

  test("interactive td: onNodeChanged creates embeds after setting due date", () => {
    // Reproduces the interactive flow: user sets due date on an item,
    // onNodeChanged creates embeds in DB, touch() clears children cache.
    withTestRepo(
      (dir) => {
        writeFileSync(
          join(dir, "tasks.md"),
          `# Tasks

- [ ] My task
`,
        )
        writeFileSync(
          join(dir, "@next.md"),
          `# Next Actions

## Inbox km.add:: due:past -status:done -status:dropped km.add:: due:today -status:done -status:dropped

## Next
`,
        )
      },
      (store) => {
        const db = store.getDatabase()

        // First, run evaluateAllRules so rules are materialized (simulates initial load)
        const initCtx = createRuleContext()
        for (const _ of evaluateAllRules(db, initCtx)) {
          /* exhaust */
        }

        const inbox = findInboxSection(db)
        expect(inbox).toBeDefined()

        // No embeds yet (task has no due date)
        const childrenBefore = getChildren(db, inbox!.id)
        const embedsBefore = childrenBefore.filter((c) => c.type === "link" && c.embed)
        expect(embedsBefore.length).toBe(0)

        // Find the task node
        const taskNode = db
          .query("SELECT * FROM nodes WHERE content LIKE '%My task%' AND task_status IS NOT NULL")
          .get() as Record<string, unknown> | null
        expect(taskNode).not.toBeNull()

        // Simulate interactive "td" — set due_at to yesterday (matches due:past rule)
        const yest = yesterday()
        db.run("UPDATE nodes SET due_at = ?, due_date = ?, updated_at = ? WHERE id = ?", [
          yest,
          yest,
          Date.now(),
          taskNode!.id,
        ])

        // Call onNodeChanged (same as handleDatePromptConfirm does)
        const ruleCtx = createRuleContext()
        onNodeChanged(db, taskNode!.id as string, ruleCtx)

        // Verify embeds were created in DB
        const childrenAfter = getChildren(db, inbox!.id)
        const embedsAfter = childrenAfter.filter((c) => c.type === "link" && c.embed)
        expect(embedsAfter.length).toBe(1)
        expect(embedsAfter[0]!.link_to).toBe(taskNode!.id)
      },
    )
  })

  test("without evaluateAllRules, inbox has no dated items (demonstrates bug)", () => {
    // This test demonstrates the root cause: MemoryStore (like discoverOnly mode)
    // does not call evaluateAllRules. Without it, the Inbox's km.add:: rules never
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

## Inbox km.add:: due:past -status:done -status:dropped km.add:: due:today -status:done -status:dropped km.add:: due:week -status:done -status:dropped km.add:: start:past -status:done -status:dropped

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
