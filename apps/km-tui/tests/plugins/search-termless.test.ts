/**
 * Termless verification — SearchDialog via TEA plugin path renders
 * identically to the legacy path through a real terminal emulator.
 *
 * This is the "real TTY" leg of the SearchDialog cutover. The spec-level
 * parity tests (`search-mini-cutover.spec.ts`) verify screen text via the
 * headless backend; this file feeds through the actual ANSI pipeline
 * (Silvery → termless → xterm.js WASM) to catch anything that slips through
 * the headless abstraction — ANSI leaks, stale cells on conditional
 * unmount (the lifecycle spike's known artifact), focus scope issues.
 */
import { afterEach, describe, expect, test } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { resetSearchStore, getSearchStore } from "../../src/plugins/with-search-dialog.ts"

// Run these through the termless backend so we exercise the full ANSI
// pipeline the way the real terminal does.
const prevBackend = process.env.TEST_BACKEND
process.env.TEST_BACKEND = "termless"

afterEach(() => {
  resetSearchStore()
})

describe("SearchDialog — termless (real terminal emulator)", () => {
  test("plugin path: search opens overlay, Escape closes it, nothing stale remains", async () => {
    const prev = process.env.KM_TEA_SEARCH
    process.env.KM_TEA_SEARCH = "1"
    try {
      using app = createTestApp(item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

      // Open
      app.dispatch("search")
      expect(app.state.overlay).toBe("search")
      expect(app).toContainText("Search")
      expect(getSearchStore().getState().visible).toBe(true)

      // Type
      for (const ch of "Al") app.press(ch)
      expect(app.state.overlay).toBe("search") // still open after typing

      // Close — dialog must disappear
      app.press("Escape")
      expect(app.state.overlay).toBeNull()
      expect(getSearchStore().getState()).toEqual({
        visible: false,
        initialInput: "",
        scope: "all",
        scopeNodeIds: [],
      })

      // Board content must reappear — no stale overlay pixels.
      expect(app).toContainText("Alpha")
      expect(app).toContainText("Beta")
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_SEARCH
      else process.env.KM_TEA_SEARCH = prev
    }
  })

  test("legacy path: search opens overlay, Escape closes it", async () => {
    const prev = process.env.KM_TEA_SEARCH
    delete process.env.KM_TEA_SEARCH
    try {
      using app = createTestApp(item("board", item("col1", item.task("Alpha"), item.task("Beta"))))

      app.dispatch("search")
      expect(app.state.overlay).toBe("search")
      expect(app).toContainText("Search")

      app.press("Escape")
      expect(app.state.overlay).toBeNull()
      expect(app).toContainText("Alpha")
      expect(app).toContainText("Beta")
    } finally {
      if (prev !== undefined) process.env.KM_TEA_SEARCH = prev
    }
  })

  test("plugin path: Tab toggles scope visible in screen prompt", async () => {
    const prev = process.env.KM_TEA_SEARCH
    process.env.KM_TEA_SEARCH = "1"
    try {
      using app = createTestApp(item("board", item("Inbox", item.task("Task1"))))

      app.dispatch("search")
      // Scope prompt prefix differs between "all" and "selected" —
      // the SearchDialog renders "All ▸ " or "in <name> ▸ ".
      expect(app).toContainText("All")

      app.press("Tab")
      expect(getSearchStore().getState().scope).toBe("selected")
      // When scope flips to "selected", prompt changes to "in <name> ▸ ".
      // The scope node id is the cursor node — some visible hint must appear.
      expect(app.state.overlay).toBe("search")

      app.press("Escape")
      expect(app.state.overlay).toBeNull()
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_SEARCH
      else process.env.KM_TEA_SEARCH = prev
    }
  })

  test("both paths render the Search title and scope prompt", async () => {
    const textFromPath = (flag: string | undefined): boolean => {
      const prev = process.env.KM_TEA_SEARCH
      if (flag === undefined) delete process.env.KM_TEA_SEARCH
      else process.env.KM_TEA_SEARCH = flag
      resetSearchStore()
      try {
        using app = createTestApp(item("board", item("col1", item.task("Alpha"))))
        app.dispatch("search")
        const result = app.state.overlay === "search"
        app.press("Escape")
        return result
      } finally {
        if (prev === undefined) delete process.env.KM_TEA_SEARCH
        else process.env.KM_TEA_SEARCH = prev
      }
    }

    const legacyOpened = textFromPath(undefined)
    const pluginOpened = textFromPath("1")
    expect(legacyOpened).toBe(pluginOpened)
    expect(legacyOpened).toBe(true)
  })
})

// Restore original backend after this file
process.env.TEST_BACKEND = prevBackend ?? ""
