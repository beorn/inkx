/**
 * Database Rules Tests
 *
 * Tests for computed rule evaluation (add=, sync=, etc.)
 * Rules are evaluated at sync time and results stored in the links table.
 *
 * Uses withMemoryStore helper for parallel test isolation - creates files,
 * then MemoryStore parses them, and test runs within runWithDb context.
 */

import { describe, test, expect } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { MemoryStore } from "../src/store.ts"
import {
  evaluateNodeRules,
  evaluateAllRules,
  getNodesWithRules,
  getNodesWithRule,
} from "../src/db-rules.ts"
import { getChildren, getChildCountsBatch } from "../src/db-queries/index.ts"
import { runWithDb } from "../src/db-instance.ts"

interface TestEnv {
  store: MemoryStore
  vaultDir: string
}

/**
 * Helper to run a test with an isolated MemoryStore.
 * The setup function writes files, then MemoryStore is created to parse them.
 * Test runs within runWithDb context using the store's database.
 */
function withMemoryStore<T>(
  setup: (vaultDir: string) => void,
  fn: (env: TestEnv) => T,
): T {
  const testId = ulid()
  const testDir = join("/tmp", `kmtest-${testId}`)
  const vaultDir = join(testDir, "vault")

  mkdirSync(vaultDir, { recursive: true })

  // Write files first
  setup(vaultDir)

  // Create store (will parse the files)
  using store = new MemoryStore(vaultDir)

  try {
    // Run within ALS context using the store's database
    return runWithDb(store.getDatabase(), () => fn({ store, vaultDir }))
  } finally {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  }
}

