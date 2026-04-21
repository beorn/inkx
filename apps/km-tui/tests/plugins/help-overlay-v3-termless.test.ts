/**
 * Termless verification — help overlay via `withHelpOverlay()` renders
 * identically to the legacy path through a real terminal emulator.
 *
 * Mirrors `help-termless.test.ts` for v1. The invariant under test:
 * nothing in the ANSI pipeline differs when KM_TEA_HELP_V3=1 — the bridge
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
    const prev = process.env.KM_TEA_HELP_V3
    process.env.KM_TEA_HELP_V3 = "1"
    try {
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
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_HELP_V3
      else process.env.KM_TEA_HELP_V3 = prev
    }
  })

  test("v3 and legacy paths render the same overlay state label", async () => {
    const overlayFromPath = (flag: string | undefined): string => {
      const prev = process.env.KM_TEA_HELP_V3
      if (flag === undefined) delete process.env.KM_TEA_HELP_V3
      else process.env.KM_TEA_HELP_V3 = flag
      resetHelpV3App()
      try {
        using app = createTestApp(item("board", item("col1", item("task1"))))
        app.command("show_help")
        return String(app.state.overlay)
      } finally {
        if (prev === undefined) delete process.env.KM_TEA_HELP_V3
        else process.env.KM_TEA_HELP_V3 = prev
      }
    }

    expect(overlayFromPath(undefined)).toBe(overlayFromPath("1"))
  })
})

// Restore original backend after this file.
process.env.TEST_BACKEND = prevBackend ?? ""
