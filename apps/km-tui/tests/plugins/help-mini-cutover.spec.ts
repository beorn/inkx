/**
 * Parity tests — help overlay via legacy path vs. TEA plugin path.
 *
 * Every behavior the legacy path has (open, scroll, escape-to-close,
 * scroll-boundary) must hold identically on the plugin path when
 * KM_TEA_HELP=1. Both paths share the same assertions — the only
 * variable is which store the render observes.
 *
 * This is the integration side of the Phase 0 mini-cutover: unit tests
 * for the reducer live in `with-help-overlay.test.ts`. These tests
 * drive keypresses through the command system and verify the end
 * user-visible behavior on both paths.
 */
import { beforeEach, describe, expect, test } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { getHelpStore, resetHelpStore } from "../../src/plugins/with-help-overlay.ts"

// ---------------------------------------------------------------------------
// Helper: run a test body against both paths (legacy + plugin)
// ---------------------------------------------------------------------------

function withBothPaths(name: string, body: (flagOn: boolean) => void): void {
  describe(name, () => {
    test("legacy path (KM_TEA_HELP unset)", () => {
      const prev = process.env.KM_TEA_HELP
      delete process.env.KM_TEA_HELP
      try {
        body(false)
      } finally {
        if (prev !== undefined) process.env.KM_TEA_HELP = prev
      }
    })

    test("plugin path (KM_TEA_HELP=1)", () => {
      const prev = process.env.KM_TEA_HELP
      process.env.KM_TEA_HELP = "1"
      resetHelpStore()
      try {
        body(true)
      } finally {
        if (prev === undefined) delete process.env.KM_TEA_HELP
        else process.env.KM_TEA_HELP = prev
        resetHelpStore()
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Parity tests — each must pass on both paths
// ---------------------------------------------------------------------------

describe("help overlay — mini-cutover parity", () => {
  beforeEach(() => {
    // Always start from a known singleton state — a leftover plugin
    // store from a prior test could otherwise cross-contaminate.
    resetHelpStore()
  })

  withBothPaths("? opens the help overlay", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    expect(app.state.overlay).toBeNull()

    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    if (flagOn) {
      expect(getHelpStore().getState()).toEqual({ visible: true, scrollOffset: 0 })
    }
  })

  withBothPaths("Escape closes the help overlay", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    app.press("Escape")
    expect(app.state.overlay).toBeNull()

    if (flagOn) {
      expect(getHelpStore().getState()).toEqual({ visible: false, scrollOffset: 0 })
    }
  })

  withBothPaths("opening help resets scroll offset", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    // Open & scroll
    app.command("show_help")
    app.press("j") // bound to help.scroll_down when help is open
    app.press("j") // bound to help.scroll_down when help is open
    app.press("j") // bound to help.scroll_down when help is open

    // Close & re-open — offset must be back to 0
    app.press("Escape")
    app.command("show_help")

    app.withStore((s) => expect(s.ui.helpScrollOffset).toBe(0))

    if (flagOn) {
      expect(getHelpStore().getState()).toEqual({ visible: true, scrollOffset: 0 })
    }
  })

  withBothPaths("scrolling help overlay updates scroll offset", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    app.withStore((s) => expect(s.ui.helpScrollOffset).toBe(0))

    app.press("j") // bound to help.scroll_down when help is open
    app.press("j") // bound to help.scroll_down when help is open
    app.withStore((s) => expect(s.ui.helpScrollOffset).toBe(2))

    app.press("k") // bound to help.scroll_up when help is open
    app.withStore((s) => expect(s.ui.helpScrollOffset).toBe(1))

    if (flagOn) {
      expect(getHelpStore().getState()).toEqual({ visible: true, scrollOffset: 1 })
    }
  })

  withBothPaths("scroll_up at offset 0 stays at 0 (floor)", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    app.press("k") // bound to help.scroll_up when help is open // attempt to go below 0
    app.withStore((s) => expect(s.ui.helpScrollOffset).toBe(0))

    if (flagOn) {
      expect(getHelpStore().getState().scrollOffset).toBe(0)
    }
  })

  withBothPaths("help overlay is visible on screen when open", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    // Help overlay renders section headers like "NAVIGATION" — verify
    // SOMETHING help-specific is on screen. Exact text checked loosely.
    expect(app.state.overlay).toBe("help")
    // Anything rendered from the help content (section label, hotkey, etc.)
    expect(app).toContainText("NAVIGATION")

    if (flagOn) {
      expect(getHelpStore().getState().visible).toBe(true)
    }
  })

  withBothPaths("help overlay disappears from screen after close", (flagOn) => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    expect(app).toContainText("NAVIGATION")

    app.press("Escape")
    expect(app.state.overlay).toBeNull()

    if (flagOn) {
      expect(getHelpStore().getState().visible).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Plugin-specific tests — things that only make sense on the plugin path
// ---------------------------------------------------------------------------

describe("withHelpOverlay plugin — dispatch observability", () => {
  beforeEach(() => {
    resetHelpStore()
  })

  test("plugin subscribers see every state transition", () => {
    const prev = process.env.KM_TEA_HELP
    process.env.KM_TEA_HELP = "1"
    try {
      using app = createTestApp(item("board", item("col1", item("task1"))))

      const transitions: string[] = []
      const unsub = getHelpStore().subscribe(() => {
        const s = getHelpStore().getState()
        transitions.push(`${s.visible ? "V" : "H"}@${s.scrollOffset}`)
      })

      app.command("show_help") // H@0 → V@0
      app.press("j") // bound to help.scroll_down when help is open // V@0 → V@1
      app.press("j") // bound to help.scroll_down when help is open // V@1 → V@2
      app.press("Escape") // V@2 → H@0

      unsub()
      expect(transitions).toEqual(["V@0", "V@1", "V@2", "H@0"])
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_HELP
      else process.env.KM_TEA_HELP = prev
      resetHelpStore()
    }
  })

  test("plugin state matches legacy ui state after any action sequence", () => {
    const prev = process.env.KM_TEA_HELP
    process.env.KM_TEA_HELP = "1"
    try {
      using app = createTestApp(item("board", item("col1", item("task1"))))

      // A non-trivial action sequence — show, scroll, close, re-open, scroll.
      app.command("show_help")
      app.press("j") // bound to help.scroll_down when help is open
      app.press("j") // bound to help.scroll_down when help is open
      app.press("k") // bound to help.scroll_up when help is open
      app.press("Escape")
      app.command("show_help")
      app.press("j") // bound to help.scroll_down when help is open

      const plugin = getHelpStore().getState()
      app.withStore((s) => {
        expect(plugin.visible).toBe(s.ui.showHelp)
        expect(plugin.scrollOffset).toBe(s.ui.helpScrollOffset)
      })
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_HELP
      else process.env.KM_TEA_HELP = prev
      resetHelpStore()
    }
  })
})
