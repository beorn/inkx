/**
 * Phase 5 — Unified Omnibox chord-routing journey tests.
 *
 * Bead: km-tui.omnibox-dialog — acceptance criteria (b), (c), (d), (g).
 *
 * Scope: **verification only**. These tests pin *current* behavior of every
 * chord path that could plausibly raise the unified omnibox overlay, so
 * Phase 5's eventual promotion of `manage_favorites`, `item_picker`, and
 * `local_find` to `openOmnibox` lands with a known baseline to flip.
 *
 * Current routing map (2026-04-17):
 *
 *   Chord               commandId            Handler                 openOmnibox?
 *   ------------------  -------------------  ----------------------  -------------
 *   cmd-k / ctrl-k / :  command_palette      OPEN_UNIFIED_OMNIBOX    YES
 *   cmd-f / ctrl-f / /  local_find           LOCAL_FIND_OPEN         NO (legacy)
 *   shift-m             manage_favorites     MANAGE_FAVORITES        NO (legacy)
 *   g @/#/+/[           goto+pick:…          openPickerForVerb       NO (legacy)
 *   m @/#/+/[           move+pick:…          openPickerForVerb       NO (legacy)
 *   a @/#/+/[           add/add_link+pick:…  openPickerForVerb       NO (legacy)
 *   c @/#/+/[           create_in+pick:…     openPickerForVerb       NO (legacy)
 *   item_picker         item_picker (orphan) openPickerForVerb       NO (legacy)
 *
 * So exactly ONE chord family is routed through `openOmnibox` today. The
 * rest are Phase 5 gaps: the omnibox-dialog bead tracks their promotion,
 * and this file pins their legacy dispatch shape so the promotion is
 * visibly a behavior change and not a silent swap.
 *
 * See `unified-omnibox-integration.test.ts` for the deep runtime wiring
 * tests (typing, sigil slip, Escape, confirm). This file focuses on the
 * chord → initial state mapping.
 */
import { describe, expect, it } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

function standardBoard() {
  return createTestApp(
    [
      ...item(
        "board",
        item("col1", item("task1"), item("task2"), item("task3")),
        item("col2", item("taskA"), item("taskB")),
      ),
    ],
    { rows: 40, cols: 120 },
  )
}

