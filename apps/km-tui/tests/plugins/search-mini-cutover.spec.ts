/**
 * Parity tests — SearchDialog via legacy path vs TEA plugin path.
 *
 * Every behavior the legacy path has (open, scope toggle, Escape-to-close,
 * Enter-to-confirm, initial-input consumption) must hold identically on the
 * plugin path when KM_TEA_SEARCH=1. Both paths share the same assertions — the
 * only variable is which store the render observes.
 *
 * SearchDialog is the first real Phase 1 validator — unlike HelpOverlay it has
 * text input + focus scope + grace period. See
 * `hub/km/tea-searchdialog-cutover-plan.md` for the full interaction inventory
 * and predicted friction points.
 */
import { beforeEach, describe, expect, test } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { getSearchStore, resetSearchStore } from "../../src/plugins/with-search-dialog.ts"

// ---------------------------------------------------------------------------
// Helper: run a test body against both paths (legacy + plugin)
// ---------------------------------------------------------------------------

function withBothPaths(name: string, body: (flagOn: boolean) => void): void {
  describe(name, () => {
    test("legacy path (KM_TEA_SEARCH unset)", () => {
      const prev = process.env.KM_TEA_SEARCH
      delete process.env.KM_TEA_SEARCH
      try {
        body(false)
      } finally {
        if (prev !== undefined) process.env.KM_TEA_SEARCH = prev
      }
    })

    test("plugin path (KM_TEA_SEARCH=1)", () => {
      const prev = process.env.KM_TEA_SEARCH
      process.env.KM_TEA_SEARCH = "1"
      resetSearchStore()
      try {
        body(true)
      } finally {
        if (prev === undefined) delete process.env.KM_TEA_SEARCH
        else process.env.KM_TEA_SEARCH = prev
        resetSearchStore()
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Parity tests — each must pass on both paths
// ---------------------------------------------------------------------------

describe("SearchDialog — mini-cutover parity", () => {
  beforeEach(() => {
    resetSearchStore()
  })

  withBothPaths("search command opens the dialog", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"))))
    expect(app.state.overlay).toBeNull()

    app.dispatch("search")
    expect(app.state.overlay).toBe("search")

    if (flagOn) {
      expect(getSearchStore().getState().visible).toBe(true)
    }
  })

  withBothPaths("Escape closes the dialog", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

    app.dispatch("search")
    expect(app.state.overlay).toBe("search")

    app.press("Escape")
    expect(app.state.overlay).toBeNull()

    if (flagOn) {
      expect(getSearchStore().getState().visible).toBe(false)
    }
  })

  withBothPaths("dialog opens with scope='all' by default", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

    app.dispatch("search")
    app.withStore((s) => expect(s.ui.searchScope).toBe("all"))

    if (flagOn) {
      expect(getSearchStore().getState().scope).toBe("all")
    }
  })

  withBothPaths("Tab toggles scope (all -> selected -> all)", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

    app.dispatch("search")
    app.press("Tab")
    app.withStore((s) => expect(s.ui.searchScope).toBe("selected"))
    if (flagOn) {
      expect(getSearchStore().getState().scope).toBe("selected")
    }

    app.press("Tab")
    app.withStore((s) => expect(s.ui.searchScope).toBe("all"))
    if (flagOn) {
      expect(getSearchStore().getState().scope).toBe("all")
    }
  })

  withBothPaths("typing a query keeps the dialog open (editing flows through TextInput)", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

    app.dispatch("search")
    for (const ch of "Al") app.press(ch)

    // The dialog must still be open after typing — printable chars flow through
    // useEditContext, NOT through the command system, so the plugin/legacy ui
    // state for `visible` must remain true.
    expect(app.state.overlay).toBe("search")
    if (flagOn) {
      expect(getSearchStore().getState().visible).toBe(true)
    }
  })

  withBothPaths("Escape after typing cancels without navigating", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    app.dispatch("search")
    for (const ch of "Alpha") app.press(ch)

    app.press("Escape")
    expect(app.state.overlay).toBeNull()

    // Both tasks still visible; no navigation happened.
    expect(app).toContainText("Alpha")
    expect(app).toContainText("Beta")

    if (flagOn) {
      expect(getSearchStore().getState().visible).toBe(false)
    }
  })

  withBothPaths("Enter after typing confirms (closes the dialog)", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    app.dispatch("search")
    for (const ch of "Alpha") app.press(ch)

    app.press("Enter")
    // Confirm closes the dialog regardless of whether a result was selected.
    expect(app.state.overlay).toBeNull()

    if (flagOn) {
      expect(getSearchStore().getState().visible).toBe(false)
    }
  })

  withBothPaths("reopening after close resets scope to 'all'", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

    app.dispatch("search")
    app.press("Tab") // scope -> selected
    app.press("Escape")

    app.dispatch("search")
    app.withStore((s) => expect(s.ui.searchScope).toBe("all"))
    if (flagOn) {
      expect(getSearchStore().getState().scope).toBe("all")
    }
  })

  withBothPaths("opening clears any previous initialInput buffer", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

    app.dispatch("search")
    // After mount, use-board-dialogs' useEffect clears searchDialogInitialInput
    app.withStore((s) => expect(s.ui.searchDialogInitialInput).toBe(""))
    if (flagOn) {
      // Plugin show() op writes initialInput="" by default; the legacy consume-on-mount
      // is the equivalent clear. Both should end at "".
      expect(getSearchStore().getState().initialInput).toBe("")
    }
  })

  withBothPaths("arrow down while open does not crash (navigates results)", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

    app.dispatch("search")
    for (const ch of "Al") app.press(ch) // ensure some query (>= MIN_QUERY_LENGTH = 2)

    // Arrow keys go through dialog.nav_down → dialogTargetRef.navDown → setSelectedIndex.
    // The dialog must remain visible.
    app.press("Down")
    expect(app.state.overlay).toBe("search")
    if (flagOn) {
      expect(getSearchStore().getState().visible).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Plugin-specific tests — things that only make sense on the plugin path
// ---------------------------------------------------------------------------

describe("withSearchDialog plugin — dispatch observability", () => {
  beforeEach(() => {
    resetSearchStore()
  })

  test("plugin subscribers see every dialog state transition", () => {
    const prev = process.env.KM_TEA_SEARCH
    process.env.KM_TEA_SEARCH = "1"
    try {
      using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

      const transitions: string[] = []
      const unsub = getSearchStore().subscribe(() => {
        const s = getSearchStore().getState()
        transitions.push(`${s.visible ? "V" : "H"}/${s.scope}`)
      })

      app.dispatch("search") // H/all -> V/all
      app.press("Tab") // V/all -> V/selected
      app.press("Tab") // V/selected -> V/all
      app.press("Escape") // V/all -> H/all

      unsub()
      expect(transitions).toEqual(["V/all", "V/selected", "V/all", "H/all"])
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_SEARCH
      else process.env.KM_TEA_SEARCH = prev
      resetSearchStore()
    }
  })

  test("plugin state matches legacy ui state after any action sequence", () => {
    const prev = process.env.KM_TEA_SEARCH
    process.env.KM_TEA_SEARCH = "1"
    try {
      using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

      // A non-trivial action sequence — open, toggle, close, re-open, toggle.
      app.dispatch("search")
      app.press("Tab")
      app.press("Tab")
      app.press("Escape")
      app.dispatch("search")
      app.press("Tab")

      const plugin = getSearchStore().getState()
      app.withStore((s) => {
        expect(plugin.visible).toBe(s.ui.showSearchDialog)
        expect(plugin.scope).toBe(s.ui.searchScope)
        // scopeNodeIds: plugin captures at open; ui maintains them until close.
        expect(plugin.scopeNodeIds).toEqual(s.ui.searchScopeNodeIds)
      })
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_SEARCH
      else process.env.KM_TEA_SEARCH = prev
      resetSearchStore()
    }
  })

  test("plugin state desync gracefully on cancel-then-reopen cycle", () => {
    const prev = process.env.KM_TEA_SEARCH
    process.env.KM_TEA_SEARCH = "1"
    try {
      using app = createTestApp(item("board", item("col1", item.task("Alpha"))))

      // Open, close, open, close — every cycle must converge.
      for (let i = 0; i < 3; i++) {
        app.dispatch("search")
        expect(getSearchStore().getState().visible).toBe(true)
        app.press("Escape")
        expect(getSearchStore().getState().visible).toBe(false)
      }
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_SEARCH
      else process.env.KM_TEA_SEARCH = prev
      resetSearchStore()
    }
  })
})
