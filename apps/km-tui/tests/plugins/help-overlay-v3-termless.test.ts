/**
 * Termless verification — help overlay via `withHelpOverlay()` renders
 * correctly through a real terminal emulator.
 *
 * v3 is the unconditional plugin path after the km-tui.tea-help-overlay-v3
 * cutover, so no flag setup is required. The invariant under test: nothing
 * in the ANSI pipeline differs when v3 sources visibility — the bridge
 * swaps the state source, not the rendered component.
 */
import { afterEach, describe, expect, test } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { getHelpV3App, resetHelpV3App } from "../../src/plugins/help-overlay.v3.ts"

// Run these through the termless backend so we exercise the full ANSI
// pipeline the way the real terminal does.
const prevBackend = process.env.TEST_BACKEND
process.env.TEST_BACKEND = "termless"

afterEach(() => {
  resetHelpV3App()
})

describe("help overlay v3 — termless (real terminal emulator)", () => {
  test("? shows overlay, Escape closes, plugin state follows", async () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    // Open
    app.command("show_help")
    expect(app.state.overlay).toBe("help")
    expect(app).toContainText("NAVIGATION")
    expect(getHelpV3App().help.get().visible).toBe(true)

    // Scroll
    app.press("j")
    app.press("j")
    expect(getHelpV3App().help.get().scrollOffset).toBe(2)

    // Close — overlay state goes back to hidden+offset=0
    app.press("Escape")
    expect(app.state.overlay).toBeNull()
    expect(getHelpV3App().help.get()).toEqual({ visible: false, scrollOffset: 0 })
  })

  test("scroll keys (j/k) update the v3 plugin while help is open", async () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    expect(getHelpV3App().help.get()).toEqual({ visible: true, scrollOffset: 0 })

    app.press("j")
    app.press("j")
    app.press("j")
    expect(getHelpV3App().help.get().scrollOffset).toBe(3)

    app.press("k")
    expect(getHelpV3App().help.get().scrollOffset).toBe(2)
  })
})

// Restore original backend after this file.
process.env.TEST_BACKEND = prevBackend ?? ""
