/**
 * ChaosHooks Tests
 *
 * Tests for the Repo lifecycle hooks chaos testing utility.
 *
 * Note: These tests use createRepo which manages its own database lifecycle
 * via the `using` keyword. Tests must remain serial to avoid filesystem conflicts.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { runGenerator } from "@km/core"
import { createRepo, createChaosHooks, createSeededRandom } from "../../src/index.ts"
import type { ChaosEvent, ChaosHooks } from "../../src/index.ts"

const TEST_DIR = "/tmp/kmtest-chaos-hooks"
const REPO_DIR = join(TEST_DIR, "repo")

describe.sequential("createChaosHooks", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
  })

  afterEach(() => {
    // Repo cleanup is handled by `using` keyword - no need for closeDb()
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  test("creates hooks with default config (no chaos)", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    const hooks = createChaosHooks()
    using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

    const tasks = repo.getAllTasks()
    expect(tasks.length).toBe(3)

    // Update should succeed
    repo.updateNode(tasks[0]!.id, { item: { task: { status: "done", marker: "[ ]" } } })

    const updated = repo.getNode(tasks[0]!.id)
    expect(updated!.item?.task?.status).toBe("done")

    // No chaos events
    expect(hooks.getChaosEvents()).toHaveLength(0)
  })

  test("drops mutations at configured rate", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    // Use seeded random for deterministic test
    const random = createSeededRandom(12345)
    const events: ChaosEvent[] = []

    const hooks = createChaosHooks({
      mutationDropRate: 1.0, // 100% drop rate for testing
      random,
      onChaosEvent: (e) => events.push(e),
    })

    using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

    const tasks = repo.getAllTasks()
    expect(tasks.length).toBe(3)

    // Update should be dropped
    expect(() => repo.updateNode(tasks[0]!.id, { item: { task: { status: "done", marker: "[ ]" } } })).toThrow(
      /Mutation cancelled by hook/,
    )

    // Verify mutation was dropped
    const unchanged = repo.getNode(tasks[0]!.id)
    expect(unchanged!.item?.task?.status).toBe("todo")

    // Check chaos events
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe("drop")
    expect(events[0]!.mutation.type).toBe("update")
  })

  test("corrupts mutations at configured rate", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    const random = createSeededRandom(42)
    const events: ChaosEvent[] = []

    const hooks = createChaosHooks({
      mutationDropRate: 0, // Don't drop
      mutationCorruptRate: 1.0, // 100% corruption rate
      random,
      onChaosEvent: (e) => events.push(e),
    })

    using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

    const tasks = repo.getAllTasks()
    const task = tasks[0]!

    // Update will be corrupted
    repo.updateNode(task.id, { item: { task: { status: "done", marker: "[ ]" } } })

    // Check that corruption event was logged
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe("corrupt")
  })

  test("supports type-specific drop rates", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    const hooks = createChaosHooks({
      dropRates: {
        update: 1.0, // Drop all updates
        add: 0, // Allow all adds
        delete: 0, // Allow all deletes
      },
    })

    using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

    const tasks = repo.getAllTasks()

    // Update should be dropped
    expect(() => repo.updateNode(tasks[0]!.id, { item: { task: { status: "done", marker: "[ ]" } } })).toThrow(
      /Mutation cancelled by hook/,
    )

    // Add should succeed
    const rootChildren = repo.getChildren(null)
    const fileNode = rootChildren[0]!
    const newId = repo.addNode(fileNode.id, {
      type: "p",
      item: {},
      content: "New task",
    })
    expect(newId).toBeDefined()
  })

  test("can be disabled and enabled", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    const hooks = createChaosHooks({
      mutationDropRate: 1.0, // Would drop all mutations
    }) as ChaosHooks

    using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

    const tasks = repo.getAllTasks()

    // With chaos enabled, update should fail
    expect(hooks.isEnabled()).toBe(true)
    expect(() => repo.updateNode(tasks[0]!.id, { item: { task: { status: "done", marker: "[ ]" } } })).toThrow(
      /Mutation cancelled by hook/,
    )

    // Disable chaos
    hooks.disable()
    expect(hooks.isEnabled()).toBe(false)

    // Now update should succeed
    repo.updateNode(tasks[1]!.id, { item: { task: { status: "done", marker: "[ ]" } } })
    const updated = repo.getNode(tasks[1]!.id)
    expect(updated!.item?.task?.status).toBe("done")

    // Re-enable chaos
    hooks.enable()
    expect(hooks.isEnabled()).toBe(true)

    // Now update should fail again
    expect(() => repo.updateNode(tasks[2]!.id, { item: { task: { status: "done", marker: "[ ]" } } })).toThrow(
      /Mutation cancelled by hook/,
    )
  })

  test("tracks statistics", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    const random = createSeededRandom(999)

    const hooks = createChaosHooks({
      mutationDropRate: 0.5, // 50% drop rate
      random,
    }) as ChaosHooks

    using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

    const tasks = repo.getAllTasks()

    // Try multiple mutations
    for (const task of tasks) {
      try {
        repo.updateNode(task.id, { item: { task: { status: "done", marker: "[ ]" } } })
      } catch {
        // Expected for dropped mutations
      }
    }

    const stats = hooks.getStats()
    expect(stats.totalMutations).toBe(3)
    expect(stats.droppedMutations + stats.successfulMutations).toBe(3)
  })

  test("clearChaosEvents resets event log", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    const hooks = createChaosHooks({
      mutationDropRate: 1.0,
    }) as ChaosHooks

    using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

    const tasks = repo.getAllTasks()

    try {
      repo.updateNode(tasks[0]!.id, { item: { task: { status: "done", marker: "[ ]" } } })
    } catch {
      // Expected
    }

    expect(hooks.getChaosEvents()).toHaveLength(1)

    hooks.clearChaosEvents()
    expect(hooks.getChaosEvents()).toHaveLength(0)
  })

  test("seeded random produces deterministic results", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three
`,
    )

    // Run same scenario twice with same seed
    const results1: string[] = []
    const results2: string[] = []

    for (const results of [results1, results2]) {
      const random = createSeededRandom(54321)
      const hooks = createChaosHooks({
        mutationDropRate: 0.5,
        random,
      })

      using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

      const tasks = repo.getAllTasks()
      for (const task of tasks) {
        try {
          repo.updateNode(task.id, { item: { task: { status: "done", marker: "[ ]" } } })
          results.push("success")
        } catch {
          results.push("dropped")
        }
      }
    }

    // Results should be identical with same seed
    expect(results1).toEqual(results2)
  })
})
