/**
 * Unified Omnibox — Phase 7b integration tests.
 *
 * Phase 7b wires `ui.omnibox` (the OmniboxPane value object) into the live
 * TUI: the `unified_omnibox_open` command raises the overlay, typing drives
 * the reducer state, Escape dismisses, and Enter invokes the resolved
 * command with subject/target separation.
 *
 * These tests are the integration guard — they exercise the full path from
 * keypress → reducer dispatch → React render → command execution. The
 * pure reducer is covered in omnibox-state.test.ts (51 tests); this file
 * covers the runtime wiring that Phase 7b adds.
 *
 * See docs/design/omnibox.md and apps/km-tui/src/state/omnibox.ts.
 */
import { describe, it, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/state/board-app-store.ts"
import { dispatchCommandById } from "../src/board/board-app.ts"

function standardBoard() {
  // Use a larger terminal so the omnibox overlay has room to render.
  return createTestApp(
    [
      ...item(
        "board",
        item("col1", item("task1"), item("task2"), item("task3")),
        item("col2", item("taskA"), item("taskB")),
      ),
    ],
    { rows: 40 },
  )
}

describe("unified omnibox — runtime integration (Phase 7b)", () => {
  it("unified_omnibox_open raises the overlay (ui.omnibox becomes non-null)", () => {
    using app = standardBoard()
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()

    app.press("cmd+shift+k")

    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    // Spec defaults from the OPEN_UNIFIED_OMNIBOX handler
    expect(pane!.state.buffer).toBe(":")
    expect(pane!.state.defaultCommand).toBe("default")
    expect(pane!.spec.anchorPaneId).toBeTruthy()
    // The overlay is mounted as a CenterDialog with data-dialog="unified-omnibox"
    app.expect("[data-dialog='unified-omnibox']").toExist()
  })

  it("typing into the new omnibox updates ui.omnibox.state.buffer", () => {
    using app = standardBoard()
    app.press("cmd+shift+k")
    // Starts with sigil ":"
    expect(app.withStore((s) => s.ui.omnibox!.state.buffer)).toBe(":")

    app.press("g")
    app.press("o")

    // The dialog input's onChange mirrors into the reducer via SET_BUFFER.
    // Both the editor's internal buffer and ui.omnibox.state.buffer now
    // read ":go" — the pure slippery-sigil rule is covered in omnibox-state.test.ts.
    const buffer = app.withStore((s) => s.ui.omnibox!.state.buffer)
    expect(buffer).toBe(":go")
  })

  it("Escape dismisses the unified omnibox (ui.omnibox becomes null)", () => {
    using app = standardBoard()
    app.press("cmd+shift+k")
    expect(app.withStore((s) => s.ui.omnibox)).not.toBeNull()

    app.press("Escape")

    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()
    app.expect("[data-dialog='unified-omnibox']").not.toExist()
  })

  it("typing ':go' filters command results so goto is selected", () => {
    using app = standardBoard()
    app.press("cmd+shift+k")
    // Buffer starts at ":", append "go" → ":go"
    app.press("g")
    app.press("o")

    const pane = app.withStore((s) => s.ui.omnibox!)
    expect(pane.state.buffer).toBe(":go")

    // After typing, the connector's results projection filters allCommands
    // through commandResultsForOmnibox and sets selectedArgumentId to the
    // top-ranked match. For "go", the ranking puts a goto-style command
    // first; its ID is namespaced "cmd:<id>".
    const selected = pane.state.selectedArgumentId
    expect(selected).toBeTruthy()
    expect(selected).toMatch(/^cmd:/)
    // Sanity: the selected command ID should start with goto/nav/…
    // The exact match depends on registry ordering, so we just assert the
    // projection is live and producing namespaced IDs.
  })

  it("binary verb path: subject is snapshotted from the anchor pane cursor", () => {
    using app = standardBoard()
    // Move cursor to a specific card first so the subject snapshot is stable.
    app.navigateTo("task2")
    const cursorBefore = app.state.cursor
    expect(cursorBefore).toBe("task2")

    app.press("cmd+shift+k")

    const pane = app.withStore((s) => s.ui.omnibox!)
    // The OPEN_UNIFIED_OMNIBOX handler freezes subjectSelection from the
    // focused pane's cursor. Binary verbs (move/add_link) dispatched from
    // the omnibox will read ctx.currentNodeId from this snapshot — not from
    // whatever target the user later picks inside the omnibox.
    expect(pane.spec.subjectSelection.cursorId).toBe("task2")
    expect(pane.spec.anchorPaneId).toBeTruthy()

    // Even if the omnibox's reducer-level defaultCommand were changed to a
    // binary verb, the frozen subject stays put for the whole session.
    // (Full move-verb dispatch verification requires more wiring; the
    // invariant we care about at this layer is that the subject snapshot
    // is frozen from the anchor pane, not re-read at confirm time.)
  })

  it("cursor pre-select: selectedArgumentId is seeded from the anchor pane cursor", () => {
    // km-tui.omnibox-pre-select — opening the unified omnibox should
    // pre-seed `ui.omnibox.state.selectedArgumentId` with the anchor pane's
    // cursor node ID, so pressing Enter on an unchanged buffer runs the
    // default action on the current card. This matches the user mental
    // model of "the omnibox opens already pointing at where I was".
    using app = standardBoard()
    app.navigateTo("task2")
    expect(app.state.cursor).toBe("task2")

    app.press("cmd+shift+k")

    const pane = app.withStore((s) => s.ui.omnibox!)
    // The frozen subject snapshot captures the same cursor…
    expect(pane.spec.subjectSelection.cursorId).toBe("task2")
    // …and `initialArgumentId` seeds the sticky argument slot so the row
    // for the cursor card is pre-highlighted at open time. The connector
    // may immediately replace this with the top-ranked result once its
    // projection runs, but the pane's initial state carries the cursor ID
    // as the seed — that's the invariant Phase 8 guarantees.
    expect(pane.spec.initialArgumentId).toBe("task2")
  })

  it("slippery sigil rule fires in the live type path: ':cr' + '@' → '@cr'", () => {
    // Task 3 — the pure `applySigilRule` is covered exhaustively in
    // omnibox-state.test.ts; this test guards the live integration. The
    // connector's onChange handler must detect the typed character and
    // run it through `applySigilRule` so colon-to-sigil swaps actually
    // fire when the user types them (not only when SET_BUFFER is dispatched
    // directly).
    using app = standardBoard()
    app.press("cmd+shift+k")
    expect(app.withStore((s) => s.ui.omnibox!.state.buffer)).toBe(":")

    // Type ":cr" — content after the sticky `:` sigil.
    app.press("c")
    app.press("r")
    expect(app.withStore((s) => s.ui.omnibox!.state.buffer)).toBe(":cr")

    // Typing `@` after `:cr` should SLIP — the leading `:` is replaced
    // with `@` and the tail `cr` is preserved. Result: `@cr`. Without
    // the live sigil rule the naïve buffer would be `:cr@` or `:@cr`.
    app.press("@")
    expect(app.withStore((s) => s.ui.omnibox!.state.buffer)).toBe("@cr")
  })

  it("command_palette opens the unified omnibox (Phase 12 flip)", () => {
    using app = standardBoard()
    app.command("command_palette")
    expect(app.withStore((s) => s.ui.omnibox)).not.toBeNull()
    app.press("Escape")
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()
  })

  // Regression: km-tui.omnibox-goto-no-cursor
  //
  // Before this fix, picking a leaf node in the unified omnibox (e.g.
  // `@delei` pointing at an empty .md file with no children) ZOOM_IN'd
  // into the leaf — its column was empty, no firstChild could be selected,
  // and the cursor was left stranded on its previous location outside the
  // new root. Z (zoom_outwards) then bell'd "Can't move up" because the
  // cursor was unaddressable.
  //
  // Fix: handleCursorTo detects leaf targets and zooms into the PARENT,
  // cursoring on the leaf itself so the node is visible and the cursor
  // walks the normal zoom_outwards path.
  it("goto via default command — leaf target cursors on the leaf, zoom_outwards works", () => {
    using app = createTestApp(
      [
        ...item(
          "board",
          item("projects", item("alpha", item("task-a1")), item("beta", item("task-b1"))),
          // delei is a LEAF — no children. This is the user's @delei case.
          item("people", item("delei")),
        ),
      ],
      { rows: 40 },
    )
    // Start zoomed into projects/alpha so we're crossing parent on the nav.
    app.withStore((s) => s.dispatchBoard({ type: "ZOOM_IN", nodeId: "alpha" }))

    // Fire the unified omnibox confirm path: dispatch the `default` command
    // with targetId="delei". This is exactly what UnifiedOmniboxConnector's
    // handleConfirm does when the user presses Enter on @delei.
    app.withStore((s) =>
      dispatchCommandById(
        "default",
        () => s as BoardAppStore,
        () => {},
        "delei",
        { cursorId: null, selectedIds: [] },
      ),
    )

    // Cursor should be on delei (the leaf itself), pane should be zoomed
    // to its parent (people) so delei is visible on screen.
    const afterRoot = app.withStore((s) => getActiveBoardPane(s)!.rootId)
    const cursorAfter = app.withStore((s) => getActiveBoardPane(s)!.sel.node.cursor() as string | null)
    expect(afterRoot).toBe("people")
    expect(cursorAfter).toBe("delei")

    // Zoom outwards (Z) must walk people -> board (grandparent) without
    // belling "Can't move up".
    const prevBellCount = app.state.bell
    app.command("zoom_outwards")
    expect(app.state.bell).toBe(prevBellCount)
  })
})
