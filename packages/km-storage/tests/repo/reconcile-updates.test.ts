import { describe, expect, test } from "vitest"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, withTestEnv } from "../../src/index.ts"
import { createTestSync } from "../../../km-fs-mount/tests/watch/sync-test-helpers.ts"

describe("disk repo reconcile", () => {
  test("createRepo imports external markdown edits before query/view reads", async () => {
    await withTestEnv(
      async ({ repoDir, db, emitter }) => {
        const filePath = join(repoDir, "board.md")
        writeFileSync(filePath, "# Board\n\n## Old\n")

        const sync = createTestSync(db, repoDir, { debounceFs: 0, debounceApply: 0, emitter })
        await sync.syncFromFs()
        await sync.stop()

        writeFileSync(filePath, "# Board\n\n## New\n")

        using repo = runGenerator(createRepo(repoDir, { loadFiles: true }))
        const board = repo.resolveNode("board.md")
        expect(board).toBeTruthy()
        const headings = repo.getChildren(board!.id).map((node) => node.title ?? node.content)
        expect(headings).toContain("New")
        expect(headings).not.toContain("Old")
      },
      { mode: "real" },
    )
  })
})
