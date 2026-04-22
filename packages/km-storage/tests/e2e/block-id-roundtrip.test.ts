/**
 * E2E roundtrip test for km-markdown.block-id-prod-sync.
 *
 * The fs-watch update path (user edits a file to add ` ^id` to a task)
 * went through node-differ + applyNodeCreated/applyNodeUpdated, both of
 * which silently dropped block_id. Fixed 2026-04-14:
 *
 * - node-differ.ts CHILD_DIFF_FIELDS now includes block_id
 * - db/changes.ts applyNodeCreated now writes block_id in the INSERT
 *
 * This test exercises the actual broken path: writeFile → syncFromFs →
 * verify the DB has block_id populated.
 */

import { describe, test, expect } from "vitest"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { getAllNodes, withTestEnv } from "@km/storage"
import { createTestSync } from "../../../km-fs-mount/tests/watch/sync-test-helpers.ts"

describe("block-id roundtrip via fs-watch", () => {
  test("create file with task ^id → block_id persisted in DB", () =>
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
      expect(taskOne?.block_id, `task one should have block_id='testid', got ${taskOne?.block_id}`).toBe("testid")

      expect(aprTask, "apr15 task should exist").toBeDefined()
      expect(aprTask?.block_id).toBe("apr15-ca-ftb")
    }))

  test("edit existing file to add ^id → block_id persisted via update path", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const manager = createTestSync(db, repoDir, {
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "fs_wins",
      })

      const path = join(repoDir, "tasks.md")
      writeFileSync(path, "# Tasks\n\n- [ ] existing task\n")
      await manager.syncFromFs()

      // Verify initial state: task exists, no block_id
      let nodes = getAllNodes(db)
      let task = nodes.find((n) => n.content === "existing task")
      expect(task).toBeDefined()
      expect(task?.block_id ?? null).toBeNull()

      // Edit to add ^id suffix
      writeFileSync(path, "# Tasks\n\n- [ ] existing task ^added-later\n")
      await manager.syncFromFs()

      nodes = getAllNodes(db)
      task = nodes.find((n) => n.content === "existing task")
      expect(task, "task should still exist after edit").toBeDefined()
      expect(task?.block_id, "block_id should be updated via diff path").toBe("added-later")
    }))

  test("hyphenated and numeric block ids both persist", () =>
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
      expect(byContent("alpha")?.block_id).toBe("simple")
      expect(byContent("beta")?.block_id).toBe("hyphenated-id")
      expect(byContent("gamma")?.block_id).toBe("with_underscore")
      expect(byContent("delta")?.block_id).toBe("123456789")
    }))
})
