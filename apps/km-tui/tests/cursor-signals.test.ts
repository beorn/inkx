/**
 * Cursor Visibility Regression Tests
 *
 * Ensures cursor NEVER lands on hidden/invalid nodes through all "shades" of hidden:
 * - .km/hidden file (excluded from the view lens at build time)
 * - Folded children (excluded by foldDepths in the view lens)
 * - After zoom (sel.root synced to new rootId)
 * - Mixed navigation sequences (j/k/h/l, fold, zoom)
 *
 * Root causes found (signals migration, 2026-04-05):
 * 1. clearSelection() called sel.deselect() — clears cursor. Fixed: sel.node.collapse()
 * 2. handleCursorMove cleared selection at size>0 — always true. Fixed: size>1
 * 3. sel.root not synced after zoom — empty walkOrder. Fixed: syncPaneSignals sets root
 *
 * These are permanent regression tests, not ad-hoc exploration.
 * Runtime invariants (checkInvariants) catch this at every keypress too.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Navigation: cursor persists through all movement commands
// =============================================================================

describe("cursor persistence through navigation", () => {
  test("j/k vertical navigation", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
      incremental: false,
    })
    for (const key of ["j", "j", "j", "k", "k"]) {
      app.press(key)
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    }
  })

  test("h/l horizontal navigation", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { incremental: false },
    )
    for (const key of ["l", "l", "h", "h"]) {
      app.press(key)
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    }
  })

  test("mixed j/k/h/l across 3 columns", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
      { incremental: false },
    )
    for (const key of ["j", "j", "l", "j", "l", "k", "h", "h", "k", "k", "j", "j", "j"]) {
      app.press(key)
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    }
  })

  test("boundary navigation (press past edges)", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))), { incremental: false })
    // Try to go past boundaries — cursor must never null
    for (const key of ["j", "j", "j", "j", "k", "k", "k", "k", "h", "h", "l", "l"]) {
      app.press(key)
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    }
  })
})

// =============================================================================
// Fold/unfold: cursor stays on visible nodes
// =============================================================================

describe("cursor persistence through fold/unfold", () => {
  test("fold hides children — cursor stays visible", () => {
    using app = createTestApp(item("board", item("col1", item("1a", item("sub1"), item("sub2")), item("1b"))), {
      incremental: false,
    })
    app.press("j") // col1
    app.press("j") // 1a
    app.press("H") // fold 1a
    const c = app.state.cursor
    expect(c, "cursor must not be null").not.toBeNull()
    expect(c).not.toBe("sub1")
    expect(c).not.toBe("sub2")
  })

  test("fold then navigate — cursor valid", () => {
    using app = createTestApp(item("board", item("col1", item("1a", item("sub1")), item("1b"))), {
      incremental: false,
    })
    app.press("j") // col1
    app.press("j") // 1a
    app.press("H") // fold
    app.press("j") // navigate after fold
    expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    app.press("k")
    expect(app.state.cursor, "cursor must not be null").not.toBeNull()
  })
})

// =============================================================================
// Zoom: cursor valid through zoom in/out
// =============================================================================

describe("cursor persistence through zoom", () => {
  test("zoom in + navigate", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
      incremental: false,
    })
    app.press("j") // col1
    app.command("zoom_inwards")
    for (const key of ["j", "j", "k"]) {
      app.press(key)
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    }
  })

  test("zoom in then out", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), { incremental: false })
    app.press("j") // col1
    app.command("zoom_inwards")
    app.press("j") // navigate inside
    expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    app.command("zoom_outwards")
    expect(app.state.cursor, "cursor must not be null").not.toBeNull()
  })
})

// =============================================================================
// Hidden nodes: cursor skips them
// =============================================================================

describe("cursor skips hidden nodes", () => {
  test("hidden column skipped during h/l navigation", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a")), item("col2-hidden", item("2a")), item("col3", item("3a"))),
      { incremental: false },
    )
    app.withStore((s) => {
      const pane = s.workspace.panes.get("main") as any
      if (pane?.signals) pane.signals.hiddenNodeIds(new Set(["col2-hidden"]))
    })
    app.press("l")
    app.withStore((s) => {
      const c = s.sel.node.cursor() as string | null
      expect(c, "cursor must not be null").not.toBeNull()
      expect(c).not.toBe("col2-hidden")
      expect(c).not.toBe("2a")
    })
  })
})

// =============================================================================
// Characterization: cursor signal invariants after move
// =============================================================================

describe("cursor signal invariants after move", () => {
  test("after j/k, cursor is on new node and not on old node", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
      incremental: false,
    })
    // Initial cursor on 1a
    expect(app.state.cursor).toBe("1a")

    // Move down to 1b
    app.press("j")
    expect(app.state.cursor).toBe("1b")

    // Move down to 1c
    app.press("j")
    expect(app.state.cursor).toBe("1c")

    // Move back up to 1b
    app.press("k")
    expect(app.state.cursor).toBe("1b")

    // Move back up to 1a
    app.press("k")
    expect(app.state.cursor).toBe("1a")
  })

  test("cursorDescendant propagates — parent card visible when cursor is on child", () => {
    using app = createTestApp(
      item("board", item("col1", item.folder("Parent", item("child-a"), item("child-b")), item("sibling"))),
      { incremental: false },
    )
    // Initial cursor is on first card (Parent)
    expect(app.state.cursor, "cursor must not be null").not.toBeNull()

    // Move down into the children (j navigates into the card's children)
    app.press("j") // col1 or next visible item
    app.press("j")
    app.press("j")

    // Cursor should be somewhere within the tree
    expect(app.state.cursor, "cursor must not be null").not.toBeNull()

    // Parent card title should still be visible on screen (breadcrumb)
    app.expect("#Parent").toExist()
    // Screen should show at least one child
    expect(app.text).toContain("child-a")
  })

  test("cursor recovery when current node is deleted — moves to sibling", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))), {
      incremental: false,
    })
    // Move to task-b
    app.press("j")
    expect(app.state.cursor).toBe("task-b")

    // Delete task-b
    app.command("delete_node")

    // Cursor should recover to a sibling (not null)
    const afterDelete = app.state.cursor
    expect(afterDelete, "cursor must not be null").not.toBeNull()
    expect(afterDelete).not.toBe("task-b")
    expect(["task-a", "task-c", "col1"]).toContain(afterDelete)

    // Verify the node is actually gone
    const children = app.repo.getChildren("col1").map((n: { id: string }) => n.id)
    expect(children).not.toContain("task-b")
  })
})
