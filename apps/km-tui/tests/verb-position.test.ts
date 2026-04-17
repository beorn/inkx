/**
 * Verb × Position Orthogonal Tests
 *
 * Verifies that all 4 verbs produce the correct VerbAction type for each
 * location key, and that the resolution table produces correct Positions.
 *
 * This is the key test: verbs and locations are independent dimensions.
 * Any verb can be combined with any location.
 */

import { describe, it, test, expect, beforeEach, afterEach } from "vitest"
import { goTo, moveTo, addTo, createIn, getSystemLocs, PICKER_LOCS } from "@km/commands"
import { setFavorite, clearFavorite } from "@km/commands"
import {
  resolveLocationKey,
  isPickTarget,
  isPosition,
  type ResolverRepo,
  type CursorContext,
} from "../src/board/position-resolver.ts"
import type { CommandContext } from "@km/commands"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

const emptyCtx = {} as CommandContext

// --- Test helpers ---

function mockRepo(
  nodes: Array<{ id: string; parent_id: string | null; parent_idx: number; name?: string }>,
): ResolverRepo {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return {
    getNode(id: string) {
      return nodeMap.get(id) ?? null
    },
    getChildren(parentId: string | null) {
      return nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.parent_idx - b.parent_idx)
    },
    resolveNode(query: string) {
      const match = nodes.find((n) => n.name === query || n.id === query)
      return match ? { id: match.id } : null
    },
  }
}

function cursor(nodeId: string): CursorContext {
  return {
    sel: { node: { cursor: () => nodeId } } as unknown as import("@silvery/selection").SelectionStore,
  }
}

const TREE = [
  { id: "root", parent_id: null, parent_idx: 0 },
  { id: "board-A", parent_id: "root", parent_idx: 0 },
  { id: "card-1", parent_id: "board-A", parent_idx: 0 },
  { id: "card-2", parent_id: "board-A", parent_idx: 1 },
  { id: "card-3", parent_id: "board-A", parent_idx: 2 },
  { id: "board-B", parent_id: "root", parent_idx: 1 },
  { id: "@next-id", parent_id: "root", parent_idx: 10, name: "@next" },
  { id: "@inbox-id", parent_id: "root", parent_idx: 11, name: "@inbox" },
  { id: "@journal-id", parent_id: "root", parent_idx: 12, name: "@journal" },
  { id: "@archive-id", parent_id: "root", parent_idx: 13, name: "@archive" },
]

