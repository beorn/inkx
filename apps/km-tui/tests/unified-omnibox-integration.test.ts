/**
 * Unified Omnibox — runtime integration tests.
 *
 * Wires `ui.omnibox` (the OmniboxPane value object) into the live TUI:
 * `command_palette` raises the overlay, typing drives the reducer state,
 * Escape dismisses, and Enter invokes the resolved command with
 * subject/target separation.
 *
 * These tests are the integration guard — they exercise the full path
 * from keypress → reducer dispatch → React render → command execution.
 * The pure reducer is covered in omnibox-state.test.ts (51 tests); this
 * file covers the runtime wiring on top of silvery primitives.
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

describe("unified omnibox — runtime integration", () => {
  it("command_palette raises the overlay (ui.omnibox becomes non-null)", () => {
    using app = standardBoard()
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()

    app.press("cmd+k")

    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    // Spec defaults from the OPEN_UNIFIED_OMNIBOX handler — cmd+k uses
    // open_omnibox (universal mode, empty buffer). The : key binding triggers
    // command_palette which seeds ":" instead; see the `:`-path test below.
    expect(pane!.state.buffer).toBe("")
    expect(pane!.state.defaultCommand).toBe("default")
    expect(pane!.spec.anchorPaneId).toBeTruthy()
    // The overlay is mounted as a CenterDialog with data-dialog="unified-omnibox"
    app.expect("[data-dialog='unified-omnibox']").toExist()
  })

  it("typing into the new omnibox updates ui.omnibox.state.buffer", () => {
    using app = standardBoard()
    app.press("cmd+k")
    // open_omnibox → universal mode (empty buffer)
    expect(app.withStore((s) => s.ui.omnibox!.state.buffer)).toBe("")

    app.press("g")
    app.press("o")

    // The dialog input's onChange mirrors into the reducer via SET_BUFFER.
    const buffer = app.withStore((s) => s.ui.omnibox!.state.buffer)
    expect(buffer).toBe("go")
  })

  it("Escape dismisses the unified omnibox (ui.omnibox becomes null)", () => {
    using app = standardBoard()
    app.press("cmd+k")
    expect(app.withStore((s) => s.ui.omnibox)).not.toBeNull()

    app.press("Escape")

    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()
    app.expect("[data-dialog='unified-omnibox']").not.toExist()
  })

  it("typing ':go' filters command results so goto is selected", () => {
    using app = standardBoard()
    // Command-mode entry: dispatch command_palette directly (the `:`
    // keybinding would also fire the char through, producing "::").
    app.withStore((s) =>
      dispatchCommandById(
        "command_palette",
        () => s as BoardAppStore,
        () => {},
        undefined,
        {
          cursorId: null,
          selectedIds: [],
        },
      ),
    )
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
    // Post c3b4f74af (kind discriminator replaces cmd:/node: prefix), the
    // selectedArgumentId is the bare command id like "goto" or "open_omnibox"
    // rather than "cmd:goto". The ranking still produces live namespaced IDs.
    expect(selected).toMatch(/^(goto|go|nav)/)
  })

  it("binary verb path: subject is snapshotted from the anchor pane cursor", () => {
    using app = standardBoard()
    // Move cursor to a specific card first so the subject snapshot is stable.
    app.navigateTo("task2")
    const cursorBefore = app.state.cursor
    expect(cursorBefore).toBe("task2")

    app.press("cmd+k")

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

    app.press("cmd+k")

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
    // Command-mode entry via direct dispatch (see note in ':go' test above).
    app.withStore((s) =>
      dispatchCommandById(
        "command_palette",
        () => s as BoardAppStore,
        () => {},
        undefined,
        {
          cursorId: null,
          selectedIds: [],
        },
      ),
    )
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

  it("command_palette opens the unified omnibox (cmd-k path)", () => {
    // After Phase B the legacy Omnibox surface is gone — `command_palette`
    // now dispatches OPEN_UNIFIED_OMNIBOX directly. This test guards that
    // both entry points (the command id and the cmd-k keybind) land on the
    // same ui.omnibox overlay.
    using app = standardBoard()
    app.command("command_palette")
    expect(app.withStore((s) => s.ui.omnibox)).not.toBeNull()
    app.press("Escape")
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()

    app.press("cmd+k")
    expect(app.withStore((s) => s.ui.omnibox)).not.toBeNull()
    app.press("Escape")
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()
  })

  // Regression: km-tui.omnibox-fixed-width
  //
  // The omnibox dialog must be pinned to a stable width across all frames.
  // Typing progressively must not reflow the outer dialog as results stream
  // in or drop out. Both the measured layout boundingBox AND the rendered
  // double-border span (╔═══╗) must stay at identical columns across frames.
  //
  // The test probes both:
  //   1. `.boundingBox()` — the Flexily-computed layout rect of the outer
  //      CenterDialog wrapper. Catches layout-level reflow.
  //   2. The screen ANSI border span at the top of the dialog (╔…╗). Catches
  //      any delta where the ModalDialog's actual painted border moved even
  //      if the wrapper reported stable dims.
  it("dialog width is stable across frames as results stream in (regression)", () => {
    using app = createTestApp(
      [
        ...item(
          "board",
          item("projects", item("alpha"), item("beta"), item("gamma"), item("delta"), item("epsilon")),
          item("people", item("alice"), item("bob"), item("carol"), item("dave")),
          item("tags", item("urgent"), item("later"), item("done"), item("review")),
        ),
      ],
      { cols: 120, rows: 40 },
    )

    app.press("cmd+k")
    app.expect("[data-dialog='unified-omnibox']").toExist()

    // Scan one rendered screen for the dialog top-border corner pair and
    // return { start, end, width } in columns. Supports both double-line
    // (╔═══╗) and single-line / rounded (╭───╮, ┌───┐) borders since the
    // opencode-style refresh changed the default.
    const scanBorder = (): { start: number; end: number; width: number } | null => {
      const screen = app.screen.text
      const topLeft = /[╔╭┌]/
      const topRight = /[╗╮┐]/
      for (const line of screen.split("\n")) {
        const startMatch = line.search(topLeft)
        const endMatch = line.search(topRight)
        if (startMatch >= 0 && endMatch > startMatch) {
          return { start: startMatch, end: endMatch, width: endMatch - startMatch + 1 }
        }
      }
      return null
    }

    interface Frame {
      label: string
      box: { x: number; y: number; width: number; height: number } | null
      border: { start: number; end: number; width: number } | null
    }
    const frames: Frame[] = []
    const capture = (label: string) => {
      frames.push({
        label,
        box: app.q("[data-dialog='unified-omnibox']").boundingBox(),
        border: scanBorder(),
      })
    }

    capture("open")
    // Type a command-mode query — results filter as we go.
    app.press("g")
    capture(":g")
    app.press("o")
    capture(":go")
    app.press("t")
    capture(":got")
    app.press("o")
    capture(":goto")
    // Switch to a content-sigil mode — result set changes shape entirely.
    // The slippery-sigil rule rewrites ":goto" → "@goto" on the first sigil.
    app.press("@")
    capture("@goto")
    // Delete back to narrow the query further.
    app.press("Backspace")
    capture("@got")
    app.press("Backspace")
    capture("@go")
    app.press("Backspace")
    capture("@g")

    // Every frame must have the dialog mounted.
    for (const f of frames) {
      expect(f.box, `boundingBox must be present at ${f.label}`).not.toBeNull()
      expect(f.border, `double-border must be painted at ${f.label}`).not.toBeNull()
    }

    // All layout widths must equal the first — the dialog is pinned.
    const firstBoxWidth = frames[0]!.box!.width
    const firstBorder = frames[0]!.border!
    const history = frames
      .map((f) => `${f.label}: box.width=${f.box?.width} border=${f.border?.start}..${f.border?.end}`)
      .join("\n")
    for (const f of frames) {
      expect(f.box!.width, `layout width must be stable across frames:\n${history}`).toBe(firstBoxWidth)
      expect(f.border!.start, `border start column must be stable:\n${history}`).toBe(firstBorder.start)
      expect(f.border!.end, `border end column must be stable:\n${history}`).toBe(firstBorder.end)
    }

    // The border must fit within the layout box (the ModalDialog may render
    // an inner border inside an outer container with padding, so border.width
    // ≤ box.width is the correct invariant — not strict equality).
    expect(firstBorder.width).toBeLessThanOrEqual(firstBoxWidth)
    expect(firstBorder.width).toBeGreaterThan(0)
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

  // Phase 6 — km-tui.omnibox-cursor — cursor unification via focus.
  //
  // When the omnibox is open, the app's "current cursor" is the omnibox's
  // selectedArgumentId — the row the user is currently highlighting.
  // Arrowing through the result list moves the cursor; commands dispatched
  // via Enter read `ctx.currentNodeId` from that highlighted row, not from
  // the anchor pane's frozen subject.
  //
  // Journey: cursor starts on task-a1, open omnibox (cmd-k), narrow
  // results until `zephyr-target` is top-ranked, confirm. Expected: goto
  // fires against `zephyr-target` (the omnibox cursor at Enter time), NOT
  // task-a1 (the anchor subject at open time). The node name is chosen
  // deliberately to avoid collisions with command ids (`zephyr-*`) and to
  // give it children so the node is not classified as a task by the `[`
  // sigil filter.
  it("cmd-k → arrow → Enter dispatches goto against the omnibox's selected row (Phase 6)", () => {
    using app = createTestApp(
      [
        ...item(
          "board",
          item("projects", item("alpha", item("task-a1")), item("beta", item("task-b1"))),
          // Two leaves that both match the substring "zephyr" so the test
          // can exercise the arrow-down path (change selectedArgumentId
          // from the first match to the second).
          item("people", item("zephyr-alpha"), item("zephyr-beta")),
        ),
      ],
      { rows: 40 },
    )

    // Seed cursor somewhere OTHER than the eventual goto target so that
    // "cursor ends up on zephyr-beta" can only be explained by the
    // omnibox's selectedArgument, not by the frozen anchor subject.
    app.withStore((s) => s.dispatchBoard({ type: "ZOOM_IN", nodeId: "alpha" }))
    app.navigateTo("task-a1")
    expect(app.state.cursor).toBe("task-a1")

    // Open the unified omnibox. cmd-k opens in universal mode with an
    // empty buffer. Typing a unique substring ("zephyr") narrows the
    // results to the two matching leaf nodes — no command id contains
    // that token.
    app.press("cmd+k")
    expect(app.withStore((s) => s.ui.omnibox)).not.toBeNull()
    app.press("z")
    app.press("e")
    app.press("p")
    app.press("h")
    app.press("y")
    app.press("r")

    // First match is `zephyr-alpha` (top-ranked by iteration order).
    expect(app.withStore((s) => s.ui.omnibox!.state.selectedArgumentId)).toBe("zephyr-alpha")

    // Arrow down — the omnibox cursor moves to the second match. Per
    // Phase 6, this IS the app-wide cursor; the next Enter must act on
    // this row, not on the first match or the anchor pane's task-a1.
    app.press("ArrowDown")
    const argAfter = app.withStore((s) => s.ui.omnibox!.state.selectedArgumentId)
    expect(argAfter).toBe("zephyr-beta")

    // Enter confirms — fires the `default` command. Phase 6: the command
    // executor reads `ctx.currentNodeId` from `currentCursor()`, which
    // for an open omnibox is `selectedArgumentId` ("zephyr-beta"). The
    // `default` command dispatches CURSOR_TO against that node.
    app.press("Enter")

    // The omnibox must dismiss, and the board cursor must land on
    // zephyr-beta (zoomed to its parent so the leaf is visible).
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()
    const cursorAfter = app.withStore((s) => getActiveBoardPane(s)!.sel.node.cursor() as string | null)
    expect(cursorAfter).toBe("zephyr-beta")
  })

  // Phase 6 acceptance (b): closing the omnibox restores the app cursor
  // to the previously-focused pane. When the user dismisses the omnibox
  // without confirming, the anchor pane's cursor is unchanged — because
  // the omnibox never owned the cursor as an app-wide source-of-truth
  // write, only as a read-side projection.
  it("Escape restores the app cursor to the anchor pane (Phase 6)", () => {
    using app = createTestApp(
      [
        ...item(
          "board",
          item("projects", item("alpha", item("task-a1")), item("beta", item("task-b1"))),
          item("people", item("zephyr-alpha"), item("zephyr-beta")),
        ),
      ],
      { rows: 40 },
    )

    app.withStore((s) => s.dispatchBoard({ type: "ZOOM_IN", nodeId: "alpha" }))
    app.navigateTo("task-a1")
    expect(app.state.cursor).toBe("task-a1")

    app.press("cmd+k")
    app.press("z")
    app.press("e")
    app.press("p")
    app.press("h")
    app.press("y")
    app.press("r")
    app.press("ArrowDown")
    // Confirm the omnibox is now pointing at zephyr-beta…
    expect(app.withStore((s) => s.ui.omnibox!.state.selectedArgumentId)).toBe("zephyr-beta")

    // …then cancel. The anchor pane cursor must be untouched — the
    // omnibox's cursor never leaked into the pane as a write.
    app.press("Escape")
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()
    expect(app.state.cursor).toBe("task-a1")
  })
})
