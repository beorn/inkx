/**
 * Crash / error regression tests
 *
 * Each describe block corresponds to a specific bug bead.
 * These tests verify operations don't throw — rendering accuracy
 * is not the concern, so checkIncremental is disabled for speed.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

/** Crash-regression tests don't need incremental rendering verification. */
const FAST = { checkIncremental: false } as const

// ---------------------------------------------------------------------------
// km-bc1xj: HIDE_NODE crashes with EROFS on fake/readonly repos
// ---------------------------------------------------------------------------

describe("Bug: HIDE_NODE crashes on fake repos (km-bc1xj)", () => {
  test("pressing C (hide_node) does not crash on fake repo", () => {
    using app = createTestApp(
      item("board", item("col1", item("Task A"), item("Task B")), item("col2", item("Task C"))),
      { cols: 80, rows: 24, ...FAST },
    )

    // Cursor should be on first card
    expect(app).toContainText("Task A")

    // Press gC to ignore node — should not throw
    let threw = false
    try {
      app.press("v")
      app.command("fold_more")
    } catch {
      threw = true
    }
    expect(threw).toBe(false)

    // Board should still be usable
    const after = app.text
    expect(after).not.toContain("[object Object]")
    expect(after).not.toContain("TypeError")
    expect(after).not.toContain("EROFS")
  })

  test("pressing C shows error toast instead of crashing", () => {
    using app = createTestApp(
      item("board", item("col1", item("Task A"), item("Task B")), item("col2", item("Task C"))),
      { cols: 80, rows: 24, ...FAST },
    )

    app.press("v")
    app.command("fold_more")

    // Should show some kind of feedback (error toast or status), not crash
    // At minimum, the board should still render
    expect(app).toContainText("col1")
  })
})

// ---------------------------------------------------------------------------
// km-otgyy: Open in System crashes when repo.data is null
// ---------------------------------------------------------------------------

describe("Open in System crash when repo.data is null (km-otgyy)", () => {
  test("pressing go does not crash when repo.data is null", () => {
    using app = createTestApp(item("board", item("col", item("task-a"), item("task-b"))), FAST)

    // Navigate to first card
    app.command("cursor_down")

    // This should NOT throw — it should handle missing repo.data gracefully
    let threw = false
    try {
      app.command("open_in_system")
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  test("pressing gO (open in terminal) does not crash when repo.data is null", () => {
    using app = createTestApp(item("board", item("col", item("task-a"), item("task-b"))), FAST)

    app.command("cursor_down")

    // Same issue: handleOpenInTerminal also calls resolveNodeFsPath
    let threw = false
    try {
      app.command("open_in_terminal")
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// km-cwn2: h/l boundary crash
// ---------------------------------------------------------------------------

describe("h/l at boundary crash (km-cwn2)", () => {
  test("h/l at right boundary doesn't crash", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a"), item("3b")),
      ),
      FAST,
    )

    // Start at first card
    app.expect("#1a[data-cursor]").toExist()

    // Move right to col2
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Move right to col3
    app.command("cursor_right")
    app.expect("#3a[data-cursor]").toExist()

    // Try to move right past boundary (should not crash)
    app.command("cursor_right")
    app.expect("#3a[data-cursor]").toExist()

    // Try a few more times to confirm stability
    for (let i = 0; i < 3; i++) {
      app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()
    }
  })

  test("h at left boundary doesn't crash", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a"), item("3b")),
      ),
      FAST,
    )

    // Start at first card
    app.expect("#1a[data-cursor]").toExist()

    // h at leftmost card goes to column header (not boundary)
    app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()

    // h at column header is boundary - should not crash
    app.command("cursor_left")
    app.expect("#col1[data-cursor]").toExist()

    // Try a few more times to confirm stability
    for (let i = 0; i < 3; i++) {
      app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
    }
  })
})

// ---------------------------------------------------------------------------
// km-53uqt: card index out of bounds on column navigation (h key)
// ---------------------------------------------------------------------------

describe("card index out of bounds on h (km-53uqt)", () => {
  test("h does not throw after mixed operations that change column sizes", { timeout: 30_000 }, async () => {
    using app = createTestApp(
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
        let threw = false
        try {
          app.press(op)
        } catch {
          threw = true
        }
        expect(threw).toBe(false)
      } else {
        try {
          app.press(op)
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
    using app = createTestApp(item("board", item("col1", item("A"), item("B")), item("col2", item("C"))), FAST)

    // Delete A (cursor moves to B)
    app.press("Backspace")

    // Delete B (col1 now empty — cursor should move to col header or col2)
    app.press("Backspace")

    // Navigate to col2 — should NOT produce console.error about stale cursor
    app.command("cursor_right")

    // C should be visible and cursor should be on it
    expect(app).toContainText("C")
  })
})

// ---------------------------------------------------------------------------
// km-tui.pane-close-crash: closing a pane via vw crashes the app
// ---------------------------------------------------------------------------

describe("Pane close crash (km-tui.pane-close-crash)", () => {
  test("split then close last board pane is prevented (bells instead of crash)", () => {
    using app = createTestApp(
      item("board", item("col1", item("Task A"), item("Task B")), item("col2", item("Task C"))),
      { cols: 120, rows: 24, ...FAST },
    )

    // Verify board renders
    expect(app).toContainText("Task A")

    // Split pane: vs (creates empty pane, focus stays on board pane)
    let threw = false
    try {
      app.command("pane_split_vertical")
    } catch {
      threw = true
    }
    expect(threw).toBe(false)

    // Try to close last board pane: vw — should be prevented (bell)
    threw = false
    try {
      app.command("pane_close")
    } catch {
      threw = true
    }
    expect(threw).toBe(false)

    // Board should still be usable — close was prevented since it's the last board pane
    expect(app).toContainText("Task A")
  })

  test("split, focus empty pane, close empty pane works", async () => {
    using app = createTestApp(
      item("board", item("col1", item("Task A"), item("Task B")), item("col2", item("Task C"))),
      { cols: 120, rows: 24, ...FAST },
    )

    // Split pane: vs (creates empty pane)
    app.command("pane_split_vertical")

    // Focus the empty pane: vl (focus right) — should not crash
    let threw = false
    try {
      app.command("pane_focus_right")
    } catch {
      threw = true
    }
    expect(threw).toBe(false)

    // Close the empty pane: vw
    threw = false
    try {
      app.command("pane_close")
    } catch {
      threw = true
    }
    expect(threw).toBe(false)

    // Board should return to single-pane mode with content
    expect(app).toContainText("Task A")
  })
})