describe("verb × position orthogonality", () => {
  let repo: ResolverRepo

  beforeEach(() => {
    repo = mockRepo(TREE)
    for (let n = 0; n <= 9; n++) setFavorite(String(n), `board-${n === 0 ? "A" : "B"}`)
  })

  afterEach(() => {
    for (let n = 0; n <= 9; n++) clearFavorite(String(n))
  })

  // =========================================================================
  // Verb action types — each verb produces the correct action type
  // =========================================================================

  describe("verb action types", () => {
    const verbMatrix = [
      { verb: goTo, actionType: "CURSOR_TO", name: "goTo" },
      { verb: moveTo, actionType: "REPARENT_TO", name: "moveTo" },
      { verb: addTo, actionType: "LINK_TO", name: "addTo" },
      { verb: createIn, actionType: "CREATE_AT", name: "createIn" },
    ] as const

    const locationKeys = [
      { key: "@next", description: "system board" },
      { key: "@inbox", description: "inbox" },
      { key: "parent", description: "parent" },
      { key: "first", description: "first sibling" },
      { key: "last", description: "last sibling" },
      { key: "fav:1", description: "favorite" },
    ]

    for (const { verb, actionType, name } of verbMatrix) {
      for (const { key, description } of locationKeys) {
        it(`${name}("${key}") → { type: "${actionType}", locationKey: "${key}" }`, () => {
          const action = verb(key)(emptyCtx)
          expect(action).toEqual({ type: actionType, locationKey: key })
        })
      }
    }

    // All four verbs now pass pick: through as locationKey — the op handler
    // opens the right picker based on the sigil and records the pending verb.
    it("goTo/moveTo/addTo/createIn with pick: pass through as locationKey", () => {
      expect(goTo("pick:#")(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "pick:#" })
      expect(goTo("pick:[")(emptyCtx)).toEqual({ type: "CURSOR_TO", locationKey: "pick:[" })
      expect(moveTo("pick:+")(emptyCtx)).toEqual({ type: "REPARENT_TO", locationKey: "pick:+" })
      expect(moveTo("pick:[")(emptyCtx)).toEqual({ type: "REPARENT_TO", locationKey: "pick:[" })
      expect(addTo("pick:#")(emptyCtx)).toEqual({ type: "LINK_TO", locationKey: "pick:#" })
      expect(addTo("pick:[")(emptyCtx)).toEqual({ type: "LINK_TO", locationKey: "pick:[" })
      expect(createIn("pick:#")(emptyCtx)).toEqual({ type: "CREATE_AT", locationKey: "pick:#" })
      expect(createIn("pick:[")(emptyCtx)).toEqual({ type: "CREATE_AT", locationKey: "pick:[" })
    })
  })

  // =========================================================================
  // Resolution table — each system location resolves correctly
  // =========================================================================

  describe("resolution × system locations", () => {
    it("h (home/@next) → Position at @next board", () => {
      const key = getSystemLocs().h!.key
      expect(key).toBe("@next")
      const pos = resolveLocationKey(key, cursor("card-1"), repo)
      expect(pos).toEqual({ parentId: "@next-id", childIdx: -1 })
    })

    it("i (inbox) → Position at @inbox board", () => {
      const key = getSystemLocs().i!.key
      expect(key).toBe("@inbox")
      const pos = resolveLocationKey(key, cursor("card-1"), repo)
      expect(pos).toEqual({ parentId: "@inbox-id", childIdx: -1 })
    })

    it("j (journal) → date template resolves to today's journal file", () => {
      const key = getSystemLocs().j!.key
      expect(key).toContain("{YYYY}")
      // The expanded path (e.g. "journals/2026/2026-03-30.md") won't match the mock repo,
      // so resolveLocationKey returns null. This is correct — the TUI layer handles
      // auto-creating missing journal files. Template expansion itself is tested in
      // config-persist.test.ts.
      const pos = resolveLocationKey(key, cursor("card-1"), repo)
      expect(pos).toBeNull()
    })

    it("a (archive) → Position at @archive board", () => {
      const key = getSystemLocs().a!.key
      const pos = resolveLocationKey(key, cursor("card-1"), repo)
      expect(pos).toEqual({ parentId: "@archive-id", childIdx: -1 })
    })

    it("p (parent) → parent's slot in grandparent", () => {
      const key = getSystemLocs().p!.key
      expect(key).toBe("{parent}")
      const pos = resolveLocationKey(key, cursor("card-2"), repo)
      expect(pos).toEqual({ parentId: "root", childIdx: 0 })
    })

    it("g (first) → first sibling slot", () => {
      const key = getSystemLocs().g!.key
      expect(key).toBe("{first}")
      const pos = resolveLocationKey(key, cursor("card-2"), repo)
      expect(pos).toEqual({ parentId: "board-A", childIdx: 0 })
    })

    it("G (last) → last sibling slot", () => {
      const key = getSystemLocs()["shift-g"]!.key
      expect(key).toBe("{last}")
      const pos = resolveLocationKey(key, cursor("card-1"), repo)
      expect(pos).toEqual({ parentId: "board-A", childIdx: -1 })
    })
  })

  // =========================================================================
  // Resolution table — picker locations
  // =========================================================================

  describe("resolution × picker locations", () => {
    const pickerExpected = [
      { gridKey: "shift-3", pick: "#", label: "tag" },
      { gridKey: "shift-2", pick: "@", label: "assignee" },
      { gridKey: "shift-=", pick: "+", label: "project" },
      { gridKey: "[", pick: "[", label: "item" },
    ]

    for (const { gridKey, pick, label } of pickerExpected) {
      it(`${gridKey} (${label}) → { pick: "${pick}" }`, () => {
        const key = PICKER_LOCS[gridKey]!.key
        expect(key).toBe(`pick:${pick}`)
        const result = resolveLocationKey(key, cursor("card-1"), repo)
        expect(isPickTarget(result)).toBe(true)
        expect(result).toEqual({ pick })
      })
    }
  })

  // =========================================================================
  // Verb × resolution combined — end-to-end
  // =========================================================================

  describe("end-to-end: verb action → resolution", () => {
    it("goTo('{first}') → CURSOR_TO → resolves to (board-A, 0)", () => {
      const action = goTo("{first}")(emptyCtx) as { type: string; locationKey: string }
      expect(action.type).toBe("CURSOR_TO")
      const pos = resolveLocationKey(action.locationKey, cursor("card-2"), repo)
      expect(isPosition(pos)).toBe(true)
      expect(pos).toEqual({ parentId: "board-A", childIdx: 0 })
    })

    it("moveTo('{last}') → REPARENT_TO → resolves to (board-A, -1)", () => {
      const action = moveTo("{last}")(emptyCtx) as { type: string; locationKey: string }
      expect(action.type).toBe("REPARENT_TO")
      const pos = resolveLocationKey(action.locationKey, cursor("card-1"), repo)
      expect(pos).toEqual({ parentId: "board-A", childIdx: -1 })
    })

    it("addTo('pick:#') → LINK_TO → resolves to { pick: '#' }", () => {
      const action = addTo("pick:#")(emptyCtx) as { type: string; locationKey: string }
      expect(action.type).toBe("LINK_TO")
      const result = resolveLocationKey(action.locationKey, cursor("card-1"), repo)
      expect(isPickTarget(result)).toBe(true)
      expect(result).toEqual({ pick: "#" })
    })

    it("moveTo('{parent}') → REPARENT_TO → resolves to grandparent slot", () => {
      const action = moveTo("{parent}")(emptyCtx) as { type: string; locationKey: string }
      expect(action.type).toBe("REPARENT_TO")
      const pos = resolveLocationKey(action.locationKey, cursor("card-2"), repo)
      expect(pos).toEqual({ parentId: "root", childIdx: 0 })
    })

    it("goTo('@next') → CURSOR_TO { @next } → resolves to @next board", () => {
      const action = goTo("@next")(emptyCtx) as { type: string; locationKey: string }
      expect(action.type).toBe("CURSOR_TO")
      const pos = resolveLocationKey(action.locationKey, cursor("card-1"), repo)
      expect(pos).toEqual({ parentId: "@next-id", childIdx: -1 })
    })

    it("createIn('fav:0') → CREATE_AT { fav:0 } → resolves to favorite board", () => {
      const action = createIn("fav:0")(emptyCtx) as { type: string; locationKey: string }
      expect(action.type).toBe("CREATE_AT")
      const pos = resolveLocationKey(action.locationKey, cursor("card-1"), repo)
      expect(pos).toEqual({ parentId: "board-A", childIdx: -1 })
    })
  })
})

