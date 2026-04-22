/**
 * E2E roundtrip test for anchor (`^id`) persistence via fs-watch.
 *
 * Historically the fs-watch update path (user edits a file to add ` ^id`
 * to a task) went through node-differ + applyNodeCreated/applyNodeUpdated,
 * both of which silently dropped the anchor. Schema v6 folds `block_id`
 * into `.name` per storage-architecture §2.3; this test guards the same
 * pipeline but asserts the anchor ends up on `node.name`.
 *
 * Coverage:
 * - node-differ.ts CHILD_DIFF_FIELDS includes `name`
 * - db/changes.ts applyNodeCreated writes `name` in the INSERT
 * - fs-watch: writeFile → syncFromFs → verify DB has `.name` populated
 */

import { describe, test, expect } from "vitest"
import { writeFileSync } from "fs"
import { join } from "path"
import { getAllNodes, withTestEnv } from "@km/storage"
import { createTestSync } from "../../../km-fs-mount/tests/watch/sync-test-helpers.ts"

describe("anchor roundtrip via fs-watch (name field)", () => {
  test("create file with task ^id → anchor persisted as .name in DB", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const manager = createTestSync(db, repoDir, {
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      })

      writeFileSync(
        join(repoDir, "tasks.md"),
        `# Tasks

- [ ] task one ^testid
- [ ] apr15 ca ftb payment ^apr15-ca-ftb
`,
      )
      await manager.syncFromFs()

      const nodes = getAllNodes(db)
      const taskOne = nodes.find((n) => n.content === "task one")
      const aprTask = nodes.find((n) => n.content === "apr15 ca ftb payment")

      expect(taskOne, "task one node should exist").toBeDefined()
      expect(taskOne?.name, `task one should have name='testid', got ${taskOne?.name}`).toBe("testid")

      expect(aprTask, "apr15 task should exist").toBeDefined()
      expect(aprTask?.name).toBe("apr15-ca-ftb")
    }))

  test("edit existing file to add ^id → anchor persisted via update path", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const manager = createTestSync(db, repoDir, {
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      })

      const path = join(repoDir, "tasks.md")
      writeFileSync(path, "# Tasks\n\n- [ ] existing task\n")
      await manager.syncFromFs()

      // Verify initial state: task exists, no anchor name
      let nodes = getAllNodes(db)
      let task = nodes.find((n) => n.content === "existing task")
      expect(task).toBeDefined()
      expect(task?.name ?? null).toBeNull()

      // Edit to add ^id suffix
      writeFileSync(path, "# Tasks\n\n- [ ] existing task ^added-later\n")
      await manager.syncFromFs()

      nodes = getAllNodes(db)
      task = nodes.find((n) => n.content === "existing task")
      expect(task, "task should still exist after edit").toBeDefined()
      expect(task?.name, "name should be updated via diff path").toBe("added-later")
    }))

  test("hyphenated and numeric anchors both persist as .name", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const manager = createTestSync(db, repoDir, {
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      })

      writeFileSync(
        join(repoDir, "mixed.md"),
        `# Mixed

- [ ] alpha ^simple
- [ ] beta ^hyphenated-id
- [ ] gamma ^with_underscore
- [ ] delta ^123456789
`,
      )
      await manager.syncFromFs()

      const byContent = (c: string) => getAllNodes(db).find((n) => n.content === c)
      expect(byContent("alpha")?.name).toBe("simple")
      expect(byContent("beta")?.name).toBe("hyphenated-id")
      expect(byContent("gamma")?.name).toBe("with_underscore")
      expect(byContent("delta")?.name).toBe("123456789")
    }))
})
