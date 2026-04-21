/**
 * Help overlay v3 — parity tests for the `pipe()` + `withHelpOverlay()` cutover.
 *
 * Mirrors the v2 parity matrix (`help-overlay-v2.test.ts`) and the legacy
 * both-paths matrix (`help-mini-cutover.spec.ts`). Every behavior the
 * legacy path or the v2 flag exhibits must hold identically on the v3
 * flag (KM_TEA_HELP_V3=1).
 *
 * What makes v3 different from v1/v2:
 *   - state is owned by a closure inside the pipe, not a module singleton
 *     or a definePlugin-owned store. `getHelpV3App()` exposes the process
 *     instance for dual-write paths (board-actions.ts) and React.
 *   - 4 discoverable commands are registered on `app.commands.help` via
 *     `withApp.keymap()` — verified below.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { getHelpV3App, resetHelpV3App, withHelpOverlay } from "../../src/plugins/help-overlay.v3.ts"
import { resetHelpStore } from "../../src/plugins/with-help-overlay.ts"
import { helpOverlay } from "../../src/plugins/help-overlay.v2.ts"
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
// Parity tests — drive real journeys through the command system under
// KM_TEA_HELP_V3=1 and compare against the legacy `ui` store.
// ---------------------------------------------------------------------------

function withFlag(flag: "KM_TEA_HELP_V3", body: () => void): void {
  const prev = process.env[flag]
  process.env[flag] = "1"
  resetHelpV3App()
  try {
    body()
  } finally {
    if (prev === undefined) delete process.env[flag]
    else process.env[flag] = prev
    resetHelpV3App()
  }
}

describe("help overlay v3 — parity through the km command system", () => {
  beforeEach(() => {
    resetHelpV3App()
  })
  afterEach(() => {
    resetHelpV3App()
  })

  test("? opens the help overlay, plugin + legacy both report visible", () => {
    withFlag("KM_TEA_HELP_V3", () => {
      using app = createTestApp(item("board", item("col1", item("task1"))))
      expect(app.state.overlay).toBeNull()

      app.command("show_help")
      expect(app.state.overlay).toBe("help")
      expect(getHelpV3App().help.get()).toEqual({ visible: true, scrollOffset: 0 })
    })
  })

  test("Escape closes the help overlay", () => {
    withFlag("KM_TEA_HELP_V3", () => {
      using app = createTestApp(item("board", item("col1", item("task1"))))

      app.command("show_help")
      expect(app.state.overlay).toBe("help")

      app.press("Escape")
      expect(app.state.overlay).toBeNull()
      expect(getHelpV3App().help.get()).toEqual({ visible: false, scrollOffset: 0 })
    })
  })

  test("j/k scroll when help is visible; k floors at 0", () => {
    withFlag("KM_TEA_HELP_V3", () => {
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
  })

  test("reopening help resets scroll offset to 0 (parity with legacy SHOW_HELP)", () => {
    withFlag("KM_TEA_HELP_V3", () => {
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
  })

  test("plugin state mirrors legacy ui state through an arbitrary action sequence", () => {
    withFlag("KM_TEA_HELP_V3", () => {
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

  test("help content renders on screen when visible", () => {
    withFlag("KM_TEA_HELP_V3", () => {
      using app = createTestApp(item("board", item("col1", item("task1"))))

      app.command("show_help")
      expect(app.state.overlay).toBe("help")
      expect(app).toContainText("NAVIGATION")

      app.press("Escape")
      expect(app.state.overlay).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Cross-version parity — same journey, same state transitions under any flag.
// ---------------------------------------------------------------------------

describe("help overlay v3 — state parity with v1 and v2 after identical input", () => {
  test("show → j×3 → k → Escape produces the same (visible, scrollOffset) on every path", () => {
    const journey = (
      flag: "KM_TEA_HELP" | "KM_TEA_HELP_V2" | "KM_TEA_HELP_V3" | "NONE",
    ): { visible: boolean; scrollOffset: number } => {
      // Reset every source before each run so no leftover state leaks.
      resetHelpV3App()
      resetHelpStore()
      helpOverlay.reset()

      const prev1 = process.env.KM_TEA_HELP
      const prev2 = process.env.KM_TEA_HELP_V2
      const prev3 = process.env.KM_TEA_HELP_V3
      delete process.env.KM_TEA_HELP
      delete process.env.KM_TEA_HELP_V2
      delete process.env.KM_TEA_HELP_V3
      if (flag !== "NONE") process.env[flag] = "1"

      try {
        using app = createTestApp(item("board", item("col1", item("task1"))))

        app.command("show_help")
        app.press("j")
        app.press("j")
        app.press("j")
        app.press("k")
        app.press("Escape")

        // Use the LEGACY ui store as ground truth — it's always written to.
        let result: { visible: boolean; scrollOffset: number } = { visible: false, scrollOffset: 0 }
        app.withStore((s) => {
          result = { visible: s.ui.showHelp, scrollOffset: s.ui.helpScrollOffset }
        })
        return result
      } finally {
        if (prev1 === undefined) delete process.env.KM_TEA_HELP
        else process.env.KM_TEA_HELP = prev1
        if (prev2 === undefined) delete process.env.KM_TEA_HELP_V2
        else process.env.KM_TEA_HELP_V2 = prev2
        if (prev3 === undefined) delete process.env.KM_TEA_HELP_V3
        else process.env.KM_TEA_HELP_V3 = prev3
      }
    }

    const legacy = journey("NONE")
    const v1 = journey("KM_TEA_HELP")
    const v2 = journey("KM_TEA_HELP_V2")
    const v3 = journey("KM_TEA_HELP_V3")

    expect(v1).toEqual(legacy)
    expect(v2).toEqual(legacy)
    expect(v3).toEqual(legacy)
  })
})