// =============================================================================
// Journey: verb [ chords open the item picker with the right pendingVerb
// =============================================================================
//
// These tests drive the full board app (createTestApp) to verify that the
// chord prefix layer + verbLocationGrid + openPickerForVerb actually wire up
// `g [`, `m [`, `a [`, `c [`, and bare `[` to the item picker — not the
// project picker — and record the right pendingVerb so handleItemPickerSelect
// dispatches the right follow-up action.

describe("verb-[ picker journeys", () => {
  // km-tui.itempicker-unify: verb × pick chords now land on the unified
  // omnibox with the verb's command ID as `defaultCommand`. The legacy
  // `activePicker` + `pendingVerb` fields are gone.

  test("g [ opens the unified omnibox in goto mode", () => {
    using app = createTestApp(item("board", item("Todo", item("task1")), item("Done", item("task2"))))
    app.press("g").press("[")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })
  })

  test("m [ opens the unified omnibox in move mode", () => {
    using app = createTestApp(item("board", item("Todo", item("task1")), item("Done", item("task2"))))
    app.press("m").press("[")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("move")
    })
  })

  test("a [ opens the unified omnibox in add mode", () => {
    using app = createTestApp(item("board", item("Todo", item("task1")), item("Done", item("task2"))))
    app.press("a").press("[")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("add")
    })
  })

  test("c [ opens the unified omnibox in create mode", () => {
    using app = createTestApp(item("board", item("Todo", item("task1")), item("Done", item("task2"))))
    app.press("c").press("[")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("create_in")
    })
  })

  test("bare [ opens the unified omnibox in goto mode (navigate)", () => {
    // Bare sigils flipped from 'add link' to 'go to' — the forgiving
    // default. Explicit chords (a [, m [, c [) still preserve their verbs.
    using app = createTestApp(item("board", item("Todo", item("task1"))))
    app.press("[")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })
  })
})

// =============================================================================
// Picker dialog title — the RENDERED title reflects the pending verb.
// =============================================================================
//
// Regression guard for the user-reported bug where bare `+` opened the
// picker with the title "Move to project" — the store dispatched goto
// correctly (tested above via pendingVerb) but WorkspaceChrome.pickerTitle
// used hardcoded type-based titles. Fixed in a47ea59e6 by making
// pickerTitle(type, verb) build the title from the verb prefix. The tests
// below assert on `app.text` (the rendered screen) so they catch any
// regression in the UI layer, not just the store state.

