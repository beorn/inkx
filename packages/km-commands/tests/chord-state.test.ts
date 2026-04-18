/**
 * Tests for chord state machine (chord-state.ts)
 */

import { describe, test, expect, beforeEach } from "vitest"
import { createChordState, type ChordCallbacks } from "../src/chord-state.ts"

/** Resolved binding shape returned by chord callbacks */
type Resolved = { commandId: string; targetId?: string }

/** Create a minimal chord callbacks mock */
function createCallbacks(
  opts: {
    prefixes?: Set<string>
    chords?: Map<string, Resolved>
    standalones?: Map<string, Resolved>
  } = {},
): ChordCallbacks {
  const prefixes = opts.prefixes ?? new Set(["z", "g"])
  const chords =
    opts.chords ??
    new Map<string, Resolved>([
      ["z:a", { commandId: "toggle_fold" }],
      ["z:M", { commandId: "fold_all_more" }],
      ["g:g", { commandId: "cursor_first" }],
      ["g:o", { commandId: "open_in_system" }],
    ])
  const standalones =
    opts.standalones ??
    new Map<string, Resolved>([
      ["z", { commandId: "fold_all_more" }],
      ["g", { commandId: "cursor_first" }],
    ])

  return {
    isChordPrefix: (key) => prefixes.has(key),
    resolveChord: (prefix, key) => chords.get(`${prefix}:${key}`) ?? null,
    resolveStandalone: (key) => standalones.get(key) ?? null,
  }
}

const noMods = { ctrl: false, shift: false }
const ctrlMod = { ctrl: true, shift: false }