describe("Database Rules", () => {
  describe("getNodesWithRules", () => {
    test("should find nodes with add= rules", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "board.md"),
            `# Board

## Open add="@issue status:todo"

## Done add="@issue status:done"
`,
          )
        },
        ({ store }) => {
          const nodesWithRules = getNodesWithRules(store.getDatabase())
          expect(nodesWithRules.length).toBe(2)

          for (const node of nodesWithRules) {
            expect(node.type).toBe("section")
            expect(node.rules?.add).toBeDefined()
          }
        },
      ))

    test("should return empty array when no rules exist", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "simple.md"),
            `# Simple

## Section 1

- [ ] Task 1

## Section 2

- [ ] Task 2
`,
          )
        },
        ({ store }) => {
          const nodesWithRules = getNodesWithRules(store.getDatabase())
          expect(nodesWithRules.length).toBe(0)
        },
      ))
  })

  describe("getNodesWithRule", () => {
    test("should find nodes with specific rule type", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "mixed.md"),
            `# Mixed Rules

## Open add="@issue status:todo"

## Collapsed collapse=true

## Limited limit=3
`,
          )
        },
        ({ store }) => {
          const addRuleNodes = getNodesWithRule(store.getDatabase(), "add")
          expect(addRuleNodes.length).toBe(1)
          expect(addRuleNodes[0]?.rules?.add).toBe("@issue status:todo")

          const collapseRuleNodes = getNodesWithRule(
            store.getDatabase(),
            "collapse",
          )
          expect(collapseRuleNodes.length).toBe(1)
          expect(collapseRuleNodes[0]?.rules?.collapse).toBe(true)
        },
      ))
  })

  describe("evaluateNodeRules - add= rule", () => {
    test("should create embed children for matching nodes", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "issues.md"),
            `# Issues

- [ ] Fix bug @issue
- [ ] Add feature @issue
- [x] Done task @issue
`,
          )

          writeFileSync(
            join(vaultDir, "board.md"),
            `# Board

## Open add="@issue status:todo"
`,
          )
        },
        ({ store }) => {
          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) =>
              n.type === "section" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id)

          const children = getChildren(store.getDatabase(), openSection!.id)
          const embeds = children.filter((c) => c.type === "embed")

          expect(embeds.length).toBe(2)
          expect(embeds.every((e) => e.link_to)).toBe(true)
        },
      ))

    test("should not create embeds for direct children", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "mixed.md"),
            `# Mixed

## Open add="@issue status:todo"

- [ ] Direct child @issue

---

## Other

- [ ] Other task @issue
`,
          )
        },
        ({ store }) => {
          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) =>
              n.type === "section" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id)

          const children = getChildren(store.getDatabase(), openSection!.id)
          const embeds = children.filter((c) => c.type === "embed")
          const directTasks = children.filter((c) => c.type === "task")

          expect(embeds.length).toBe(1)
          expect(directTasks.length).toBe(1)
        },
      ))
  })

  describe("evaluateAllRules", () => {
    test("should evaluate all rules in database", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "tasks.md"),
            `# Tasks

- [ ] Task A @project
- [ ] Task B @project
- [x] Task C @project
`,
          )

          writeFileSync(
            join(vaultDir, "board.md"),
            `# Board

## Todo add="@project status:todo"

## Done add="@project status:done"
`,
          )
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const todoSection = allNodes.find(
            (n) =>
              n.type === "section" && n.rules?.add === "@project status:todo",
          )
          const doneSection = allNodes.find(
            (n) =>
              n.type === "section" && n.rules?.add === "@project status:done",
          )

          expect(todoSection).toBeDefined()
          expect(doneSection).toBeDefined()

          const todoEmbeds = getChildren(
            store.getDatabase(),
            todoSection!.id,
          ).filter((c) => c.type === "embed")
          const doneEmbeds = getChildren(
            store.getDatabase(),
            doneSection!.id,
          ).filter((c) => c.type === "embed")

          expect(todoEmbeds.length).toBe(2)
          expect(doneEmbeds.length).toBe(1)
        },
      ))
  })

  describe("getChildren with computed links", () => {
    test("should include embed children from add= rule", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "issues.md"),
            `# Issues

- [ ] Bug 1 @issue
- [ ] Bug 2 @issue
`,
          )

          writeFileSync(
            join(vaultDir, "board.md"),
            `# Board

## Open add="@issue status:todo"
`,
          )
        },
        ({ store }) => {
          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) =>
              n.type === "section" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id)

          const children = getChildren(store.getDatabase(), openSection!.id)

          expect(children.length).toBe(2)
          expect(children.every((c) => c.type === "embed")).toBe(true)
          expect(children.every((c) => c.link_to)).toBe(true)
        },
      ))

    test("should deduplicate direct children and linked children", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "board.md"),
            `# Board

## Open add="status:todo"

- [ ] Direct task
`,
          )
        },
        ({ store }) => {
          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) => n.type === "section" && n.rules?.add === "status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id)

          const children = getChildren(store.getDatabase(), openSection!.id)
          expect(children.length).toBe(1)
        },
      ))
  })

  describe("incremental updates", () => {
    test("should update links when task status changes", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "tasks.md"),
            `# Tasks

- [ ] Task A @tag
- [ ] Task B @tag
`,
          )

          writeFileSync(
            join(vaultDir, "board.md"),
            `# Board

## Todo add="@tag status:todo"

## Done add="@tag status:done"
`,
          )
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const todoSection = allNodes.find(
            (n) => n.type === "section" && n.rules?.add === "@tag status:todo",
          )
          const doneSection = allNodes.find(
            (n) => n.type === "section" && n.rules?.add === "@tag status:done",
          )

          expect(todoSection).toBeDefined()
          expect(doneSection).toBeDefined()

          let todoChildren = getChildren(store.getDatabase(), todoSection!.id)
          let doneChildren = getChildren(store.getDatabase(), doneSection!.id)

          expect(todoChildren.length).toBe(2)
          expect(doneChildren.length).toBe(0)

          const taskA = allNodes.find(
            (n) => n.type === "task" && n.content?.includes("Task A"),
          )
          expect(taskA).toBeDefined()

          store.updateNode( taskA!.id, { task_status: "done", task_mark: "x" })

          for (const _ of evaluateAllRules(store.getDatabase())) {
            /* exhaust generator */
          }

          todoChildren = getChildren(store.getDatabase(), todoSection!.id)
          doneChildren = getChildren(store.getDatabase(), doneSection!.id)

          expect(todoChildren.length).toBe(1)
          expect(doneChildren.length).toBe(1)
        },
      ))
  })

  describe("getChildCountsBatch with computed links", () => {
    test("should count linked children from query:add rules", () =>
      withMemoryStore(
        (vaultDir) => {
          writeFileSync(
            join(vaultDir, "issues.md"),
            `# Issues

- [ ] Bug 1 @issue
- [ ] Bug 2 @issue
- [ ] Bug 3 @issue
`,
          )

          writeFileSync(
            join(vaultDir, "board.md"),
            `# Board

## Open add="@issue status:todo"
`,
          )
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) =>
              n.type === "section" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          const counts = getChildCountsBatch(store.getDatabase(), [
            openSection!.id,
          ])
          expect(counts.get(openSection!.id)).toBe(3)
        },
      ))
  })
})