describe("verb × pick chord → unified omnibox (buffer + defaultCommand)", () => {
  // km-tui.itempicker-unify — after the legacy ItemPicker was deleted the
  // rendered title moved into silvery's omnibox chrome. Test at the state
  // layer: `initialBuffer` carries the sigil, `defaultCommand` carries the
  // verb, and the executor resolves the final action from the two.

  test("bare + → omnibox with '+' buffer and goto command", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    app.press("shift+=")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.buffer).toBe("+")
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })
  })

  test("bare @ → omnibox with '@' buffer and goto command", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    app.press("shift+2")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.buffer).toBe("@")
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })
  })

  test("bare # → omnibox with '#' buffer and goto command", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    app.press("shift+3")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.buffer).toBe("#")
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })
  })

  test("bare [ → omnibox (no sigil) with goto command", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    app.press("[")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })
  })

  test("m + chord → omnibox with move command (explicit verb preserved)", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    app.press("m").press("shift+=")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.defaultCommand).toBe("move")
    })
  })

  test("a # chord → omnibox with add command", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    app.press("a").press("shift+3")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.defaultCommand).toBe("add")
    })
  })

  test("c [ chord → omnibox with create_in command", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    app.press("c").press("[")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.defaultCommand).toBe("create_in")
    })
  })
})

// =============================================================================
// Picker verb-goto Enter dispatch — regression for km-tui.omnibox-picker-verb-goto
// =============================================================================
//
// Before commit 42435f62f, the type-specific picker handlers
// (handleAssigneeSelect, handleTagSelect, handlePickerSelect) hardcoded
// their default verb (assign/add/move) and ignored pendingVerb entirely.
// Opening the context picker via `@` with pendingVerb='goto' then pressing
// Enter silently ran the assign path — set cursor's assigned_to to the
// picked assignee name — instead of navigating to the node.
//
// The user-visible symptom was "Enter does nothing" because the mutation
// happened silently on the cursor card's metadata with no feedback toast.
//
// These tests pin the verb-aware dispatch so it can't regress.

describe("bare-sigil Enter dispatch — goto never mutates the subject", () => {
  // km-tui.itempicker-unify: Enter on a bare-sigil omnibox (@ # +) must
  // navigate (goto), never set assigned_to / append a tag / reparent on
  // the cursor card. Regression guard for the legacy ItemPicker verb-goto
  // bug that landed in Phase 5d.

  test("bare @ + Enter does NOT set assigned_to on cursor card", () => {
    using app = createTestApp(
      item("board", item("col1", item("anchor card")), item("col2", item("note with @alice mention"))),
      { rows: 40 },
    )
    expect(app).toHaveCursorOn("anchor card")

    // Open the assignee context via bare `@` (goto verb).
    app.press("shift+2")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })

    app.press("Enter")

    // Cursor card's assigned_to must stay empty — Enter is navigate.
    const anchorNode = app.repo.getNode("anchor card")
    expect(anchorNode?.assigned_to).toBeFalsy()
  })

  test("bare # + Enter does NOT append tag to cursor content", () => {
    using app = createTestApp(
      item("board", item("col1", item("anchor")), item("col2", item("note with #urgent tag"))),
      { rows: 40 },
    )
    expect(app).toHaveCursorOn("anchor")

    // Open tag picker via bare `#`.
    app.press("shift+3")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })

    app.press("Enter")

    const anchorNode = app.repo.getNode("anchor")
    const content = anchorNode?.content ?? ""
    expect(content).not.toContain("#urgent")
  })

  test("bare + + Enter does NOT reparent the cursor", () => {
    using app = createTestApp(item("board", item("col1", item("anchor")), item("col2", item("+project-alpha"))), {
      rows: 40,
    })
    expect(app).toHaveCursorOn("anchor")
    const originalParent = app.repo.getNode("anchor")?.parent_id

    // Open project picker via bare `+`.
    app.press("shift+=")
    app.withStore((s) => {
      expect(s.ui.omnibox?.state.defaultCommand).toBe("goto")
    })

    app.press("Enter")

    const afterParent = app.repo.getNode("anchor")?.parent_id
    expect(afterParent).toBe(originalParent)
  })
})