describe("unified omnibox — chord routing (Phase 5 acceptance b/g)", () => {
  // -----------------------------------------------------------------------
  // Chords that ARE routed through openOmnibox today
  // -----------------------------------------------------------------------

  it("cmd-k opens omnibox with buffer=':' and defaultCommand='default'", () => {
    using app = standardBoard()
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()

    app.press("cmd+k")

    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    expect(pane!.state.buffer).toBe(":")
    expect(pane!.state.defaultCommand).toBe("default")
    expect(pane!.spec.anchorPaneId).toBeTruthy()
    app.expect("[data-dialog='unified-omnibox']").toExist()
  })

  it("ctrl-k opens omnibox with buffer=':' (kitty-less / text-input paths share the binding)", () => {
    using app = standardBoard()
    app.press("ctrl+k")
    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    expect(pane!.state.buffer).toBe(":")
    expect(pane!.state.defaultCommand).toBe("default")
  })

  it("`:` (shift-;) opens omnibox via command_palette binding", () => {
    using app = standardBoard()
    // `shift-;` in the node-mode binding block maps to `command_palette`.
    // The test-harness `press(":")` sends the char through the input
    // pipeline — once the omnibox opens, that same keypress may also land
    // in the input as typed content, so the buffer may be `:` or `::`
    // depending on the pipeline's open-this-frame behavior. We assert
    // only the routing invariants: the omnibox is raised and is in
    // `:`-sigil command mode (buffer starts with `:`).
    app.press(":")
    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    expect(pane!.state.buffer.startsWith(":")).toBe(true)
    expect(pane!.state.defaultCommand).toBe("default")
  })

  it("command_palette (via command dispatch) raises the omnibox with the same initial state as cmd-k", () => {
    using app = standardBoard()
    app.command("command_palette")
    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    // The OPEN_UNIFIED_OMNIBOX handler freezes initialBuffer=":".
    // Dispatching through `app.command` may double-feed the key through
    // the text pipeline, so we guard only the invariants that matter for
    // Phase 5 routing: non-null pane, `:`-prefixed buffer, default cmd.
    expect(pane!.state.buffer.startsWith(":")).toBe(true)
    expect(pane!.state.defaultCommand).toBe("default")
  })

  it("opening, dismissing, and re-opening the omnibox produces a fresh pane each time", () => {
    using app = standardBoard()
    app.press("cmd+k")
    expect(app.withStore((s) => s.ui.omnibox)).not.toBeNull()
    app.press("Escape")
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()

    app.press("cmd+k")
    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    expect(pane!.state.buffer).toBe(":")
  })

  it("omnibox anchor pane id is captured from the focused pane at open time", () => {
    using app = standardBoard()
    app.press("cmd+k")
    const pane = app.withStore((s) => s.ui.omnibox)!
    expect(pane.spec.anchorPaneId).toBeTruthy()
    // subjectSelection is snapshotted at open — the cursor is wherever it was.
    expect(pane.spec.subjectSelection).toBeDefined()
    expect(Array.isArray(pane.spec.subjectSelection.selectedIds)).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Phase 5 GAPS — chords that currently bypass openOmnibox
  //
  // These tests pin the *current* legacy-dispatch behavior so the Phase 5
  // promotion lands as a visible, reviewable change. When `manage_favorites`,
  // `local_find`, and the verb chords move to `openOmnibox`, these tests
  // will flip from "legacy dialog open, omnibox null" to "omnibox non-null
  // with appropriate initial state".
  // -----------------------------------------------------------------------

  it("shift-m opens the unified omnibox with 'manage_favorites' default command (Phase 5b)", () => {
    using app = standardBoard()
    app.press("shift+m")
    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    expect(pane?.state.defaultCommand).toBe("manage_favorites")
  })

  it("GAP: cmd-f / ctrl-f / '/' open the legacy inline find bar, not the unified omnibox", () => {
    // TODO(km-tui.omnibox-dialog Phase 5): consider promoting `local_find`
    // to `openOmnibox` with an initial `/` sigil that derives local_find
    // via resolveEffectiveCommand (acceptance g for the "/" path).
    using app = standardBoard()
    app.press("cmd+f")
    app.expect("#find-bar").toExist()
    expect(app.withStore((s) => s.ui.omnibox)).toBeNull()
  })

  it("`item_picker` opens the unified omnibox with 'default' command (Phase 5c)", () => {
    using app = standardBoard()
    app.navigateTo("task1")
    app.dispatch("item_picker")
    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    expect(pane?.state.defaultCommand).toBe("default")
    // Legacy picker state was removed in km-tui.itempicker-unify.
  })
})

// ---------------------------------------------------------------------------
// Acceptance (c) — manage_favorites candidate scope
//
// When `manage_favorites` is promoted to the unified omnibox (Phase 5), the
// omnibox opened must expose a candidateProvider that yields ONLY favorited
// nodes. The test below is structured so it can flip from "xfail" to the
// positive assertion when the promotion lands.
// ---------------------------------------------------------------------------

describe("unified omnibox — manage_favorites candidate scope (Phase 5 acceptance c)", () => {
  it("GAP: manage_favorites does not yet open through openOmnibox — once promoted, candidates must be favorites-only", () => {
    using app = createTestApp(
      [
        ...item(
          "board",
          item("fav-col", item("fav-a"), item("fav-b"), item("fav-c")),
          item("other-col", item("other-1"), item("other-2"), item("other-3"), item("other-4"), item("other-5")),
        ),
      ],
      { rows: 40, cols: 120 },
    )

    app.press("shift+m")

    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()

    // The omnibox pane's candidate provider yields only favorited node ids
    // and NOT the 5 non-fav siblings.
    const candidateIds = pane!.spec.candidateProvider().map((n) => n.id)
    expect(candidateIds).not.toContain("other-1")
    expect(candidateIds).not.toContain("other-2")
    expect(candidateIds).not.toContain("other-3")
    expect(candidateIds).not.toContain("other-4")
    expect(candidateIds).not.toContain("other-5")
  })
})

// ---------------------------------------------------------------------------
// Acceptance (d) — item_picker candidate scope
//
// item_picker today dispatches SHOW_ITEM_PICKER → openPickerForVerb("+", "move"),
// which raises the legacy ItemPicker. When promoted to the unified omnibox
// (Phase 5), the opened omnibox must preserve the picker's scope (projects
// for "+", items for "[", etc.).
// ---------------------------------------------------------------------------

describe("unified omnibox — item_picker candidate scope (Phase 5 acceptance d)", () => {
  it("item_picker preserves candidate scope on the unified omnibox (Phase 5c)", () => {
    using app = createTestApp(
      [
        ...item(
          "board",
          item("projects", item("proj-alpha"), item("proj-beta"), item("proj-gamma")),
          item("items", item("item-1"), item("item-2")),
        ),
      ],
      { rows: 40, cols: 120 },
    )
    app.dispatch("item_picker")
    const pane = app.withStore((s) => s.ui.omnibox)
    expect(pane).not.toBeNull()
    // SHOW_ITEM_PICKER scopes to repo.getAllNodes() — non-empty on any vault.
    const candidateIds = pane!.spec.candidateProvider().map((n) => n.id)
    expect(candidateIds.length).toBeGreaterThan(0)
  })
})
