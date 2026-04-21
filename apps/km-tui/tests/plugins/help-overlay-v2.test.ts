/**
 * Help overlay v2 — parity tests for the `definePlugin({...})` cutover.
 *
 * Mirrors the structure of `with-help-overlay.test.ts` (reducer unit
 * tests) and `help-mini-cutover.spec.ts` (both-paths parity against the
 * command system). The v2 plugin is authored via the
 * `definePlugin` factory in @silvery/create — the apply/store is not
 * hand-rolled.
 *
 * Gate: every behavior the v1 flag (KM_TEA_HELP=1) exhibits must hold
 * identically on the v2 flag (KM_TEA_HELP_V2=1).
 */
import { beforeEach, describe, expect, test } from "vitest"
import { helpOverlay } from "../../src/plugins/help-overlay.v2.ts"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"

// ---------------------------------------------------------------------------
// Unit tests — pure plugin, no React, no command system
// ---------------------------------------------------------------------------

describe("helpOverlay v2 — definePlugin reducer", () => {
  beforeEach(() => helpOverlay.reset())

  test("show: hidden → visible with offset reset", () => {
    helpOverlay.dispatchOp("show")
    expect(helpOverlay.getState()).toEqual({ visible: true, scrollOffset: 0 })
  })

  test("show: visible → visible is a no-op (stable ref)", () => {
    helpOverlay.dispatchOp("show")
    const ref1 = helpOverlay.getState()
    helpOverlay.dispatchOp("show")
    expect(helpOverlay.getState()).toBe(ref1)
  })

  test("hide: visible → hidden resets offset", () => {
    helpOverlay.dispatchOp("show")
    helpOverlay.dispatchOp("scrollDown")
    helpOverlay.dispatchOp("hide")
    expect(helpOverlay.getState()).toEqual({ visible: false, scrollOffset: 0 })
  })

  test("toggle: flips visible", () => {
    helpOverlay.dispatchOp("toggle")
    expect(helpOverlay.getState().visible).toBe(true)
    helpOverlay.dispatchOp("toggle")
    expect(helpOverlay.getState().visible).toBe(false)
  })

  test("scrollUp clamps at 0", () => {
    helpOverlay.dispatchOp("show")
    helpOverlay.dispatchOp("scrollUp")
    expect(helpOverlay.getState().scrollOffset).toBe(0)
  })

  test("scrollDown increments while visible", () => {
    helpOverlay.dispatchOp("show")
    helpOverlay.dispatchOp("scrollDown")
    helpOverlay.dispatchOp("scrollDown")
    expect(helpOverlay.getState().scrollOffset).toBe(2)
  })

  test("scroll ops while hidden are no-ops (stable ref)", () => {
    const ref1 = helpOverlay.getState()
    helpOverlay.dispatchOp("scrollUp")
    helpOverlay.dispatchOp("scrollDown")
    expect(helpOverlay.getState()).toBe(ref1)
  })

  test("subscribers see every transition", () => {
    const transitions: string[] = []
    const unsub = helpOverlay.subscribe(() => {
      const s = helpOverlay.getState()
      transitions.push(`${s.visible ? "V" : "H"}@${s.scrollOffset}`)
    })
    helpOverlay.dispatchOp("show") // V@0
    helpOverlay.dispatchOp("scrollDown") // V@1
    helpOverlay.dispatchOp("scrollDown") // V@2
    helpOverlay.dispatchOp("hide") // H@0
    unsub()
    expect(transitions).toEqual(["V@0", "V@1", "V@2", "H@0"])
  })

  test("no-op dispatches do NOT notify subscribers", () => {
    let count = 0
    const unsub = helpOverlay.subscribe(() => count++)
    helpOverlay.dispatchOp("hide") // already hidden
    helpOverlay.dispatchOp("scrollUp") // hidden, no-op
    unsub()
    expect(count).toBe(0)
  })

  test("keys shorthand is recorded on the plugin", () => {
    expect(helpOverlay.keys).toEqual({
      "?": "toggle",
      Escape: "hide",
      k: "scrollUp",
      j: "scrollDown",
    })
  })

  test("opNames lists all declared ops", () => {
    expect([...helpOverlay.opNames].sort()).toEqual(["show", "hide", "toggle", "scrollUp", "scrollDown"].sort())
  })

  test("full op.type is namespaced via plugin name", () => {
    // Dispatch via the typed `.dispatch()` — the type string is what
    // external systems (pipeline, logging) see.
    const ops: string[] = []
    const unsub = helpOverlay.subscribe(() => ops.push("notified"))
    helpOverlay.dispatch({ type: "help.show" })
    helpOverlay.dispatch({ type: "help.hide" })
    unsub()
    // Ran through apply() → both caused state changes → notifications fired.
    expect(ops.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Integration test — drive through the command system with KM_TEA_HELP_V2=1
// ---------------------------------------------------------------------------

describe("helpOverlay v2 — end-to-end through the command system", () => {
  beforeEach(() => helpOverlay.reset())

  test("command → plugin state → rendered overlay", () => {
    const prev = process.env.KM_TEA_HELP_V2
    process.env.KM_TEA_HELP_V2 = "1"
    try {
      using app = createTestApp(item("board", item("col1", item("task1"))))

      app.command("show_help")
      expect(helpOverlay.getState()).toEqual({ visible: true, scrollOffset: 0 })
      expect(app.state.overlay).toBe("help")
      expect(app).toContainText("NAVIGATION")

      app.press("j")
      app.press("j")
      expect(helpOverlay.getState()).toEqual({ visible: true, scrollOffset: 2 })

      app.press("k")
      expect(helpOverlay.getState()).toEqual({ visible: true, scrollOffset: 1 })

      app.press("Escape")
      expect(helpOverlay.getState()).toEqual({ visible: false, scrollOffset: 0 })
      expect(app.state.overlay).toBeNull()
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_HELP_V2
      else process.env.KM_TEA_HELP_V2 = prev
      helpOverlay.reset()
    }
  })

  test("plugin state matches legacy ui state after arbitrary action sequence", () => {
    const prev = process.env.KM_TEA_HELP_V2
    process.env.KM_TEA_HELP_V2 = "1"
    try {
      using app = createTestApp(item("board", item("col1", item("task1"))))

      app.command("show_help")
      app.press("j")
      app.press("j")
      app.press("k")
      app.press("Escape")
      app.command("show_help")
      app.press("j")

      const v2 = helpOverlay.getState()
      app.withStore((s) => {
        expect(v2.visible).toBe(s.ui.showHelp)
        expect(v2.scrollOffset).toBe(s.ui.helpScrollOffset)
      })
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_HELP_V2
      else process.env.KM_TEA_HELP_V2 = prev
      helpOverlay.reset()
    }
  })
})
