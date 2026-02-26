/**
 * Verb x Location Tests
 *
 * Tests for the composable verb x location vocabulary:
 * target resolvers, verb constructors, grid generators, and integration.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  inbox,
  journal,
  home,
  archive,
  parent,
  first,
  last,
  fav,
  pick,
  goTo,
  moveTo,
  addTo,
  createIn,
  verbLocationGrid,
  ctrlVerbLocationGrid,
  SYSTEM_LOCS,
  PICKER_LOCS,
  VERBS,
  type TargetResolver,
} from "../src/verb-locations.ts"
import { REPO_LOCS } from "../src/locations.ts"
import { initCommandSystem } from "../src/ink-adapter.ts"
import { resolveChord, clearKeybindings, type KeybindingContext } from "../src/keybindings.ts"
import type { CommandContext } from "../src/types.ts"

const emptyCtx = {} as CommandContext

/** Default keybinding context (normal mode, no dialogs) */
function defaultKbCtx(): KeybindingContext {
  return {
    mode: "normal",
    hasMultiSelection: false,
    isInDetailPane: false,
    isInOutlineMode: false,
    isInlineEditing: false,
    currentNode: null,
    textInputFocused: false,
    searchDialogOpen: false,
    projectPickerOpen: false,
    newItemDialogOpen: false,
    datePromptOpen: false,
    filterDialogOpen: false,
    helpOverlayOpen: false,
    deleteConfirmOpen: false,
    consoleOpen: false,
    hasActiveToast: false,
  }
}

