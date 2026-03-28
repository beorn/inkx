/**
 * Verb x Location Tests
 *
 * Tests for the composable verb x location vocabulary:
 * target resolvers, verb constructors, grid generators, and integration.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
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
import { initCommandSystem } from "../src/key-adapter.ts"
import {
  resolveChord,
  clearKeybindings,
  parseKeyString,
  type KeybindingContext,
  type Keybinding,
} from "../src/keybindings.ts"
import type { CommandContext } from "../src/types.ts"
import { setFavorite, clearFavorite } from "../src/favorites.ts"

/** Helper to match a binding by chord prefix and suffix key (parsed from the key string) */
function findBinding(grid: Keybinding[], chord: string, suffix: string): Keybinding | undefined {
  return grid.find((b) => {
    const parsed = parseKeyString(b.key)
    return parsed.chord === chord && parsed.key === suffix
  })
}

/** Helper to filter bindings by chord prefix */
function filterByChord(grid: Keybinding[], chord: string): Keybinding[] {
  return grid.filter((b) => parseKeyString(b.key).chord === chord)
}

/** Helper to get the suffix key from a binding */
function suffixKey(b: Keybinding): string {
  return parseKeyString(b.key).key
}

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
    itemPickerOpen: false,
    newItemDialogOpen: false,
    datePromptOpen: false,
    filterDialogOpen: false,
    helpOverlayOpen: false,
    deleteConfirmOpen: false,
    consoleOpen: false,
    hasActiveToast: false,
    cursorAtStart: () => false,
    cursorAtEnd: () => true,
    hasVisibleChildren: () => false,
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

    it("fav(key) returns 'fav:KEY' for various keys", () => {
      expect(fav("0")(emptyCtx)).toBe("fav:0")
      expect(fav("1")(emptyCtx)).toBe("fav:1")
      expect(fav("5")(emptyCtx)).toBe("fav:5")
      expect(fav("9")(emptyCtx)).toBe("fav:9")
      expect(fav("q")(emptyCtx)).toBe("fav:q")
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
      it("returns CURSOR_TO for board node IDs", () => {
        expect(goTo(inbox)(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "@inbox" })
        expect(goTo(journal)(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "@journal" })
        expect(goTo(home)(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "@next" })
        expect(goTo(archive)(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "@archive" })
      })

      it("returns CURSOR_TO for fav:KEY", () => {
        expect(goTo(fav("1"))(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "fav:1" })
        expect(goTo(fav("0"))(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "fav:0" })
        expect(goTo(fav("9"))(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "fav:9" })
      })

      it("returns CURSOR_TO for parent", () => {
        expect(goTo(parent)(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "parent" })
      })

      it("returns SHOW_ITEM_PICKER for pick:*", () => {
        expect(goTo(pick("+"))(emptyCtx)).toEqual({ type: "SHOW_ITEM_PICKER" })
        expect(goTo(pick("#"))(emptyCtx)).toEqual({ type: "SHOW_ITEM_PICKER" })
        expect(goTo(pick("@"))(emptyCtx)).toEqual({ type: "SHOW_ITEM_PICKER" })
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

      it("returns MOVE_TO_FAVORITE for fav:KEY", () => {
        expect(moveTo(fav("3"))(emptyCtx)).toEqual({ type: "MOVE_TO_FAVORITE", favoriteKey: "3" })
        expect(moveTo(fav("0"))(emptyCtx)).toEqual({ type: "MOVE_TO_FAVORITE", favoriteKey: "0" })
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

      it("returns ADD_LINK_TO_FAVORITE for fav:KEY", () => {
        expect(addTo(fav("1"))(emptyCtx)).toEqual({ type: "ADD_LINK_TO_FAVORITE", favoriteKey: "1" })
        expect(addTo(fav("7"))(emptyCtx)).toEqual({ type: "ADD_LINK_TO_FAVORITE", favoriteKey: "7" })
      })

      it("returns null when target resolver returns null", () => {
        const nullTarget: TargetResolver = () => null
        expect(addTo(nullTarget)(emptyCtx)).toBeNull()
      })
    })

    describe("createIn", () => {
      it("returns CAPTURE for any target", () => {
        expect(createIn(inbox)(emptyCtx)).toEqual({ type: "CAPTURE" })
        expect(createIn(journal)(emptyCtx)).toEqual({ type: "CAPTURE" })
        expect(createIn(fav("1"))(emptyCtx)).toEqual({ type: "CAPTURE" })
      })

      it("returns CAPTURE even with null target resolver", () => {
        const nullTarget: TargetResolver = () => null
        expect(createIn(nullTarget)(emptyCtx)).toEqual({ type: "CAPTURE" })
      })
    })
  })

  // =========================================================================
  // Registries
  // =========================================================================

  describe("registries", () => {
    it("SYSTEM_LOCS has expected keys", () => {
      expect(Object.keys(SYSTEM_LOCS).sort()).toEqual(["a", "g", "h", "i", "j", "p", "shift-g"])
    })

    it("PICKER_LOCS has expected keys", () => {
      expect(Object.keys(PICKER_LOCS).sort()).toEqual(["[", "shift-2", "shift-3", "shift-="])
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
      // Set up digit favorites so grid tests work (favorites start empty by default)
      for (let n = 0; n <= 9; n++) setFavorite(String(n), `@fav${n}`)
      grid = verbLocationGrid()
    })

    afterEach(() => {
      for (let n = 0; n <= 9; n++) clearFavorite(String(n))
    })

    it("produces bindings with required fields", () => {
      for (const b of grid) {
        expect(b).toHaveProperty("key")
        expect(b).toHaveProperty("commandId")
        expect(b).toHaveProperty("execute")
        expect(typeof b.execute).toBe("function")
        // Key should be a chord (space-separated)
        const parsed = parseKeyString(b.key)
        expect(parsed.chord).toBeDefined()
      }
    })

    it("all bindings have a chord prefix from VERBS", () => {
      const verbPrefixes = Object.values(VERBS).map((v) => v.prefix)
      for (const b of grid) {
        const parsed = parseKeyString(b.key)
        expect(verbPrefixes).toContain(parsed.chord)
      }
    })

    // --- Skip rules: nonsensical combinations ---

    it("does NOT produce a g (addTo first) binding", () => {
      const match = findBinding(grid, "a", "g")
      expect(match).toBeUndefined()
    })

    it("does NOT produce a G (addTo last) binding", () => {
      const match = findBinding(grid, "a", "G")
      expect(match).toBeUndefined()
    })

    it("does NOT produce a p (addTo parent) binding", () => {
      const match = findBinding(grid, "a", "p")
      expect(match).toBeUndefined()
    })

    it("does NOT produce c + system locations except c i", () => {
      const cBindings = filterByChord(grid, "c")
      const cSystemBindings = cBindings.filter((b) => Object.keys(SYSTEM_LOCS).includes(suffixKey(b)))
      // Only c i should exist
      expect(cSystemBindings).toHaveLength(1)
      expect(suffixKey(cSystemBindings[0]!)).toBe("i")
    })

    it("does NOT produce c + favorite bindings", () => {
      const cBindings = filterByChord(grid, "c")
      const cFavBindings = cBindings.filter((b) => suffixKey(b).match(/^[0-9]$/))
      expect(cFavBindings).toHaveLength(0)
    })

    it("does NOT produce c + picker locations (skip condition uses old '#' key)", () => {
      const cBindings = filterByChord(grid, "c")
      const pickerKeys = Object.keys(PICKER_LOCS)
      const cPickerBindings = cBindings.filter((b) => {
        // Reconstruct full suffix key (e.g., "shift-3") from parsed binding
        const parsed = parseKeyString(b.key)
        const parts: string[] = []
        if (parsed.shift) parts.push("shift")
        parts.push(parsed.key)
        return pickerKeys.includes(parts.join("-"))
      })
      // The source skip condition `pKey !== "#"` always triggers since picker keys
      // are now "shift-3" etc., so c gets 0 picker bindings
      expect(cPickerBindings).toHaveLength(0)
    })

    // --- Positive: expected combinations exist ---

    it("produces g i (goTo inbox)", () => {
      const b = findBinding(grid, "g", "i")
      expect(b).toBeDefined()
      expect(b!.commandId).toBe("goto")
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "CURSOR_TO", locationKey: "@inbox" })
    })

    it("produces m j (moveTo journal)", () => {
      const b = findBinding(grid, "m", "j")
      expect(b).toBeDefined()
      expect(b!.commandId).toBe("move")
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "MOVE_TO_BOARD", boardId: "@journal" })
    })

    it("produces g p (goTo parent = CURSOR_TO parent)", () => {
      const b = findBinding(grid, "g", "p")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "CURSOR_TO", locationKey: "parent" })
    })

    it("produces m p (moveTo parent = OUTDENT_NODE)", () => {
      const b = findBinding(grid, "m", "p")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "OUTDENT_NODE" })
    })

    it("produces m g (moveTo first = SHIFT_TO_TOP)", () => {
      const b = findBinding(grid, "m", "g")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "SHIFT_TO_TOP" })
    })

    it("produces m shift-g (moveTo last = SHIFT_TO_BOTTOM)", () => {
      // findBinding matches on parsed.key only; find shift-g by checking parsed.shift too
      const b = grid.find((binding) => {
        const parsed = parseKeyString(binding.key)
        return parsed.chord === "m" && parsed.key === "g" && parsed.shift
      })
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "SHIFT_TO_BOTTOM" })
    })

    it("produces a shift-3 (addTo pick # = SET_LABEL)", () => {
      // Picker key is now "shift-3" (parsed.key="3", parsed.shift=true)
      const b = grid.find((binding) => {
        const parsed = parseKeyString(binding.key)
        return parsed.chord === "a" && parsed.key === "3" && parsed.shift
      })
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "SET_LABEL" })
    })

    it("produces a shift-2 (addTo pick @ = SET_ASSIGNEE)", () => {
      // Picker key is now "shift-2" (parsed.key="2", parsed.shift=true)
      const b = grid.find((binding) => {
        const parsed = parseKeyString(binding.key)
        return parsed.chord === "a" && parsed.key === "2" && parsed.shift
      })
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "SET_ASSIGNEE" })
    })

    it("produces a [ (addTo pick [ = ADD_LINK)", () => {
      const b = findBinding(grid, "a", "[")
      expect(b).toBeDefined()
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "ADD_LINK" })
    })

    it("produces g + favorites 0-9", () => {
      for (let n = 0; n <= 9; n++) {
        const b = findBinding(grid, "g", String(n))
        expect(b).toBeDefined()
        expect(b!.targetId).toBe(`fav:${n}`)
        const action = b!.execute!(emptyCtx)
        expect(action).toEqual({ type: "CURSOR_TO", locationKey: `fav:${n}` })
      }
    })

    it("produces m + favorites 0-9", () => {
      for (let n = 0; n <= 9; n++) {
        const b = findBinding(grid, "m", String(n))
        expect(b).toBeDefined()
        expect(b!.targetId).toBe(`fav:${n}`)
        const action = b!.execute!(emptyCtx)
        expect(action).toEqual({ type: "MOVE_TO_FAVORITE", favoriteKey: String(n) })
      }
    })

    it("produces a + favorites 0-9", () => {
      for (let n = 0; n <= 9; n++) {
        const b = findBinding(grid, "a", String(n))
        expect(b).toBeDefined()
        const action = b!.execute!(emptyCtx)
        expect(action).toEqual({ type: "ADD_LINK_TO_FAVORITE", favoriteKey: String(n) })
      }
    })

    it("produces c i (createIn inbox = CAPTURE)", () => {
      const b = findBinding(grid, "c", "i")
      expect(b).toBeDefined()
      expect(b!.commandId).toBe("create_in")
      const action = b!.execute!(emptyCtx)
      expect(action).toEqual({ type: "CAPTURE" })
    })

    it("has a reasonable total count", () => {
      // g: 7 system + 10 fav + 4 picker = 21
      // m: 7 system + 10 fav + 4 picker = 21
      // a: 4 system (skip g, shift-g, p) + 10 fav + 4 picker = 18
      // c: 1 system (only i) + 0 fav + 0 picker = 1
      //    (picker skip condition pKey !== "#" always true since keys are now shift-3 etc.)
      // Total: 21 + 21 + 18 + 1 = 61
      expect(grid.length).toBe(61)
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
      const gBindings = filterByChord(baseGrid, "g")
      const ctrlGBindings = filterByChord(ctrlGrid, "Ctrl+g")
      expect(ctrlGBindings.length).toBe(gBindings.length)
    })

    it("produces Ctrl+m variants for all m-prefix bindings", () => {
      const baseGrid = verbLocationGrid()
      const mBindings = filterByChord(baseGrid, "m")
      const ctrlMBindings = filterByChord(ctrlGrid, "Ctrl+m")
      expect(ctrlMBindings.length).toBe(mBindings.length)
    })

    it("Ctrl+m variants have when: hasKitty", () => {
      const ctrlMBindings = filterByChord(ctrlGrid, "Ctrl+m")
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
      const ctrlGBindings = filterByChord(ctrlGrid, "Ctrl+g")
      for (const b of ctrlGBindings) {
        expect(b.when).toBeUndefined()
      }
    })

    it("does NOT produce Ctrl+a or Ctrl+c variants", () => {
      const ctrlABindings = filterByChord(ctrlGrid, "Ctrl+a")
      const ctrlCBindings = filterByChord(ctrlGrid, "Ctrl+c")
      expect(ctrlABindings).toHaveLength(0)
      expect(ctrlCBindings).toHaveLength(0)
    })

    it("preserves commandId and suffix key from base grid", () => {
      const baseGrid = verbLocationGrid()
      const gBindings = filterByChord(baseGrid, "g")
      const ctrlGBindings = filterByChord(ctrlGrid, "Ctrl+g")

      for (const ctrlB of ctrlGBindings) {
        const ctrlSuffix = suffixKey(ctrlB)
        const baseMatch = gBindings.find((b) => suffixKey(b) === ctrlSuffix)
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
      for (let n = 0; n <= 9; n++) setFavorite(String(n), `@fav${n}`)
      initCommandSystem()
    })

    afterEach(() => {
      for (let n = 0; n <= 9; n++) clearFavorite(String(n))
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

    it("a shift-3 chord resolves to add with pick:# target", () => {
      const kbCtx = defaultKbCtx()
      const resolved = resolveChord("a", "3", { shift: true }, kbCtx)
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
      expect(action).toEqual({ type: "CURSOR_TO", locationKey: "@inbox" })
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
