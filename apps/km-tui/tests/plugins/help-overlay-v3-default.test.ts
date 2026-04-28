/**
 * HelpOverlay v3 — production default contract (post-cutover).
 *
 * After km-tui.tea-help-overlay-v3 cleanup, v3 is the unconditional plugin
 * path. v1 (`with-help-overlay.ts`) and v2 (`help-overlay.v2.ts`) are gone;
 * the KM_TEA_HELP / KM_TEA_HELP_V2 / KM_TEA_HELP_V3 flags no longer exist.
 *
 * This file is the regression lock that asserts:
 *   1. v3 plugin module exposes the AppPlugin shape and singleton.
 *   2. v3 is exercised on every `show_help` command without any flag.
 *   3. v3 plugin state stays in lock-step with the legacy `ui.showHelp`
 *      ground truth — the rest of km (command-bridge, escape cascade)
 *      still depends on the zustand mirror, so removing v3 must not
 *      desynchronize them.
 *   4. v1 + v2 source files have been deleted (catches accidental
 *      re-introduction during merges).
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { getHelpV3App, resetHelpV3App, withHelpOverlay } from "../../src/plugins/help-overlay.v3.ts"
import { createBaseApp } from "@silvery/create/plugins"
import { pipe } from "@silvery/create"

// ---------------------------------------------------------------------------
// AppPlugin shape — withHelpOverlay() composes onto BaseApp
// ---------------------------------------------------------------------------

describe("withHelpOverlay — AppPlugin shape contract", () => {
  test("withHelpOverlay() composes via pipe(createBaseApp(), withHelpOverlay())", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())

    // Capability surface present
    expect(typeof app.help.get).toBe("function")
    expect(typeof app.help.subscribe).toBe("function")

    // Initial state
    expect(app.help.get()).toEqual({ visible: false, scrollOffset: 0 })

    // Dispatch round-trip
    app.dispatch({ type: "help.show" })
    expect(app.help.get()).toEqual({ visible: true, scrollOffset: 0 })

    app.dispatch({ type: "help.scrollDown" })
    expect(app.help.get()).toEqual({ visible: true, scrollOffset: 1 })

    app.dispatch({ type: "help.hide" })
    expect(app.help.get()).toEqual({ visible: false, scrollOffset: 0 })
  })

  test("getHelpV3App() returns a stable singleton across calls", () => {
    resetHelpV3App()
    const a = getHelpV3App()
    const b = getHelpV3App()
    expect(a).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// Production default — no env flags required, v3 is always active
// ---------------------------------------------------------------------------

describe("help overlay v3 — production default (no flags)", () => {
  // Make sure no flag carries over from prior test runs in this process.
  const prevFlags = {
    v1: process.env.KM_TEA_HELP,
    v2: process.env.KM_TEA_HELP_V2,
    v3: process.env.KM_TEA_HELP_V3,
  }

  beforeEach(() => {
    delete process.env.KM_TEA_HELP
    delete process.env.KM_TEA_HELP_V2
    delete process.env.KM_TEA_HELP_V3
    resetHelpV3App()
  })

  afterEach(() => {
    if (prevFlags.v1 !== undefined) process.env.KM_TEA_HELP = prevFlags.v1
    if (prevFlags.v2 !== undefined) process.env.KM_TEA_HELP_V2 = prevFlags.v2
    if (prevFlags.v3 !== undefined) process.env.KM_TEA_HELP_V3 = prevFlags.v3
    resetHelpV3App()
  })

  test("show_help command flips the v3 plugin to visible without a flag", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    expect(getHelpV3App().help.get().visible).toBe(false)

    app.command("show_help")

    expect(getHelpV3App().help.get()).toEqual({ visible: true, scrollOffset: 0 })
    expect(app.state.overlay).toBe("help")
  })

  test("Escape closes both v3 plugin and the legacy ui mirror", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    app.command("show_help")
    app.press("Escape")

    expect(getHelpV3App().help.get()).toEqual({ visible: false, scrollOffset: 0 })
    expect(app.state.overlay).toBeNull()
    app.withStore((s) => expect(s.ui.showHelp).toBe(false))
  })

  test("v3 plugin state mirrors legacy ui through an arbitrary journey", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    app.press("j")
    app.press("j")
    app.press("k")
    app.press("Escape")
    app.command("show_help")
    app.press("j")

    const v3 = getHelpV3App().help.get()
    app.withStore((s) => {
      expect(v3.visible).toBe(s.ui.showHelp)
      expect(v3.scrollOffset).toBe(s.ui.helpScrollOffset)
    })
  })
})

// ---------------------------------------------------------------------------
// Cleanup regression lock — v1 + v2 plugin sources must stay deleted
// ---------------------------------------------------------------------------

describe("help overlay — v1 + v2 sources removed", () => {
  const pluginsDir = join(__dirname, "../../src/plugins")

  test("v1 (with-help-overlay.ts) source file is gone", () => {
    expect(existsSync(join(pluginsDir, "with-help-overlay.ts"))).toBe(false)
  })

  test("v1 (use-help-overlay.ts) hook is gone", () => {
    expect(existsSync(join(pluginsDir, "use-help-overlay.ts"))).toBe(false)
  })

  test("v2 (help-overlay.v2.ts) source file is gone", () => {
    expect(existsSync(join(pluginsDir, "help-overlay.v2.ts"))).toBe(false)
  })
})
