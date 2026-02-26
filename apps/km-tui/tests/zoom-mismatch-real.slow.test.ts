/**
 * Regression test: km-inkx.zoom-mismatch (real vault)
 *
 * Reproduces the actual crash from imports/asana/stabell vault.
 */
import { describe, test, expect } from "vitest"
import { createRepo, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { createBoardDriver } from "../src/driver.ts"
import { compareBuffers, formatMismatch } from "inkx/toolbelt"
import { bufferToText } from "inkx/testing"
import { existsSync } from "fs"

const VAULT_PATH = new URL("../../../imports/asana/stabell", import.meta.url).pathname

describe.skipIf(!existsSync(VAULT_PATH))("zoom-mismatch: real vault repro", () => {
  test("cursor down does not cause incremental mismatch", async () => {
    const repo = runGenerator(createRepo(VAULT_PATH, { loadFiles: true }))

    // Find the repo root
    const nodes = repo.query("type:folder")
    let rootId: string | undefined
    for (const node of nodes) {
      if (node.data?.is_repo_root) {
        rootId = node.id
        break
      }
    }
    expect(rootId).toBeDefined()

    // Use smaller terminal to make the test faster
    const driver = createBoardDriver(repo, rootId!, {
      columns: 120,
      rows: 30,
      incremental: true,
    })

    // Initial render
    expect(driver.text).toContain("beowa")

    // Navigate down - this is render #2, where the crash occurred
    await driver.press("j")

    // Manual buffer comparison
    const app = driver.app as any
    if (typeof app.freshRender === "function" && typeof app.lastBuffer === "function") {
      const fresh = app.freshRender()
      const current = app.lastBuffer()
      if (fresh && current) {
        const mismatch = compareBuffers(current, fresh)
        if (mismatch) {
          const msg = formatMismatch(mismatch, {
            incrementalText: bufferToText(current),
            freshText: bufferToText(fresh),
          })
          throw new Error(`Incremental/fresh mismatch:\n${msg}`)
        }
      }
    }
  })
})
