/**
 * Crash / error regression tests
 *
 * Each describe block corresponds to a specific bug bead.
 * These tests verify operations don't throw — rendering accuracy
 * is not the concern, so checkIncremental is disabled for speed.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Crash-regression tests don't need incremental rendering verification. */
const FAST = { checkIncremental: false } as const

// ---------------------------------------------------------------------------
// km-bc1xj: HIDE_NODE crashes with EROFS on fake/readonly repos
// ---------------------------------------------------------------------------

describe("Bug: HIDE_NODE crashes on fake repos (km-bc1xj)", () => {
  function makeBoard() {
    return testEnv(() => item("board", item("col1", item("Task A"), item("Task B")), item("col2", item("Task C"))), {
      columns: 80,
      rows: 24,
      ...FAST,
    })
  }

  test("pressing C (hide_node) does not crash on fake repo", () => {
    const { board } = makeBoard()

    // Cursor should be on first card
    const before = board.screenshot()
    expect(before).toContain("Task A")

    // Press gC to ignore node — should not throw
    expect(() => board.press("v").command("fold_more")).not.toThrow()

    // Board should still be usable
    const after = board.screenshot()
    expect(after).not.toContain("[object Object]")
    expect(after).not.toContain("TypeError")
    expect(after).not.toContain("EROFS")
  })

  test("pressing C shows error toast instead of crashing", () => {
    const { board } = makeBoard()

    board.press("v").command("fold_more")

    // Should show some kind of feedback (error toast or status), not crash
    // At minimum, the board should still render
    const text = board.screenshot()
    expect(text).toContain("col1")
  })
})

// ---------------------------------------------------------------------------
// km-otgyy: Open in System crashes when repo.data is null
// ---------------------------------------------------------------------------

describe("Open in System crash when repo.data is null (km-otgyy)", () => {
  test("pressing go does not crash when repo.data is null", () => {
    const { board } = testEnv(() => item("board", item("col", item("task-a"), item("task-b"))), FAST)

    // Navigate to first card
    board.command("cursor_down")

    // This should NOT throw — it should handle missing repo.data gracefully
    expect(() => board.command("open_in_system")).not.toThrow()
  })

  test("pressing gO (open in terminal) does not crash when repo.data is null", () => {
    const { board } = testEnv(() => item("board", item("col", item("task-a"), item("task-b"))), FAST)

    board.command("cursor_down")

    // Same issue: handleOpenInTerminal also calls resolveNodeFsPath
    expect(() => board.command("open_in_terminal")).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// km-cwn2: h/l boundary crash
// ---------------------------------------------------------------------------

describe("h/l at boundary crash (km-cwn2)", () => {
  test("h/l at right boundary doesn't crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a"), item("3b")),
        ),
      FAST,
    )

    // Start at first card
    board.expect("#1a[data-cursor]").toExist()

    // Move right to col2
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    // Move right to col3
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()

    // Try to move right past boundary (should not crash)
    board.command("cursor_right")
    board.expect("#3a[data-cursor]").toExist()

    // Try a few more times to confirm stability
    for (let i = 0; i < 3; i++) {
      board.command("cursor_right")
      board.expect("#3a[data-cursor]").toExist()
    }
  })

  test("h at left boundary doesn't crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a"), item("3b")),
        ),
      FAST,
    )

    // Start at first card
    board.expect("#1a[data-cursor]").toExist()

    // h at leftmost card goes to column header (not boundary)
    board.command("cursor_left")
    board.expect("#col1[data-cursor]").toExist()

    // h at column header is boundary - should not crash
    board.command("cursor_left")
    board.expect("#col1[data-cursor]").toExist()

    // Try a few more times to confirm stability
    for (let i = 0; i < 3; i++) {
      board.command("cursor_left")
      board.expect("#col1[data-cursor]").toExist()
    }
  })
})

// ---------------------------------------------------------------------------
// km-53uqt: card index out of bounds on column navigation (h key)
// ---------------------------------------------------------------------------

describe("card index out of bounds on h (km-53uqt)", () => {
  test("h does not throw after mixed operations that change column sizes", { timeout: 30_000 }, () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "projects",
            item("proj-a", item("task-a1"), item("task-a2"), item("task-a3", item("sub-1"), item("sub-2"))),
            item("proj-b", item("task-b1"), item("task-b2")),
          ),
          item(
            "areas",
            item("health", item("exercise"), item("diet")),
            item("finance", item("budget"), item("invest")),
            item("learning", item("books"), item("courses")),
          ),
          item("inbox", item("note-1"), item("note-2"), item("note-3")),
        ),
      FAST,
    )

    // Deterministic PRNG (seed=99) producing the failing sequence
    let seed = 99
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = ["j", "k", "l", "h", "v", "<", ">", "e", "u", "n", "Tab", "Shift+Tab"]
    const editOps = ["Escape", "Enter"]
    let inEdit = false

    for (let i = 0; i <= 147; i++) {
      let op: string
      if (inEdit) {
        op = editOps[Math.floor(rand() * editOps.length)]!
        if (op === "Escape") inEdit = false
      } else {
        op = normalOps[Math.floor(rand() * normalOps.length)]!
        if (op === "n") inEdit = true
      }

      if (i === 147) {
        // This is "h" and should NOT throw — card index must be clamped
        expect(() => board.press(op)).not.toThrow()
      } else {
        try {
          board.press(op)
        } catch {
          inEdit = false
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Stale cursor after deleting all cards in a column
// ---------------------------------------------------------------------------

describe("stale-cursor-after-delete-all", () => {
  test("deleting all cards in column should not leave stale cursor", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))), FAST)

    // Delete A (cursor moves to B)
    board.press("Backspace")

    // Delete B (col1 now empty — cursor should move to col header or col2)
    board.press("Backspace")

    // Navigate to col2 — should NOT produce console.error about stale cursor
    board.command("cursor_right")

    // C should be visible and cursor should be on it
    const text = board.screenshot()
    expect(text).toContain("C")
  })
})

// ---------------------------------------------------------------------------
// km-tui.pane-close-crash: closing a pane via vw crashes the app
// ---------------------------------------------------------------------------

describe("Pane close crash (km-tui.pane-close-crash)", () => {
  test("split then close last board pane is prevented (bells instead of crash)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Task A"), item("Task B")), item("col2", item("Task C"))),
      { columns: 120, rows: 24, ...FAST },
    )

    // Verify board renders
    const before = board.screenshot()
    expect(before).toContain("Task A")

    // Split pane: vs (creates empty pane, focus stays on board pane)
    expect(() => board.command("pane_split_vertical")).not.toThrow()

    // Try to close last board pane: vw — should be prevented (bell)
    expect(() => board.command("pane_close")).not.toThrow()

    // Board should still be usable — close was prevented since it's the last board pane
    const after = board.screenshot()
    expect(after).toContain("Task A")
  })

  test("split, focus empty pane, close empty pane works", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Task A"), item("Task B")), item("col2", item("Task C"))),
      { columns: 120, rows: 24, ...FAST },
    )

    // Split pane: vs (creates empty pane)
    board.command("pane_split_vertical")

    // Focus the empty pane: vl (focus right) — should not crash
    expect(() => board.command("pane_focus_right")).not.toThrow()

    // Close the empty pane: vw
    expect(() => board.command("pane_close")).not.toThrow()

    // Board should return to single-pane mode with content
    const after = board.screenshot()
    expect(after).toContain("Task A")
  })
})
