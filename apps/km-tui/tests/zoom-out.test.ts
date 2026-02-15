/**
 * Tests for `u` key — zoom out to parent.
 *
 * Bead: km-tui.u-zoom-out
 *
 * Behavior:
 * - Press u: board root moves to parent node (zoom out one level)
 * - Cursor stays on the previously-rooted node
 * - If already at repo root: cursor moves to parent (navigation, not zoom)
 * - Nav history saved before zooming so user can go back with [ (nav_back)
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { item, testEnv, testEnvWithRepo } from "./helpers/board-test.ts"

describe("u zooms out to parent", () => {
  test("u zooms out one level, cursor stays on previously-rooted node", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )

    // Zoom into col1 via e (first move to column header)
    board.press("k") // card → column header
    board.expect("#col1[data-cursor]").toExist()
    board.press("e") // zoom into col1

    // Now col1 is the root, its children (1a, 1b) are visible as columns
    board.expect("#1a").toExist()
    board.expect("#1b").toExist()
    // col2 should not be visible (we zoomed into col1)
    board.expect("#col2").not.toExist()

    // Press u to zoom back out to board level
    board.press("u")

    // Should be back at board level with cursor on col1 (the previously-rooted node)
    board.expect("#col1[data-cursor]").toExist()
    board.expect("#col2").toExist()
  })

  test("u from deeply zoomed level zooms out one level at a time", () => {
    // Deep tree: board > col > parent > child1(gc1,gc2) + child2(gc3)
    const { board } = testEnv(() =>
      item("board",
        item("col",
          item("parent",
            item("child1", item("gc1"), item("gc2")),
            item("child2", item("gc3")),
          ),
        ),
      ),
    )

    // Zoom into parent (first card in col)
    board.press("e") // root=parent, columns=[child1, child2]
    board.expect("#child1").toExist()
    board.expect("#child2").toExist()

    // Zoom into child1 (cursor is on gc1, first card in child1)
    board.press("k") // go to column header (child1)
    board.press("e") // root=child1, columns=[gc1, gc2] (but gc1/gc2 are leaves)
    board.expect("#gc1").toExist()
    board.expect("#gc2").toExist()

    // u zooms out one level: root=child1 → root=parent, cursor on child1
    board.press("u")
    board.expect("#child1[data-cursor]").toExist()
    board.expect("#child2").toExist()

    // u again: root=parent → root=col, cursor on parent
    board.press("u")
    board.expect("#parent[data-cursor]").toExist()

    // u again: root=col → root=board, cursor on col
    board.press("u")
    board.expect("#col[data-cursor]").toExist()
  })

  test("u saves history so ] (nav_forward) can return to zoomed view", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col",
          item("parent",
            item("child1", item("gc1")),
            item("child2", item("gc2")),
          ),
        ),
      ),
    )

    // Zoom into parent — root=parent, columns=[child1, child2]
    board.press("e")
    board.expect("#child1").toExist()
    board.expect("#child2").toExist()

    // u zooms out: root=parent → root=col, cursor on parent
    // This saves history so we can go back to parent-as-root
    board.press("u")
    board.expect("#parent[data-cursor]").toExist()

    // ] (nav forward) should restore the zoomed-into-parent view
    board.press("]")
    board.expect("#child1").toExist()
    board.expect("#child2").toExist()
  })

  test("at repo root, u acts as cursor-up instead of zoom", () => {
    const { board } = testEnv(() =>
      item.root("board",
        item("col1", item("task1"), item("task2")),
      ),
    )

    // At repo root, cursor on first card
    board.expect("#task1[data-cursor]").toExist()

    // u should move cursor up (not zoom) since we're at repo root
    // task1 is first card → move to column header
    board.press("u")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("u closes detail pane before zooming", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col",
          item("card1", item("sub1")),
          item("card2", item("sub2")),
        ),
      ),
    )

    // Zoom into card1 (cursor starts on card1, card1 has children)
    board.press("e") // root=card1, sub1 is a column
    board.expect("#sub1").toExist()

    // Open detail pane with space (toggle)
    board.press(" ")

    // u should close detail pane first, not zoom
    board.press("u")
    // We should still be at card1 root (detail pane closed, zoom not yet executed)
    board.expect("#sub1").toExist()

    // Second u should actually zoom out to col
    board.press("u")
    board.expect("#card1[data-cursor]").toExist()
    board.expect("#card2").toExist()
  })

  test("u zooms out when viewing a file inside a repo (km view file.md scenario)", () => {
    // Simulates: km view /tmp/vt/CLAUDE.md
    // Repo root (folder) → file → section1, section2
    // Board starts rooted at the file, not the repo root
    const nodes = item.root("repo",
      item.file("file",
        item.section("section1", item("task1"), item("task2")),
        item.section("section2", item("task3")),
      ),
    )
    const repo = createFakeRepo({ nodes })

    // Start board rooted at the file (like km view file.md)
    const { board } = testEnvWithRepo(repo, "file")

    // Board should show file's children as columns
    board.expect("#section1").toExist()
    board.expect("#section2").toExist()

    // Press u — should zoom out from file to repo root
    board.press("u")

    // After zooming out, the file should be visible as a card/column
    // and cursor should be on the file node
    board.expect("#file[data-cursor]").toExist()
  })

  test("u zooms out from file to folder, then falls back to cursor-up at repo root", () => {
    // Deeper tree: repo > folder > file > sections
    const nodes = item.root("repo",
      item.folder("folder",
        item.file("file",
          item.section("sec1", item("t1")),
          item.section("sec2", item("t2")),
        ),
      ),
    )
    const repo = createFakeRepo({ nodes })

    // Start board rooted at file
    const { board } = testEnvWithRepo(repo, "file")

    board.expect("#sec1").toExist()
    board.expect("#sec2").toExist()

    // First u: zoom out from file to folder
    board.press("u")
    board.expect("#file[data-cursor]").toExist()

    // Second u: zoom out from folder to repo root
    board.press("u")
    board.expect("#folder[data-cursor]").toExist()

    // Third u: at repo root, falls back to cursor-up
    board.press("u")
    // repo root has parent_id null, so u acts as cursor-up
    board.expect("#repo[data-cursor]").toExist()
  })
})
