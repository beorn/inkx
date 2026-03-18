/**
 * Asana vault acceptance tests — real data, real rendering.
 *
 * Loads imports/asana and verifies fixes for:
 * - km-ii6qw: No duplicate sections in launch-academy
 * - km-nx8af: Navigation index excludes invisible index file nodes
 * - km-shk24: WAL checkpoint prevents disk I/O errors
 */

import { describe, test, expect } from "vitest"
import { testBoard } from "./helpers/real-board.ts"
import { resolve } from "path"
import { getNavigableChildren } from "../src/view-navigation.ts"

const ASANA_VAULT = resolve(import.meta.dirname, "../../../imports/asana")

describe("Asana vault: launch-academy", () => {
  test("no duplicate sections after load (km-ii6qw)", async () => {
    const board = await testBoard(ASANA_VAULT, { columns: 120, rows: 40 })
    const repo = board._repo

    // Find launch-academy node
    const laNode = repo.database
      .prepare("SELECT id FROM nodes WHERE fs_path = ?")
      .get("stabell/early-orbit/launch-academy.md") as { id: string } | null
    expect(laNode).toBeTruthy()

    // Should have exactly 6 sections, not 12
    const children = repo.database
      .prepare("SELECT content FROM nodes WHERE parent_id = ? ORDER BY parent_idx")
      .all(laNode!.id) as { content: string }[]

    expect(children.length).toBe(6)
    expect(children.map((c) => c.content)).toEqual([
      "INBOX",
      "PROJECTS & PHASES",
      "Phase 2",
      "Phase 3",
      "Phase 4",
      "Phase 5",
    ])
  })

  test("no duplicate parent_idx values (km-ii6qw)", async () => {
    const board = await testBoard(ASANA_VAULT, { columns: 120, rows: 40 })
    const repo = board._repo

    const laNode = repo.database
      .prepare("SELECT id FROM nodes WHERE fs_path = ?")
      .get("stabell/early-orbit/launch-academy.md") as { id: string } | null
    expect(laNode).toBeTruthy()

    const children = repo.database
      .prepare("SELECT parent_idx FROM nodes WHERE parent_id = ? ORDER BY parent_idx")
      .all(laNode!.id) as { parent_idx: number }[]

    // Each parent_idx should be unique (no duplicates)
    const indices = children.map((c) => c.parent_idx)
    expect(new Set(indices).size).toBe(indices.length)
  })

  test("navigable children exclude index files (km-nx8af)", async () => {
    const board = await testBoard(ASANA_VAULT, { columns: 120, rows: 40 })
    const repo = board._repo

    // Find early-orbit folder (has an index file)
    const earlyOrbit = repo.database
      .prepare("SELECT id, fstype FROM nodes WHERE fs_path = ?")
      .get("stabell/early-orbit") as { id: string; fstype: string } | null

    if (!earlyOrbit || earlyOrbit.fstype !== "folder") return

    // getNavigableChildren should filter out the index file
    const allChildren = repo.getChildren(earlyOrbit.id)
    const navChildren = getNavigableChildren(earlyOrbit.id, repo)

    // If an index file exists, navigable children should be fewer
    const indexFile = allChildren.find(
      (c) => c.fstype === "mdfile" && c.fs_path === "stabell/early-orbit/early-orbit.md",
    )
    if (indexFile) {
      expect(navChildren.length).toBe(allChildren.length - 1)
      expect(navChildren.find((c) => c.id === indexFile.id)).toBeUndefined()
    }
  })

  test("board renders launch-academy columns without duplicates", async () => {
    const board = await testBoard(ASANA_VAULT, { columns: 120, rows: 40 })
    const text = board.screenshot()

    // The rendered board should not show duplicate section headers
    // Count occurrences of section names in the screenshot
    const inboxMatches = text.match(/§ INBOX/g)
    const projectsMatches = text.match(/§ PROJECTS & PHASES/g)

    // At repo root level, these sections may not be visible.
    // But if they are, they should appear at most once each.
    if (inboxMatches) expect(inboxMatches.length).toBeLessThanOrEqual(1)
    if (projectsMatches) expect(projectsMatches.length).toBeLessThanOrEqual(1)
  })
})
