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
import { MemoryStore } from "../src/store/store.ts"
import {
  evaluateNodeRules,
  evaluateAllRules,
  getNodesWithRules,
  getNodesWithRule,
  createRuleContext,
} from "../src/db/rules.ts"
import { createDbOps } from "../src/db/ops.ts"
import { getChildren, getChildCountsBatch } from "../src/db/queries/index.ts"
import { KNode } from "@km/core"

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
            expect(node.item).toBeTruthy()
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

  describe("evaluateNodeRules - km.add rule", () => {
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
              n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id, createRuleContext())

          const children = getChildren(store.getDatabase(), openSection!.id)
          const embeds = children.filter((c) => KNode.isEmbed(c))

          expect(embeds.length).toBe(2)
          expect(embeds.every((e) => e.embed_of)).toBe(true)
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
              n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id, createRuleContext())

          const children = getChildren(store.getDatabase(), openSection!.id)
          const embeds = children.filter((c) => KNode.isEmbed(c))
          const directTasks = children.filter((c) => c.item?.task?.status != null)

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
              n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "@project status:todo",
          )
          const doneSection = allNodes.find(
            (n) =>
              n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "@project status:done",
          )

          expect(todoSection).toBeDefined()
          expect(doneSection).toBeDefined()

          const todoSymlinks = getChildren(store.getDatabase(), todoSection!.id).filter((c) => KNode.isEmbed(c))
          const doneSymlinks = getChildren(store.getDatabase(), doneSection!.id).filter((c) => KNode.isEmbed(c))

          expect(todoSymlinks.length).toBe(2)
          expect(doneSymlinks.length).toBe(1)
        },
      ))

    test("does not materialize incoming sigil links without km.add opt-in", () =>
      withMemoryStore(
        (repoDir) => {
          mkdirSync(join(repoDir, "@agent"), { recursive: true })
          mkdirSync(join(repoDir, "@km", "silvercode"), { recursive: true })
          writeFileSync(
            join(repoDir, "@agent", "3.md"),
            `# @agent/3

Persona text.
`,
          )
          writeFileSync(join(repoDir, "@km", "silvercode", "work.md"), `# Work item #task #P0 @agent/3\n`)
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const board = allNodes.find((n) => n.fs_path === "@agent/3.md")
          expect(board?.name).toBe("3")
          expect(board?.rules).toBeUndefined()

          const embeds = getChildren(store.getDatabase(), board!.id).filter((c) => KNode.isEmbed(c))
          expect(embeds).toHaveLength(0)
        },
      ))

    test("H1 km.add self alias matches the file node and materializes into explicit default section", () =>
      withMemoryStore(
        (repoDir) => {
          mkdirSync(join(repoDir, "@agent"), { recursive: true })
          mkdirSync(join(repoDir, "@km", "silvercode"), { recursive: true })
          writeFileSync(join(repoDir, "@agent", "3.md"), `# @agent/3 km.add:: .\n\n## Queue km.default:: true\n`)
          writeFileSync(join(repoDir, "@km", "silvercode", "work.md"), `# Work item #task #P0 @agent/3\n`)
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const board = allNodes.find((n) => n.fs_path === "@agent/3.md")
          const queue = allNodes.find(
            (n) => n.parent_id === board?.id && n.fstype === "mdsection" && (n.title ?? n.content) === "Queue",
          )
          expect(board?.rules?.add).toBe(".")
          expect(queue?.rules?.default).toBe(true)
          expect(getChildren(store.getDatabase(), board!.id).filter((c) => KNode.isEmbed(c))).toHaveLength(0)

          const embeds = getChildren(store.getDatabase(), queue!.id).filter((c) => KNode.isEmbed(c))
          expect(embeds).toHaveLength(1)

          const target = allNodes.find((n) => n.id === embeds[0]!.embed_of)
          expect(target?.fs_path).toBe("@km/silvercode/work.md")
        },
      ))

    test("H1 km.add falls back to the first non-collapsed, non-removed child section", () =>
      withMemoryStore(
        (repoDir) => {
          mkdirSync(join(repoDir, "@agent"), { recursive: true })
          mkdirSync(join(repoDir, "@km", "silvercode"), { recursive: true })
          writeFileSync(join(repoDir, "@agent", "3.md"), `# @agent/3 km.add:: .\n\n## Queue\n`)
          writeFileSync(join(repoDir, "@km", "silvercode", "work.md"), `# Work item #task #P0 @agent/3\n`)
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const board = allNodes.find((n) => n.fs_path === "@agent/3.md")
          const queue = allNodes.find(
            (n) => n.parent_id === board?.id && n.fstype === "mdsection" && (n.title ?? n.content) === "Queue",
          )

          expect(getChildren(store.getDatabase(), queue!.id).filter((c) => KNode.isEmbed(c))).toHaveLength(1)
        },
      ))

    test("km.add matches wiki sigil assignments through canonical href", () =>
      withMemoryStore(
        (repoDir) => {
          mkdirSync(join(repoDir, "@agent"), { recursive: true })
          mkdirSync(join(repoDir, "@km", "silvercode"), { recursive: true })
          writeFileSync(join(repoDir, "@agent", "3.md"), `# @agent/3 km.add:: .\n\n## Queue km.default:: true\n`)
          writeFileSync(join(repoDir, "@km", "silvercode", "work.md"), `# Work item #task #P0 [[@agent/3]]\n`)
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const board = allNodes.find((n) => n.fs_path === "@agent/3.md")
          const queue = allNodes.find(
            (n) => n.parent_id === board?.id && n.fstype === "mdsection" && (n.title ?? n.content) === "Queue",
          )

          expect(getChildren(store.getDatabase(), queue!.id).filter((c) => KNode.isEmbed(c))).toHaveLength(1)
        },
      ))

    test("km.add does not drag a moved embed back to the default section", () =>
      withMemoryStore(
        (repoDir) => {
          mkdirSync(join(repoDir, "@agent"), { recursive: true })
          mkdirSync(join(repoDir, "@km", "silvercode"), { recursive: true })
          writeFileSync(
            join(repoDir, "@agent", "3.md"),
            `# @agent/3 km.add:: .

## Queue km.default:: true

## Doing
`,
          )
          writeFileSync(join(repoDir, "@km", "silvercode", "work.md"), `# Work item #task #P0 @agent/3\n`)
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const board = allNodes.find((n) => n.fs_path === "@agent/3.md")
          const queue = allNodes.find(
            (n) => n.parent_id === board?.id && n.fstype === "mdsection" && (n.title ?? n.content) === "Queue",
          )
          const doing = allNodes.find(
            (n) => n.parent_id === board?.id && n.fstype === "mdsection" && (n.title ?? n.content) === "Doing",
          )
          const [embed] = getChildren(store.getDatabase(), queue!.id).filter((c) => KNode.isEmbed(c))
          expect(embed).toBeDefined()

          createDbOps(store.getDatabase()).moveNode(embed!.id, doing!.id, Date.now())

          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          expect(getChildren(store.getDatabase(), queue!.id).filter((c) => KNode.isEmbed(c))).toHaveLength(0)
          expect(getChildren(store.getDatabase(), doing!.id).filter((c) => KNode.isEmbed(c))).toHaveLength(1)
        },
      ))

    test("km.add materialization skips non-item backlink hosts by default", () =>
      withMemoryStore(
        (repoDir) => {
          mkdirSync(join(repoDir, "@agent"), { recursive: true })
          writeFileSync(join(repoDir, "@agent", "3.md"), `# @agent/3 km.add:: .\n\n## Queue km.default:: true\n`)
          writeFileSync(
            join(repoDir, "mixed.md"),
            `# Mixed

Body paragraph mentions @agent/3 but is not an item.

- [ ] Item mentions @agent/3
`,
          )
        },
        ({ store }) => {
          for (const _ of evaluateAllRules(store.getDatabase(), createRuleContext())) {
            /* exhaust generator */
          }

          const allNodes = store.getAllNodes()
          const board = allNodes.find((n) => n.fs_path === "@agent/3.md")
          const queue = allNodes.find(
            (n) => n.parent_id === board?.id && n.fstype === "mdsection" && (n.title ?? n.content) === "Queue",
          )
          const embeds = getChildren(store.getDatabase(), queue!.id).filter((c) => KNode.isEmbed(c))

          expect(embeds).toHaveLength(1)
          const target = allNodes.find((n) => n.id === embeds[0]!.embed_of)
          expect(target?.content).toBe("Item mentions @agent/3")
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
              n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "@issue status:todo",
          )
          expect(openSection).toBeDefined()

          evaluateNodeRules(store.getDatabase(), openSection!.id, createRuleContext())

          const children = getChildren(store.getDatabase(), openSection!.id)

          expect(children.length).toBe(2)
          expect(children.every((c) => KNode.isEmbed(c))).toBe(true)
          expect(children.every((c) => c.embed_of)).toBe(true)
        },
      ))

    test("should deduplicate direct children and embed children", () =>
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
            (n) => n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "status:todo",
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
          // Board has a km.add:: rule AND an existing embed reference to the same task
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
            (n) => n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add,
          )
          expect(inboxSection).toBeDefined()

          const ctx = createRuleContext()
          evaluateNodeRules(store.getDatabase(), inboxSection!.id, ctx)

          const children = getChildren(store.getDatabase(), inboxSection!.id)
          // The embed from markdown + rule should not create a duplicate
          const embedTargets = children.filter((c) => c.embed_of).map((c) => c.embed_of)
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
            (n) => n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "@tag status:todo",
          )
          const doneSection = allNodes.find(
            (n) => n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "@tag status:done",
          )

          expect(todoSection).toBeDefined()
          expect(doneSection).toBeDefined()

          let todoChildren = getChildren(store.getDatabase(), todoSection!.id)
          let doneChildren = getChildren(store.getDatabase(), doneSection!.id)

          expect(todoChildren.length).toBe(2)
          expect(doneChildren.length).toBe(0)

          const taskA = allNodes.find((n) => n.item?.task?.status != null && n.content?.includes("Task A"))
          expect(taskA).toBeDefined()

          store.updateNode(taskA!.id, { item: { task: { status: "done", marker: "[x]" } } })

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
    test("should count embed children from km.add rules", () =>
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
              n.type === "h" && n.item != null && n.fstype === "mdsection" && n.rules?.add === "@issue status:todo",
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
