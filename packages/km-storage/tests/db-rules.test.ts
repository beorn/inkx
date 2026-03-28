/**
 * Database Rules Tests
 *
 * Tests for computed rule evaluation (km.add::, km.sync::, etc.)
 * Rules are evaluated at sync time and results stored in the links table.
 *
 * Uses withMemoryStore helper for parallel test isolation - creates files,
 * then MemoryStore parses them, and test runs within runWithDb context.
 */

import { describe, test, expect, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { MemoryStore } from "../src/store.ts"
import {
  evaluateNodeRules,
  evaluateAllRules,
  getNodesWithRules,
  getNodesWithRule,
  createRuleContext,
} from "../src/db-rules.ts"
import { getChildren, getChildCountsBatch } from "../src/db-queries/index.ts"

interface TestEnv {
  store: MemoryStore
  repoDir: string
}

/**
 * Helper to run a test with an isolated MemoryStore.
 * The setup function writes files, then MemoryStore is created to parse them.
 */
function withMemoryStore<T>(setup: (repoDir: string) => void, fn: (env: TestEnv) => T): T {
  const testId = ulid()
  const testDir = join("/tmp", `kmtest-${testId}`)
  const repoDir = join(testDir, "repo")

  mkdirSync(repoDir, { recursive: true })

  // Write files first
  setup(repoDir)

  // Create store (will parse the files)
  using store = new MemoryStore(repoDir)

  try {
    return fn({ store, repoDir })
  } finally {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  }
}

describe("Database Rules", () => {
  describe("getNodesWithRules", () => {
    test("should find nodes with km.add:: rules", () =>
      withMemoryStore(
        (repoDir) => {
          writeFileSync(
            join(repoDir, "board.md"),
            `# Board

## Open km.add:: @issue status:todo

## Done km.add:: @issue status:done
`,
          )
        },
        ({ store }) => {
          const nodesWithRules = getNodesWithRules(store.getDatabase())
          expect(nodesWithRules.length).toBe(2)

          for (const node of nodesWithRules) {
            expect(node.type).toBe("h")
            expect(node.item).toBe(true)
            expect(node.rules?.add).toBeDefined()
          }
        },
      ))

    test("should return empty array when no rules exist", () =>
      withMemoryStore(
        (repoDir) => {
          writeFileSync(
            join(repoDir, "simple.md"),
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
        (repoDir) => {
          writeFileSync(
            join(repoDir, "mixed.md"),
            `# Mixed Rules

## Open km.add:: @issue status:todo

## Collapsed km.collapse:: true

## Limited km.limit:: 3
`,
          )
        },
        ({ store }) => {
          const addRuleNodes = getNodesWithRule(store.getDatabase(), "add")
          expect(addRuleNodes.length).toBe(1)
          expect(addRuleNodes[0]?.rules?.add).toBe("@issue status:todo")

          const collapseRuleNodes = getNodesWithRule(store.getDatabase(), "collapse")
          expect(collapseRuleNodes.length).toBe(1)
          expect(collapseRuleNodes[0]?.rules?.collapse).toBe(true)
        },
      ))
  })

  describe("evaluateNodeRules - add= rule", () => {
    test("should create embed children for matching nodes", () =>
      withMemoryStore(
        (repoDir) => {
          writeFileSync(
            join(repoDir, "issues.md"),
            `# Issues

- [ ] Fix bug @issue
- [ ] Add feature @issue
- [x] Done task @issue
`,
          )

          writeFileSync(
            join(repoDir, "board.md"),
            `# Board

## Open km.add:: @issue status:todo
`,
          )
        },
        ({ store }) => {
          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) =>
              n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id, createRuleContext())

          const children = getChildren(store.getDatabase(), openSection!.id)
          const embeds = children.filter((c) => c.embed_source != null)

          expect(embeds.length).toBe(2)
          expect(embeds.every((e) => e.embed_source)).toBe(true)
        },
      ))

    test("should not create embeds for direct children", () =>
      withMemoryStore(
        (repoDir) => {
          writeFileSync(
            join(repoDir, "mixed.md"),
            `# Mixed

## Open km.add:: @issue status:todo

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
              n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id, createRuleContext())

          const children = getChildren(store.getDatabase(), openSection!.id)
          const embeds = children.filter((c) => c.embed_source != null)
          const directTasks = children.filter((c) => c.task_status != null)

          expect(embeds.length).toBe(1)
          expect(directTasks.length).toBe(1)
        },
      ))
  })

  describe("evaluateAllRules", () => {
    test("should evaluate all rules in database", () =>
      withMemoryStore(
        (repoDir) => {
          writeFileSync(
            join(repoDir, "tasks.md"),
            `# Tasks

- [ ] Task A @project
- [ ] Task B @project
- [x] Task C @project
`,
          )

          writeFileSync(
            join(repoDir, "board.md"),
            `# Board

## Todo km.add:: @project status:todo

## Done km.add:: @project status:done
`,
          )
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const todoSection = allNodes.find(
            (n) =>
              n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "@project status:todo",
          )
          const doneSection = allNodes.find(
            (n) =>
              n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "@project status:done",
          )

          expect(todoSection).toBeDefined()
          expect(doneSection).toBeDefined()

          const todoEmbeds = getChildren(store.getDatabase(), todoSection!.id).filter((c) => c.embed_source != null)
          const doneEmbeds = getChildren(store.getDatabase(), doneSection!.id).filter((c) => c.embed_source != null)

          expect(todoEmbeds.length).toBe(2)
          expect(doneEmbeds.length).toBe(1)
        },
      ))
  })

  describe("getChildren with computed links", () => {
    test("should include embed children from km.add:: rule", () =>
      withMemoryStore(
        (repoDir) => {
          writeFileSync(
            join(repoDir, "issues.md"),
            `# Issues

- [ ] Bug 1 @issue
- [ ] Bug 2 @issue
`,
          )

          writeFileSync(
            join(repoDir, "board.md"),
            `# Board

## Open km.add:: @issue status:todo
`,
          )
        },
        ({ store }) => {
          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) =>
              n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id, createRuleContext())

          const children = getChildren(store.getDatabase(), openSection!.id)

          expect(children.length).toBe(2)
          expect(children.every((c) => c.embed_source != null)).toBe(true)
          expect(children.every((c) => c.embed_source)).toBe(true)
        },
      ))

    test("should deduplicate direct children and linked children", () =>
      withMemoryStore(
        (repoDir) => {
          writeFileSync(
            join(repoDir, "board.md"),
            `# Board

## Open km.add:: status:todo

- [ ] Direct task
`,
          )
        },
        ({ store }) => {
          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) => n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id, createRuleContext())

          const children = getChildren(store.getDatabase(), openSection!.id)
          expect(children.length).toBe(1)
        },
      ))

    test("should not duplicate embeds already present in markdown", () =>
      withMemoryStore(
        (repoDir) => {
          mkdirSync(join(repoDir, "inbox"), { recursive: true })
          writeFileSync(
            join(repoDir, "inbox", "task.md"),
            `# Task

- [ ] Buy groceries ^buy1
`,
          )
          // Board has an km.add:: rule AND an existing embed reference to the same task
          writeFileSync(
            join(repoDir, "board.md"),
            `# Board

## Inbox km.add:: ./inbox/**

![[task#^buy1]]
`,
          )
        },
        ({ store }) => {
          const allNodes = store.getAllNodes()
          const inboxSection = allNodes.find(
            (n) => n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add,
          )
          expect(inboxSection).toBeDefined()

          const ctx = createRuleContext()
          evaluateNodeRules(store.getDatabase(), inboxSection!.id, ctx)

          const children = getChildren(store.getDatabase(), inboxSection!.id)
          // The embed from markdown + rule should not create a duplicate
          const embedTargets = children.filter((c) => c.embed_source).map((c) => c.embed_source)
          const uniqueTargets = new Set(embedTargets)
          expect(embedTargets.length).toBe(uniqueTargets.size)
        },
      ))
  })

  describe("incremental updates", () => {
    test("should update links when task status changes", () =>
      withMemoryStore(
        (repoDir) => {
          writeFileSync(
            join(repoDir, "tasks.md"),
            `# Tasks

- [ ] Task A @tag
- [ ] Task B @tag
`,
          )

          writeFileSync(
            join(repoDir, "board.md"),
            `# Board

## Todo km.add:: @tag status:todo

## Done km.add:: @tag status:done
`,
          )
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const todoSection = allNodes.find(
            (n) => n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "@tag status:todo",
          )
          const doneSection = allNodes.find(
            (n) => n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "@tag status:done",
          )

          expect(todoSection).toBeDefined()
          expect(doneSection).toBeDefined()

          let todoChildren = getChildren(store.getDatabase(), todoSection!.id)
          let doneChildren = getChildren(store.getDatabase(), doneSection!.id)

          expect(todoChildren.length).toBe(2)
          expect(doneChildren.length).toBe(0)

          const taskA = allNodes.find((n) => n.task_status != null && n.content?.includes("Task A"))
          expect(taskA).toBeDefined()

          store.updateNode(taskA!.id, { task_status: "done", task_marker: "[x]" })

          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
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
        (repoDir) => {
          writeFileSync(
            join(repoDir, "issues.md"),
            `# Issues

- [ ] Bug 1 @issue
- [ ] Bug 2 @issue
- [ ] Bug 3 @issue
`,
          )

          writeFileSync(
            join(repoDir, "board.md"),
            `# Board

## Open km.add:: @issue status:todo
`,
          )
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const openSection = allNodes.find(
            (n) =>
              n.type === "h" && n.item === true && n.fstype === "mdsection" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          const counts = getChildCountsBatch(store.getDatabase(), [openSection!.id])
          expect(counts.get(openSection!.id)).toBe(3)
        },
      ))
  })

  describe("path escape warnings", () => {
    test("should warn when km.add:: rule path escapes repo root with ../", async () => {
      const { addWriter } = await import("loggily")
      const logOutput: string[] = []
      const unsubscribe = addWriter((formatted) => {
        logOutput.push(formatted)
      })
      // Override the setup's console.warn spy to prevent "console output" error
      vi.mocked(console.warn).mockImplementation(() => {})

      try {
        withMemoryStore(
          (repoDir) => {
            writeFileSync(
              join(repoDir, "board.md"),
              `# Board

## Outside km.add:: ../other-repo/**
`,
            )
          },
          ({ store }) => {
            const ctx = createRuleContext()
            for (const _ of evaluateAllRules(store.getDatabase(), ctx)) {
              /* exhaust generator */
            }

            const warnLines = logOutput.filter((line) => line.includes("outside the repo"))
            expect(warnLines.length).toBeGreaterThan(0)
            expect(warnLines[0]).toContain("../other-repo/**")
          },
        )
      } finally {
        unsubscribe()
      }
    })

    test("should not warn for valid relative paths", async () => {
      const { addWriter } = await import("loggily")
      const logOutput: string[] = []
      const unsubscribe = addWriter((formatted) => {
        logOutput.push(formatted)
      })

      try {
        withMemoryStore(
          (repoDir) => {
            mkdirSync(join(repoDir, "inbox"), { recursive: true })
            writeFileSync(
              join(repoDir, "inbox", "task.md"),
              `# Task

- [ ] Do something
`,
            )
            writeFileSync(
              join(repoDir, "board.md"),
              `# Board

## Inbox km.add:: ./inbox/**
`,
            )
          },
          ({ store }) => {
            const ctx = createRuleContext()
            for (const _ of evaluateAllRules(store.getDatabase(), ctx)) {
              /* exhaust generator */
            }

            const warnLines = logOutput.filter((line) => line.includes("outside the repo"))
            expect(warnLines.length).toBe(0)
          },
        )
      } finally {
        unsubscribe()
      }
    })
  })
})
