/**
 * km-tui.zoom-stack-overflow — Stack overflow on zoom out after +km.md rename
 *
 * Reported: RangeError: Maximum call stack size exceeded when zooming out
 * from a +km.md file that was being renamed.
 *
 * STATUS (2026-04-20): bug could NOT be reproduced via this test harness
 * despite mirroring production wiring:
 * - Real createRepo (not FakeRepo) so RepoDelta + withReactive fire
 * - jobRunner active with 5s countdown and backlinks
 * - Real fs_path/sigil interaction: +km.md with 6 backlinks
 * - vi.useFakeTimers to interleave countdown with zoom
 * - Also unreproducible via mcp__tty against a fake vault with +km.md
 *
 * The two test scenarios below PASS: they verify that renaming + zooming does
 * not crash under the simulated conditions. They are kept as:
 *   a) Guards against regressions if the bug has been latent and fixes land
 *   b) Templates for future reproduction attempts (user may report again)
 *
 * The real repro path likely depends on:
 * - Specific backlink depth / cross-file references that produce a parent_id
 *   cycle in the reactive tree (collectDescendantsInto is recursive at
 *   reactive.ts:145 — a cycle would overflow the stack)
 * - State accumulated across multiple renames / long sessions
 * - Specific vault structure the test fixture does not reproduce
 *
 * When the user reports another instance, capture the stack trace via
 * DEBUG=km:*,silvery:* DEBUG_LOG=/tmp/zoom-crash.log, attach it to the bead,
 * and use this test as the starting point for a targeted repro.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRepo, getChildren, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { createBoardDriver } from "../src/driver.ts"
import { withDiagnostics } from "@silvery/ag-react"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"
import { resetBoardAppState } from "../src/board/board-app.ts"
import { createNodeStore } from "../src/state/reactive.ts"
import { dispatchSelection, nodeSelect } from "../src/state/selection.ts"
import type { ID } from "@silvery/selection"

// =============================================================================
// Unit guard: NodeStore.setSelection must survive parent_id cycles without
// overflowing the stack. This is the actual regression guard for the fix —
// the `.slow` tests below exercise the full production path but can't easily
// induce a cycle, while this test forces the cycle directly.
// =============================================================================

describe("km-tui.zoom-stack-overflow: descendant walk is cycle-safe", () => {
  test("setSelection on a repo with a parent_id cycle terminates (no stack overflow)", () => {
    // Build a minimal repo-like object with an intentional children cycle:
    //   A → B → A (B has A as a child, which has B as a child)
    // Before the fix this would blow the stack via recursive walk.
    const children = new Map<string, { id: string }[]>([
      ["root", [{ id: "A" }]],
      ["A", [{ id: "B" }]],
      ["B", [{ id: "A" }]], // cycle
    ])
    const fakeRepo = {
      getChildren(parentId: string | null): { id: string }[] {
        return parentId ? (children.get(parentId) ?? []) : []
      },
    } as const

    const store = createNodeStore()
    // Should complete synchronously — no RangeError, no hang.
    expect(() => store.setSelection(new Set(["root"]), fakeRepo as never)).not.toThrow()
  })

  test("setSelection handles deep linear chains without stack overflow", () => {
    // 10_000-deep linear chain: recursive walk would overflow the default
    // V8 stack (~10-15k frames). Iterative walk is bounded only by memory.
    const children = new Map<string, { id: string }[]>()
    for (let i = 0; i < 10_000; i++) {
      children.set(`n${i}`, [{ id: `n${i + 1}` }])
    }
    const fakeRepo = {
      getChildren(parentId: string | null): { id: string }[] {
        return parentId ? (children.get(parentId) ?? []) : []
      },
    } as const

    const store = createNodeStore()
    expect(() => store.setSelection(new Set(["n0"]), fakeRepo as never)).not.toThrow()
  })
})

function findRepoRoot(repo: Repo): string {
  const nodes = repo.query("type:folder")
  for (const node of nodes) {
    if (node.data?.is_repo_root) return node.id
  }
  for (const node of nodes) {
    if (getChildren(repo.database, node.id).length > 0) return node.id
  }
  throw new Error("No suitable board root found in vault")
}

function findNodeByFsPath(repo: Repo, suffix: string): { id: string } | undefined {
  const rows = repo.database
    .prepare(`SELECT id, fs_path FROM nodes WHERE fs_path LIKE '%' || ? || '%'`)
    .all(suffix) as { id: string; fs_path: string | null }[]
  return rows.find((r) => r.fs_path?.endsWith(suffix))
}

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), "km-zoom-so-"))
  writeFileSync(
    join(dir, "+km.md"),
    `# +km

## col1

- [ ] task1
- [ ] task2 [[+km]]

## col2

- [ ] task3 [[+km]]
`,
  )
  writeFileSync(
    join(dir, "other.md"),
    `# other

- [ ] link1 [[+km]]
- [ ] link2 [[+km]]
- [ ] link3 [[+km]]
`,
  )
  return dir
}

describe("km-tui.zoom-stack-overflow: rename +km then zoom out (regression guard)", () => {
  let vaultPath: string
  let repo: Repo

  beforeEach(() => {
    resetBoardAppState()
    vi.useFakeTimers({
      shouldAdvanceTime: false,
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    })
    vaultPath = makeVault()
    repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
  })

  afterEach(() => {
    vi.useRealTimers()
    // Don't close repo explicitly — the board driver React tree still holds
    // refs. OS reclaims SQLite memory on test process exit.
    if (vaultPath) rmSync(vaultPath, { recursive: true, force: true })
  })

  test("zoom out during active rename job countdown does not crash", async () => {
    const kmNode = findNodeByFsPath(repo, "+km.md")
    expect(kmNode, "must find +km.md node").toBeDefined()
    const rootId = findRepoRoot(repo)

    const driver = withDiagnostics(
      createBoardDriver(repo, rootId, {
        columns: 120,
        rows: 30,
        viewMode: "cards",
        incremental: false,
      }),
      { checkIncremental: false, checkStability: false, skipLines: [0, -1] },
    )

    // Programmatically park cursor on +km node
    const pane = getActiveBoardPane(driver.store.getState())
    if (!pane) throw new Error("no active board pane")
    dispatchSelection({ sel: pane.sel }, nodeSelect(kmNode!.id as ID))
    await driver.press("") // flush

    const c1 = getActiveBoardPane(driver.store.getState())?.sel.node.cursor()
    expect(c1).toBe(kmNode!.id)

    // Inline-edit +km and rename
    await driver.press("Enter")
    await driver.press("X")
    await driver.press("Escape")

    // Advance timers partway into the countdown (job still pending — backlinks → 5s)
    vi.advanceTimersByTime(2500)

    // Zoom outwards during countdown — should not crash with stack overflow
    let crashed: unknown = null
    try {
      await driver.press("Z")
    } catch (err) {
      crashed = err
    }
    if (!crashed) {
      try {
        vi.advanceTimersByTime(3000)
      } catch (err) {
        crashed = err
      }
    }

    expect(crashed, `zoom-out during rename countdown should not throw: ${crashed}`).toBeNull()
  }, 60_000)

  test("zoom out AFTER rename job fires (mid-execute) does not crash", async () => {
    const kmNode = findNodeByFsPath(repo, "+km.md")
    expect(kmNode, "must find +km.md node").toBeDefined()
    const rootId = findRepoRoot(repo)

    const driver = withDiagnostics(
      createBoardDriver(repo, rootId, {
        columns: 120,
        rows: 30,
        viewMode: "cards",
        incremental: false,
      }),
      { checkIncremental: false, checkStability: false, skipLines: [0, -1] },
    )

    const pane = getActiveBoardPane(driver.store.getState())
    if (!pane) throw new Error("no active board pane")
    dispatchSelection({ sel: pane.sel }, nodeSelect(kmNode!.id as ID))
    await driver.press("")

    await driver.press("Enter")
    await driver.press("X")
    await driver.press("Escape")

    // Fire the entire countdown so rename EXECUTES, then zoom out.
    let crashed: unknown = null
    try {
      vi.advanceTimersByTime(5500)
      await driver.press("Z")
    } catch (err) {
      crashed = err
    }

    expect(crashed, `zoom-out after rename executes should not throw: ${crashed}`).toBeNull()
  }, 60_000)
})