describe("verb-locations", () => {
  // =========================================================================
  // Target Resolvers
  // =========================================================================

  describe("target resolvers", () => {
    it("inbox returns REPO_LOCS.inbox", () => {
      expect(inbox(emptyCtx)).toBe(REPO_LOCS.inbox)
      expect(inbox(emptyCtx)).toBe("@inbox")
    })

    it("journal returns REPO_LOCS.journal", () => {
      expect(journal(emptyCtx)).toBe(REPO_LOCS.journal)
      expect(journal(emptyCtx)).toBe("@journal")
    })

    it("home returns REPO_LOCS.home", () => {
      expect(home(emptyCtx)).toBe(REPO_LOCS.home)
      expect(home(emptyCtx)).toBe("@next")
    })

    it("archive returns REPO_LOCS.archive", () => {
      expect(archive(emptyCtx)).toBe(REPO_LOCS.archive)
      expect(archive(emptyCtx)).toBe("@archive")
    })

    it("parent returns 'parent'", () => {
      expect(parent(emptyCtx)).toBe("parent")
    })

    it("first returns 'first'", () => {
      expect(first(emptyCtx)).toBe("first")
    })

    it("last returns 'last'", () => {
      expect(last(emptyCtx)).toBe("last")
    })

    it("fav(n) returns 'fav:N' for various n", () => {
      expect(fav(0)(emptyCtx)).toBe("fav:0")
      expect(fav(1)(emptyCtx)).toBe("fav:1")
      expect(fav(5)(emptyCtx)).toBe("fav:5")
      expect(fav(9)(emptyCtx)).toBe("fav:9")
    })

    it("pick(prefix) returns 'pick:PREFIX'", () => {
      expect(pick("#")(emptyCtx)).toBe("pick:#")
      expect(pick("@")(emptyCtx)).toBe("pick:@")
      expect(pick("+")(emptyCtx)).toBe("pick:+")
      expect(pick("[")(emptyCtx)).toBe("pick:[")
    })
  })

  // =========================================================================
  // Verb Constructors
  // =========================================================================

  describe("verb constructors", () => {
    describe("goTo", () => {
      it("returns GOTO_BOARD for board node IDs", () => {
        expect(goTo(inbox)(emptyCtx)).toEqual({ type: "GOTO_BOARD", boardId: "@inbox" })
        expect(goTo(journal)(emptyCtx)).toEqual({ type: "GOTO_BOARD", boardId: "@journal" })
        expect(goTo(home)(emptyCtx)).toEqual({ type: "GOTO_BOARD", boardId: "@next" })
        expect(goTo(archive)(emptyCtx)).toEqual({ type: "GOTO_BOARD", boardId: "@archive" })
      })

      it("returns JUMP_TO_FAVORITE for fav:N", () => {
        expect(goTo(fav(1))(emptyCtx)).toEqual({ type: "JUMP_TO_FAVORITE", favoriteNumber: 1 })
        expect(goTo(fav(0))(emptyCtx)).toEqual({ type: "JUMP_TO_FAVORITE", favoriteNumber: 0 })
        expect(goTo(fav(9))(emptyCtx)).toEqual({ type: "JUMP_TO_FAVORITE", favoriteNumber: 9 })
      })

      it("returns ZOOM_OUTWARDS for parent", () => {
        expect(goTo(parent)(emptyCtx)).toEqual({ type: "ZOOM_OUTWARDS" })
      })

      it("returns SHOW_PROJECT_PICKER for pick:*", () => {
        expect(goTo(pick("+"))(emptyCtx)).toEqual({ type: "SHOW_PROJECT_PICKER" })
        expect(goTo(pick("#"))(emptyCtx)).toEqual({ type: "SHOW_PROJECT_PICKER" })
        expect(goTo(pick("@"))(emptyCtx)).toEqual({ type: "SHOW_PROJECT_PICKER" })
      })

      it("returns null when target resolver returns null", () => {
        const nullTarget: TargetResolver = () => null
        expect(goTo(nullTarget)(emptyCtx)).toBeNull()
      })
    })

    describe("moveTo", () => {
      it("returns MOVE_TO_BOARD for board node IDs", () => {
        expect(moveTo(inbox)(emptyCtx)).toEqual({ type: "MOVE_TO_BOARD", boardId: "@inbox" })
        expect(moveTo(journal)(emptyCtx)).toEqual({ type: "MOVE_TO_BOARD", boardId: "@journal" })
        expect(moveTo(home)(emptyCtx)).toEqual({ type: "MOVE_TO_BOARD", boardId: "@next" })
        expect(moveTo(archive)(emptyCtx)).toEqual({ type: "MOVE_TO_BOARD", boardId: "@archive" })
      })

      it("returns MOVE_TO_FAVORITE for fav:N", () => {
        expect(moveTo(fav(3))(emptyCtx)).toEqual({ type: "MOVE_TO_FAVORITE", favoriteNumber: 3 })
        expect(moveTo(fav(0))(emptyCtx)).toEqual({ type: "MOVE_TO_FAVORITE", favoriteNumber: 0 })
      })

      it("returns OUTDENT_NODE for parent", () => {
        expect(moveTo(parent)(emptyCtx)).toEqual({ type: "OUTDENT_NODE" })
      })

      it("returns SHIFT_TO_TOP for first", () => {
        expect(moveTo(first)(emptyCtx)).toEqual({ type: "SHIFT_TO_TOP" })
      })

      it("returns SHIFT_TO_BOTTOM for last", () => {
        expect(moveTo(last)(emptyCtx)).toEqual({ type: "SHIFT_TO_BOTTOM" })
      })

      it("returns REPARENT_PICKER for pick:+", () => {
        expect(moveTo(pick("+"))(emptyCtx)).toEqual({ type: "REPARENT_PICKER" })
      })

      it("returns null when target resolver returns null", () => {
        const nullTarget: TargetResolver = () => null
        expect(moveTo(nullTarget)(emptyCtx)).toBeNull()
      })
    })

    describe("addTo", () => {
      it("returns ADD_LINK_TO_BOARD for board node IDs", () => {
        expect(addTo(inbox)(emptyCtx)).toEqual({ type: "ADD_LINK_TO_BOARD", boardId: "@inbox" })
        expect(addTo(journal)(emptyCtx)).toEqual({ type: "ADD_LINK_TO_BOARD", boardId: "@journal" })
      })

      it("returns SET_LABEL for pick:#", () => {
        expect(addTo(pick("#"))(emptyCtx)).toEqual({ type: "SET_LABEL" })
      })

      it("returns SET_ASSIGNEE for pick:@", () => {
        expect(addTo(pick("@"))(emptyCtx)).toEqual({ type: "SET_ASSIGNEE" })
      })

      it("returns REPARENT_PICKER for pick:+", () => {
        expect(addTo(pick("+"))(emptyCtx)).toEqual({ type: "REPARENT_PICKER" })
      })

      it("returns ADD_LINK for pick:[", () => {
        expect(addTo(pick("["))(emptyCtx)).toEqual({ type: "ADD_LINK" })
      })

      it("returns ADD_LINK_TO_FAVORITE for fav:N", () => {
        expect(addTo(fav(1))(emptyCtx)).toEqual({ type: "ADD_LINK_TO_FAVORITE", favoriteNumber: 1 })
        expect(addTo(fav(7))(emptyCtx)).toEqual({ type: "ADD_LINK_TO_FAVORITE", favoriteNumber: 7 })
      })

      it("returns null when target resolver returns null", () => {
        const nullTarget: TargetResolver = () => null
        expect(addTo(nullTarget)(emptyCtx)).toBeNull()
      })
    })

    describe("createIn", () => {
      it("returns CAPTURE_DIALOG for any target", () => {
        expect(createIn(inbox)(emptyCtx)).toEqual({ type: "CAPTURE_DIALOG" })
        expect(createIn(journal)(emptyCtx)).toEqual({ type: "CAPTURE_DIALOG" })
        expect(createIn(fav(1))(emptyCtx)).toEqual({ type: "CAPTURE_DIALOG" })
      })

      it("returns CAPTURE_DIALOG even with null target resolver", () => {
        const nullTarget: TargetResolver = () => null
        expect(createIn(nullTarget)(emptyCtx)).toEqual({ type: "CAPTURE_DIALOG" })
      })
    })
  })

  // =========================================================================
  // Registries
  // =========================================================================

  describe("registries", () => {
    it("SYSTEM_LOCS has expected keys", () => {
      expect(Object.keys(SYSTEM_LOCS).sort()).toEqual(["G", "a", "g", "h", "i", "j", "p"])
    })

    it("PICKER_LOCS has expected keys", () => {
      expect(Object.keys(PICKER_LOCS).sort()).toEqual(["#", "+", "@", "["])
    })

    it("VERBS has expected keys", () => {
      expect(Object.keys(VERBS).sort()).toEqual(["a", "c", "g", "m"])
    })

    it("VERBS prefixes match keys", () => {
      for (const [key, verb] of Object.entries(VERBS)) {
        expect(verb.prefix).toBe(key)
      }
    })
  })

  // =========================================================================
  // verbLocationGrid
  // =========================================================================

  describe("verbLocationGrid", () => {
    let grid: ReturnType<typeof verbLocationGrid>

    beforeEach(() => {
      grid = verbLocationGrid()
    })

    it("produces bindings with required fields", () => {
      for (const b of grid) {
        expect(b).toHaveProperty("chord")
        expect(b).toHaveProperty("key")
        expect(b).toHaveProperty("commandId")
        expect(b).toHaveProperty("execute")
        expect(typeof b.execute).toBe("function")
      }
    })

    it("all bindings have a chord prefix from VERBS", () => {
      const verbPrefixes = Object.values(VERBS).map((v) => v.prefix)
      for (const b of grid) {
        expect(verbPrefixes).toContain(b.chord)
      }
    })

    // --- Skip rules: nonsensical combinations ---

    it("does NOT produce a g (addTo first) binding", () => {
      const match = grid.find((b) => b.chord === "a" && b.key === "g")
      expect(match).toBeUndefined()
    })

    it("does NOT produce a G (addTo last) binding", () => {
      const match = grid.find((b) => b.chord === "a" && b.key === "G")
      expect(match).toBeUndefined()
    })

    it("does NOT produce a p (addTo parent) binding", () => {
      const match = grid.find((b) => b.chord === "a" && b.key === "p")
      expect(match).toBeUndefined()
    })

    it("does NOT produce c + system locations except c i", () => {
      const cSystemBindings = grid.filter((b) => b.chord === "c" && Object.keys(SYSTEM_LOCS).includes(b.key))
      // Only c i should exist
      expect(cSystemBindings).toHaveLength(1)
      expect(cSystemBindings[0]!.key).toBe("i")
    })

    it("does NOT produce c + favorite bindings", () => {
      const cFavBindings = grid.filter((b) => b.chord === "c" && b.key.match(/^[0-9]$/))
      expect(cFavBindings).toHaveLength(0)
    })

    it("does NOT produce c + picker locations except c #", () => {
      const cPickerBindings = grid.filter((b) => b.chord === "c" && Object.keys(PICKER_LOCS).includes(b.key))
      expect(cPickerBindings).toHaveLength(1)
      expect(cPickerBindings[0]!.key).toBe("#")
    })

    // --- Positive: expected combinations exist ---

    it("produces g i (goTo inbox)", () => {
      const b = grid.find((b) => b.chord === "g" && b.key === "i")
      expect(b).toBeDefined()
      expect(b!.commandId).toBe("goto")
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "GOTO_BOARD", boardId: "@inbox" })
    })

    it("produces m j (moveTo journal)", () => {
      const b = grid.find((b) => b.chord === "m" && b.key === "j")
      expect(b).toBeDefined()
      expect(b!.commandId).toBe("move")
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "MOVE_TO_BOARD", boardId: "@journal" })
    })

    it("produces g p (goTo parent = ZOOM_OUTWARDS)", () => {
      const b = grid.find((b) => b.chord === "g" && b.key === "p")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "ZOOM_OUTWARDS" })
    })

    it("produces m p (moveTo parent = OUTDENT_NODE)", () => {
      const b = grid.find((b) => b.chord === "m" && b.key === "p")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "OUTDENT_NODE" })
    })

    it("produces m g (moveTo first = SHIFT_TO_TOP)", () => {
      const b = grid.find((b) => b.chord === "m" && b.key === "g")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "SHIFT_TO_TOP" })
    })

    it("produces m G (moveTo last = SHIFT_TO_BOTTOM)", () => {
      const b = grid.find((b) => b.chord === "m" && b.key === "G")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "SHIFT_TO_BOTTOM" })
    })

    it("produces a # (addTo pick # = SET_LABEL)", () => {
      const b = grid.find((b) => b.chord === "a" && b.key === "#")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "SET_LABEL" })
    })

    it("produces a @ (addTo pick @ = SET_ASSIGNEE)", () => {
      const b = grid.find((b) => b.chord === "a" && b.key === "@")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "SET_ASSIGNEE" })
    })

    it("produces a [ (addTo pick [ = ADD_LINK)", () => {
      const b = grid.find((b) => b.chord === "a" && b.key === "[")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "ADD_LINK" })
    })

    it("produces g + favorites 0-9", () => {
      for (let n = 0; n <= 9; n++) {
        const b = grid.find((b) => b.chord === "g" && b.key === String(n))
        expect(b).toBeDefined()
        expect(b!.targetId).toBe(`fav:${n}`)
        const action = b!.execute!(emptyCtx)
        expect(action).toEqual({ type: "JUMP_TO_FAVORITE", favoriteNumber: n })
      }
    })

    it("produces m + favorites 0-9", () => {
      for (let n = 0; n <= 9; n++) {
        const b = grid.find((b) => b.chord === "m" && b.key === String(n))
        expect(b).toBeDefined()
        expect(b!.targetId).toBe(`fav:${n}`)
        const action = b!.execute!(emptyCtx)
        expect(action).toEqual({ type: "MOVE_TO_FAVORITE", favoriteNumber: n })
      }
    })

    it("produces a + favorites 0-9", () => {
      for (let n = 0; n <= 9; n++) {
        const b = grid.find((b) => b.chord === "a" && b.key === String(n))
        expect(b).toBeDefined()
        const action = b!.execute!(emptyCtx)
        expect(action).toEqual({ type: "ADD_LINK_TO_FAVORITE", favoriteNumber: n })
      }
    })

    it("produces c i (createIn inbox = CAPTURE_DIALOG)", () => {
      const b = grid.find((b) => b.chord === "c" && b.key === "i")
      expect(b).toBeDefined()
      expect(b!.commandId).toBe("create_in")
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "CAPTURE_DIALOG" })
    })

    it("has a reasonable total count", () => {
      // g: 7 system + 10 fav + 4 picker = 21
      // m: 7 system + 10 fav + 4 picker = 21
      // a: 4 system (skip g, G, p) + 10 fav + 4 picker = 18
      // c: 1 system (only i) + 0 fav + 1 picker (only #) = 2
      // Total: 21 + 21 + 18 + 2 = 62
      expect(grid.length).toBe(62)
    })
  })

  // =========================================================================
  // ctrlVerbLocationGrid
  // =========================================================================

  describe("ctrlVerbLocationGrid", () => {
    let ctrlGrid: ReturnType<typeof ctrlVerbLocationGrid>

    beforeEach(() => {
      ctrlGrid = ctrlVerbLocationGrid()
    })

    it("produces Ctrl+g variants for all g-prefix bindings", () => {
      const baseGrid = verbLocationGrid()
      const gBindings = baseGrid.filter((b) => b.chord === "g")
      const ctrlGBindings = ctrlGrid.filter((b) => b.chord === "Ctrl+g")
      expect(ctrlGBindings.length).toBe(gBindings.length)
    })

    it("produces Ctrl+m variants for all m-prefix bindings", () => {
      const baseGrid = verbLocationGrid()
      const mBindings = baseGrid.filter((b) => b.chord === "m")
      const ctrlMBindings = ctrlGrid.filter((b) => b.chord === "Ctrl+m")
      expect(ctrlMBindings.length).toBe(mBindings.length)
    })

    it("Ctrl+m variants have when: hasKitty", () => {
      const ctrlMBindings = ctrlGrid.filter((b) => b.chord === "Ctrl+m")
      for (const b of ctrlMBindings) {
        expect(b.when).toBeDefined()
        // Verify the when predicate evaluates correctly
        const kbCtxWithKitty = { ...defaultKbCtx(), hasKitty: true }
        const kbCtxWithoutKitty = { ...defaultKbCtx(), hasKitty: false }
        expect((b.when as (ctx: KeybindingContext) => boolean)(kbCtxWithKitty)).toBe(true)
        expect((b.when as (ctx: KeybindingContext) => boolean)(kbCtxWithoutKitty)).toBe(false)
      }
    })

    it("Ctrl+g variants do NOT have a when predicate", () => {
      const ctrlGBindings = ctrlGrid.filter((b) => b.chord === "Ctrl+g")
      for (const b of ctrlGBindings) {
        expect(b.when).toBeUndefined()
      }
    })

    it("does NOT produce Ctrl+a or Ctrl+c variants", () => {
      const ctrlABindings = ctrlGrid.filter((b) => b.chord === "Ctrl+a")
      const ctrlCBindings = ctrlGrid.filter((b) => b.chord === "Ctrl+c")
      expect(ctrlABindings).toHaveLength(0)
      expect(ctrlCBindings).toHaveLength(0)
    })

    it("preserves commandId and key from base grid", () => {
      const baseGrid = verbLocationGrid()
      const gBindings = baseGrid.filter((b) => b.chord === "g")
      const ctrlGBindings = ctrlGrid.filter((b) => b.chord === "Ctrl+g")

      for (const ctrlB of ctrlGBindings) {
        const baseMatch = gBindings.find((b) => b.key === ctrlB.key)
        expect(baseMatch).toBeDefined()
        expect(ctrlB.commandId).toBe(baseMatch!.commandId)
      }
    })
  })

  // =========================================================================
  // Integration with command system
  // =========================================================================

  describe("integration with command system", () => {
    beforeEach(() => {
      initCommandSystem()
    })

    it("g i chord resolves to goto with @inbox target", () => {
      const kbCtx = defaultKbCtx()
      const resolved = resolveChord("g", "i", {}, kbCtx)
      expect(resolved).not.toBeNull()
      expect(resolved!.commandId).toBe("goto")
      expect(resolved!.targetId).toBe("@inbox")
    })

    it("m j chord resolves to move with @journal target", () => {
      const kbCtx = defaultKbCtx()
      const resolved = resolveChord("m", "j", {}, kbCtx)
      expect(resolved).not.toBeNull()
      expect(resolved!.commandId).toBe("move")
      expect(resolved!.targetId).toBe("@journal")
    })

    it("g 5 chord resolves to goto with fav:5 target", () => {
      const kbCtx = defaultKbCtx()
      const resolved = resolveChord("g", "5", {}, kbCtx)
      expect(resolved).not.toBeNull()
      expect(resolved!.commandId).toBe("goto")
      expect(resolved!.targetId).toBe("fav:5")
    })

    it("a # chord resolves to add with pick:# target", () => {
      const kbCtx = defaultKbCtx()
      const resolved = resolveChord("a", "#", {}, kbCtx)
      expect(resolved).not.toBeNull()
      expect(resolved!.commandId).toBe("add")
      expect(resolved!.targetId).toBe("pick:#")
    })

    it("execute functions produce correct actions via resolveChord", () => {
      const kbCtx = defaultKbCtx()
      const resolved = resolveChord("g", "i", {}, kbCtx)
      expect(resolved).not.toBeNull()
      expect(resolved!.execute).toBeDefined()
      const action = resolved!.execute!(emptyCtx)
      expect(action).toEqual({ type: "GOTO_BOARD", boardId: "@inbox" })
    })

    it("Ctrl+g i chord resolves the same as g i", () => {
      const kbCtx = defaultKbCtx()
      const resolved = resolveChord("Ctrl+g", "i", {}, kbCtx)
      expect(resolved).not.toBeNull()
      expect(resolved!.commandId).toBe("goto")
      expect(resolved!.targetId).toBe("@inbox")
    })

    it("Ctrl+m j chord resolves with hasKitty", () => {
      const kbCtxKitty = { ...defaultKbCtx(), hasKitty: true }
      const resolved = resolveChord("Ctrl+m", "j", {}, kbCtxKitty)
      expect(resolved).not.toBeNull()
      expect(resolved!.commandId).toBe("move")
    })

    it("Ctrl+m j chord does NOT resolve without hasKitty", () => {
      const kbCtxNoKitty = { ...defaultKbCtx(), hasKitty: false }
      const resolved = resolveChord("Ctrl+m", "j", {}, kbCtxNoKitty)
      expect(resolved).toBeNull()
    })
  })
})