describe("ChordState", () => {
  let state: ReturnType<typeof createChordState>
  let cb: ChordCallbacks

  beforeEach(() => {
    state = createChordState()
    cb = createCallbacks()
  })

  describe("basic chord resolution", () => {
    test("chord resolves on second key", () => {
      const r1 = state.processKey("z", false, noMods, {}, cb)
      expect(r1.type).toBe("pending")
      if (r1.type === "pending") expect(r1.prefix).toBe("z")

      const r2 = state.processKey("a", false, noMods, {}, cb)
      expect(r2.type).toBe("resolved")
      if (r2.type === "resolved") expect(r2.commandId).toBe("toggle_fold")
    })

    test("gg chord resolves to cursor_first", () => {
      state.processKey("g", false, noMods, {}, cb)
      const r = state.processKey("g", false, noMods, {}, cb)
      expect(r.type).toBe("resolved")
      if (r.type === "resolved") expect(r.commandId).toBe("cursor_first")
    })

    test("zM chord resolves to fold_all", () => {
      state.processKey("z", false, noMods, {}, cb)
      const r = state.processKey("M", false, noMods, {}, cb)
      expect(r.type).toBe("resolved")
      if (r.type === "resolved") expect(r.commandId).toBe("fold_all_more")
    })

    test("pending is null after resolution", () => {
      state.processKey("z", false, noMods, {}, cb)
      expect(state.pending).toBe("z")

      state.processKey("a", false, noMods, {}, cb)
      expect(state.pending).toBeNull()
    })
  })

  describe("timeout", () => {
    test("timeout returns pending prefix and clears state", () => {
      state.processKey("z", false, noMods, {}, cb)
      expect(state.pending).toBe("z")

      const prefix = state.timeout()
      expect(prefix).toBe("z")
      expect(state.pending).toBeNull()
    })

    test("timeout returns null when no pending prefix", () => {
      expect(state.timeout()).toBeNull()
    })
  })

  describe("cancel", () => {
    test("cancel clears pending state", () => {
      state.processKey("z", false, noMods, {}, cb)
      expect(state.pending).toBe("z")

      state.cancel()
      expect(state.pending).toBeNull()
    })

    test("cancel is safe when no pending prefix", () => {
      state.cancel() // Should not throw
      expect(state.pending).toBeNull()
    })
  })

  describe("modifier keys", () => {
    test("modifier keys skip chord detection for bare prefixes", () => {
      const r = state.processKey("z", true, ctrlMod, {}, cb)
      expect(r.type).toBe("passthrough")
      expect(state.pending).toBeNull()
    })

    test("non-prefix key passes through", () => {
      const r = state.processKey("j", false, noMods, {}, cb)
      expect(r.type).toBe("passthrough")
    })
  })

  describe("composite chord prefix (Ctrl+w)", () => {
    let ctrlWCb: ChordCallbacks

    beforeEach(() => {
      ctrlWCb = createCallbacks({
        prefixes: new Set(["Ctrl+w"]),
        chords: new Map<string, Resolved>([
          ["Ctrl+w:q", { commandId: "pane_close" }],
          ["Ctrl+w:v", { commandId: "pane_split_vertical" }],
        ]),
        standalones: new Map(), // Ctrl+w has no standalone fallback
      })
    })

    test("Ctrl+w enters pending state with composite prefix", () => {
      const r = state.processKey("w", true, ctrlMod, {}, ctrlWCb)
      expect(r.type).toBe("pending")
      if (r.type === "pending") expect(r.prefix).toBe("Ctrl+w")
      expect(state.pending).toBe("Ctrl+w")
    })

    test("Ctrl+w q resolves to pane_close", () => {
      state.processKey("w", true, ctrlMod, {}, ctrlWCb)
      const r = state.processKey("q", false, noMods, {}, ctrlWCb)
      expect(r.type).toBe("resolved")
      if (r.type === "resolved") expect(r.commandId).toBe("pane_close")
    })

    test("Ctrl+w followed by unmatched key cancels chord (no standalone)", () => {
      state.processKey("w", true, ctrlMod, {}, ctrlWCb)
      const r = state.processKey("x", false, noMods, {}, ctrlWCb)
      expect(r.type).toBe("cancelled")
    })

    test("timeout clears Ctrl+w pending state", () => {
      state.processKey("w", true, ctrlMod, {}, ctrlWCb)
      expect(state.pending).toBe("Ctrl+w")
      const prefix = state.timeout()
      expect(prefix).toBe("Ctrl+w")
      expect(state.pending).toBeNull()
    })
  })

  describe("unmatched second key", () => {
    // BUG km-tui.chord-invalid-bell: Previously, an unmatched second key would
    // "replay" — fire the prefix's standalone command and then resolve the
    // second key. That silently executed the leader's default (e.g., pressing
    // `g +` would run `g`'s "move to", ignoring the user's obvious intent to
    // enter a chord). The new contract: unmatched chord second key cancels
    // the chord so the caller can ring the bell — no leader fallback.
    test("cancels chord on unmatched second key (leader has standalone)", () => {
      state.processKey("g", false, noMods, {}, cb)
      const r = state.processKey("q", false, noMods, {}, cb)
      expect(r.type).toBe("cancelled")
      expect(state.pending).toBeNull()
    })

    test("cancels chord on unmatched second key (prefix `g`, second `+`)", () => {
      // Exact repro from bug report — `g` is both a chord prefix (gg → home)
      // and has a standalone (cursor_first aka "move to"). Pressing `+` with
      // no `g:+` chord binding must NOT execute `g`'s standalone.
      state.processKey("g", false, noMods, {}, cb)
      const r = state.processKey("+", false, noMods, {}, cb)
      expect(r.type).toBe("cancelled")
      expect(state.pending).toBeNull()
    })

    test("cancelled when prefix has no standalone binding", () => {
      const noStandalone = createCallbacks({
        standalones: new Map<string, Resolved>(), // No standalone bindings
      })
      state.processKey("z", false, noMods, {}, noStandalone)
      const r = state.processKey("q", false, noMods, {}, noStandalone)
      expect(r.type).toBe("cancelled")
    })

    test("Escape cancels pending chord", () => {
      state.processKey("z", false, noMods, {}, cb)
      expect(state.pending).toBe("z")

      const r = state.processKey("Escape", false, noMods, {}, cb)
      expect(r.type).toBe("cancelled")
      expect(state.pending).toBeNull()
    })

    test("Escape cancels chord even when standalone exists", () => {
      // g has a standalone (cursor_first), but Escape should still cancel, not replay
      state.processKey("g", false, noMods, {}, cb)
      const r = state.processKey("Escape", false, noMods, {}, cb)
      expect(r.type).toBe("cancelled")
      expect(state.pending).toBeNull()
    })
  })

  describe("sequential chords", () => {
    test("can process multiple chords in sequence", () => {
      // First chord: za
      state.processKey("z", false, noMods, {}, cb)
      const r1 = state.processKey("a", false, noMods, {}, cb)
      expect(r1.type).toBe("resolved")

      // Second chord: gg
      state.processKey("g", false, noMods, {}, cb)
      const r2 = state.processKey("g", false, noMods, {}, cb)
      expect(r2.type).toBe("resolved")
      if (r2.type === "resolved") expect(r2.commandId).toBe("cursor_first")
    })
  })
})
