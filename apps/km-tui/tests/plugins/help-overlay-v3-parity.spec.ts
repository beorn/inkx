/**
 * Help overlay v3 — parity tests for the `pipe()` + `withHelpOverlay()` plugin.
 *
 * After the km-tui.tea-help-overlay-v3 cutover v3 is the only plugin path,
 * so these tests no longer compare against v1/v2 — they verify the v3
 * plugin's behaviour in isolation and against the legacy `ui.showHelp`
 * mirror that command-bridge + escape cascade still consume.
 *
 * What v3 owns:
 *   - state is held inside the pipe wrapper's closure, not a module
 *     singleton or a definePlugin-owned store. `getHelpV3App()` exposes
 *     the process instance for the board-actions mirror and React.
 *   - 4 discoverable commands are registered on `app.commands.help` via
 *     `withApp.keymap()` — verified below.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { getHelpV3App, resetHelpV3App, withHelpOverlay } from "../../src/plugins/help-overlay.v3.ts"
import { createBaseApp } from "@silvery/create/plugins"
import { pipe } from "@silvery/create"

// ---------------------------------------------------------------------------
// Unit tests — withHelpOverlay() plugin in isolation (no React, no commands)
// ---------------------------------------------------------------------------

describe("withHelpOverlay — plugin in isolation", () => {
  test("show: hidden → visible with scrollOffset reset", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())
    app.dispatch({ type: "help.show" })
    expect(app.help.get()).toEqual({ visible: true, scrollOffset: 0 })
  })

  test("show: visible → visible is a no-op (stable ref, no notify)", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())
    app.dispatch({ type: "help.show" })
    const ref1 = app.help.get()

    let notified = 0
    const unsub = app.help.subscribe(() => notified++)
    app.dispatch({ type: "help.show" })
    unsub()

    expect(app.help.get()).toBe(ref1)
    expect(notified).toBe(0)
  })

  test("hide: visible → hidden with scrollOffset reset", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())
    app.dispatch({ type: "help.show" })
    app.dispatch({ type: "help.scrollDown" })
    app.dispatch({ type: "help.scrollDown" })
    app.dispatch({ type: "help.hide" })
    expect(app.help.get()).toEqual({ visible: false, scrollOffset: 0 })
  })

  test("toggle: flips visible, resets scrollOffset on open", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())
    app.dispatch({ type: "help.toggle" })
    expect(app.help.get()).toEqual({ visible: true, scrollOffset: 0 })
    app.dispatch({ type: "help.toggle" })
    expect(app.help.get()).toEqual({ visible: false, scrollOffset: 0 })
  })

  test("scrollUp clamps at 0 when visible", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())
    app.dispatch({ type: "help.show" })
    app.dispatch({ type: "help.scrollUp" })
    expect(app.help.get()).toEqual({ visible: true, scrollOffset: 0 })
  })

  test("scroll ops are no-ops while hidden (stable ref, no notify)", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())
    const ref1 = app.help.get()
    let notified = 0
    const unsub = app.help.subscribe(() => notified++)

    app.dispatch({ type: "help.scrollUp" })
    app.dispatch({ type: "help.scrollDown" })
    unsub()

    expect(app.help.get()).toBe(ref1)
    expect(notified).toBe(0)
  })

  test("subscribers observe every real transition, in order", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())
    const transitions: string[] = []
    const unsub = app.help.subscribe(() => {
      const s = app.help.get()
      transitions.push(`${s.visible ? "V" : "H"}@${s.scrollOffset}`)
    })

    app.dispatch({ type: "help.show" }) // V@0
    app.dispatch({ type: "help.scrollDown" }) // V@1
    app.dispatch({ type: "help.scrollDown" }) // V@2
    app.dispatch({ type: "help.hide" }) // H@0
    unsub()

    expect(transitions).toEqual(["V@0", "V@1", "V@2", "H@0"])
  })

  test("unknown op types bubble to downstream chain (returns false at base)", () => {
    const app = pipe(createBaseApp(), withHelpOverlay())
    // `{type:"something.else"}` isn't handled by any plugin — BaseApp swallows
    // it silently. The invariant we care about: our wrapper didn't crash or
    // mutate help state.
    expect(() => app.dispatch({ type: "something.else" as "help.show" })).not.toThrow()
    expect(app.help.get()).toEqual({ visible: false, scrollOffset: 0 })
  })

  test("registers 4 keymap entries when the app satisfies AppWithApp", () => {
    // We construct the composed app manually (Object.assign, not spread)
    // to bypass the upstream withApp spread issue — see the note at the
    // top of help-overlay.v3.ts. When that lands, switch this to:
    //   pipe(createBaseApp(), withApp(), withHelpOverlay())
    const bindings: Array<{ key: string; command: { title: string; when?: () => boolean } }> = []
    const base = createBaseApp()
    const appWithApp = Object.assign(base, {
      models: {},
      commands: {},
      keymap(m: Record<string, { title: string; fn: () => void; when?: () => boolean }>) {
        for (const [key, command] of Object.entries(m)) bindings.push({ key, command })
      },
      getKeybindings: () => bindings,
      command: (_path: string) => undefined,
    })
    const app = withHelpOverlay()(appWithApp)

    const keys = bindings.map((b) => b.key).sort()
    expect(keys).toEqual(["?", "Escape", "j", "k"])
    expect(bindings.find((b) => b.key === "?")?.command.title).toBe("Toggle help")
    // `when` gates: scroll + Escape require help to be visible.
    expect(bindings.find((b) => b.key === "Escape")?.command.when?.()).toBe(false)
    app.dispatch({ type: "help.show" })
    expect(bindings.find((b) => b.key === "Escape")?.command.when?.()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Parity tests — drive real journeys through the command system; v3 is now
// the unconditional plugin path so no flag setup is needed.
// ---------------------------------------------------------------------------

describe("help overlay v3 — parity through the km command system", () => {
  beforeEach(() => {
    resetHelpV3App()
  })
  afterEach(() => {
    resetHelpV3App()
  })

  test("? opens the help overlay, plugin + legacy both report visible", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    expect(app.state.overlay).toBeNull()

    app.command("show_help")
    expect(app.state.overlay).toBe("help")
    expect(getHelpV3App().help.get()).toEqual({ visible: true, scrollOffset: 0 })
  })

  test("Escape closes the help overlay", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    app.press("Escape")
    expect(app.state.overlay).toBeNull()
    expect(getHelpV3App().help.get()).toEqual({ visible: false, scrollOffset: 0 })
  })

  test("j/k scroll when help is visible; k floors at 0", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    app.press("j")
    app.press("j")
    expect(getHelpV3App().help.get().scrollOffset).toBe(2)

    app.press("k")
    expect(getHelpV3App().help.get().scrollOffset).toBe(1)

    app.press("k")
    app.press("k") // attempt to go below 0
    expect(getHelpV3App().help.get().scrollOffset).toBe(0)
  })

  test("reopening help resets scroll offset to 0 (parity with legacy SHOW_HELP)", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    app.press("j")
    app.press("j")
    app.press("j")
    expect(getHelpV3App().help.get().scrollOffset).toBe(3)

    app.press("Escape")
    app.command("show_help")

    expect(getHelpV3App().help.get()).toEqual({ visible: true, scrollOffset: 0 })
    app.withStore((s) => expect(s.ui.helpScrollOffset).toBe(0))
  })

  test("plugin state mirrors legacy ui state through an arbitrary action sequence", () => {
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

  test("help content renders on screen when visible", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))

    app.command("show_help")
    expect(app.state.overlay).toBe("help")
    expect(app).toContainText("NAVIGATION")

    app.press("Escape")
    expect(app.state.overlay).toBeNull()
  })
})
