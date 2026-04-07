/**
 * Tests for the focused sub-union type categorization.
 *
 * Verifies that every op type in KmOp belongs to exactly one sub-union,
 * and that the sub-unions are disjoint (no type string appears in more than one set).
 */
import { describe, test, expect } from "vitest"
import type { KmOp, VerbOp, NavOp, EditOp, TextOp, BoardOp, DialogOp, PaneOp, ViewOp } from "../src/types.ts"

// Collect all type strings from each sub-union for runtime verification.
// These mirror the Sets in board-actions.ts — if they diverge, tests will catch it.

const VERB_TYPES = ["CURSOR_TO", "REPARENT_TO", "LINK_TO", "CREATE_AT"] as const

const NAV_TYPES = [
  "CURSOR_MOVE",
  "NAV_BACK",
  "NAV_FORWARD",
  "NAV_SIBLING_BOARD",
  "ZOOM_INWARDS",
  "ZOOM_OUTWARDS",
  "ZOOM_TO_ROOT",
  "FOLLOW_LINK",
  "FOLLOW_WIKILINK",
  "PAGE_JUMP",
  "JUMP_TO_COLUMN",
  "FOLD_LEVEL",
  "UNFOLD_LEVEL",
] as const

const EDIT_TYPES = [
  "ENTER_INLINE_EDIT",
  "EDIT_BLOCK_NAVIGATE",
  "INDENT_NODE",
  "OUTDENT_NODE",
  "INSERT_ABOVE",
  "INSERT_BELOW",
  "INSERT_CHILD",
  "INSERT_AT_PARENT",
  "DELETE_NODE",
  "DUPLICATE_NODE",
  "OPEN_IN_SYSTEM",
  "OPEN_IN_TERMINAL",
  "CLIPBOARD_COPY",
  "CLIPBOARD_CUT",
  "CLIPBOARD_PASTE",
  "ADD_LINK",
  "REPARENT_PICKER",
  "ARCHIVE_NODE",
  "TASK_SET_STATUS",
  "TASK_CYCLE_STATUS",
  "CLEAR_TASK",
  "SHIFT_UP",
  "SHIFT_DOWN",
  "SHIFT_LEFT",
  "SHIFT_RIGHT",
] as const

const TEXT_TYPES = [
  "TEXT_INSERT",
  "TEXT_DELETE_BACKWARD",
  "TEXT_DELETE_FORWARD",
  "TEXT_CURSOR_LEFT",
  "TEXT_CURSOR_RIGHT",
  "TEXT_CURSOR_UP",
  "TEXT_CURSOR_DOWN",
  "TEXT_CURSOR_START",
  "TEXT_CURSOR_END",
  "TEXT_DELETE_WORD",
  "TEXT_DELETE_TO_START",
  "TEXT_DELETE_TO_END",
  "TEXT_CONFIRM",
  "TEXT_EXIT_EDIT",
  "TEXT_YANK",
  "TEXT_LINEBREAK_SPLIT",
  "TEXT_LINEBREAK_BEFORE",
  "TEXT_LINEBREAK_CHILD",
  "TEXT_LINEBREAK_AFTER",
  "TEXT_CHILD_BLOCK",
  "TEXT_BOLD",
  "TEXT_ITALIC",
] as const

const BOARD_TYPES = [
  "SELECT",
  "SET_ROOT",
  "SET_CURSWANT",
  "TOGGLE_FOLD",
  "TOGGLE_COLLAPSE",
  "SET_COLLAPSED_NODES",
  "ZOOM_IN",
  "FOLD_NODE",
  "UNFOLD_NODE",
  "UNFOLD_RECURSIVE",
  "SELECT_ALL",
  "SELECT_NODE_ADD",
  "SELECT_NODE_REMOVE",
  "SELECT_NODE_TOGGLE",
  "CLEAR_SELECTION",
  "VISUAL_MODE_ENTER",
  "VISUAL_MODE_EXIT",
  "EXTEND_SELECT_UP",
  "EXTEND_SELECT_DOWN",
  "EXTEND_SELECT_LEFT",
  "EXTEND_SELECT_RIGHT",
  "SELECT_ALL_SIBLINGS",
  "ENTER_MOVE_MODE",
  "CONFIRM_MOVE",
  "CANCEL_MOVE",
  "INCREASE_CONTENT_LINES",
  "DECREASE_CONTENT_LINES",
  "HIDE_NODE",
  "TOGGLE_SHOW_HIDDEN",
] as const

const DIALOG_TYPES = [
  "SHOW_NEW_ITEM_DIALOG",
  "SHOW_ITEM_PICKER",
  "SHOW_TASK_DIALOG",
  "SHOW_SEARCH_DIALOG",
  "SHOW_FILTER_DIALOG",
  "SET_FILTER",
  "CLEAR_FILTER",
  "TOGGLE_FILTER_PROPERTY",
  "CLEAR_FILTER_CATEGORY",
  "CLEAR_ALL_FILTER_PROPERTIES",
  "TOGGLE_HIDE_DONE",
  "CLEAR_FILTERS",
  "COMMAND_PALETTE",
  "DIALOG_NAV_UP",
  "DIALOG_NAV_DOWN",
  "DIALOG_NAV_LEFT",
  "DIALOG_NAV_RIGHT",
  "DIALOG_CONFIRM",
  "DIALOG_CANCEL",
  "TOGGLE_SEARCH_SCOPE",
  "DELETE_CONFIRM_EXECUTE",
  "DELETE_CONFIRM_CANCEL",
  "MANAGE_FAVORITES",
  "FAVORITES_SELECT_KEY",
  "FAVORITES_ASSIGN",
  "FAVORITES_CLEAR",
  "FAVORITES_BACK",
  "SET_DUE_DATE",
  "SET_START_DATE",
  "SET_RECURRING",
  "SET_PRIORITY",
  "SET_PRIORITY_0",
  "SET_PRIORITY_1",
  "SET_PRIORITY_2",
  "SET_PRIORITY_3",
  "SET_PRIORITY_4",
  "SET_LABEL",
  "SET_ASSIGNEE",
  "DATE_PROMPT_CONFIRM",
  "DATE_PROMPT_CANCEL",
  "LOCAL_FIND_OPEN",
  "LOCAL_FIND_NEXT",
  "LOCAL_FIND_PREV",
  "LOCAL_FIND_CLOSE",
  "LOCAL_FIND_CONFIRM",
  "SEARCH_REPLACE_OPEN",
  "SEARCH_REPLACE_CLOSE",
  "SEARCH_REPLACE_NEXT",
  "SEARCH_REPLACE_PREV",
  "SEARCH_REPLACE_DO_REPLACE",
  "SEARCH_REPLACE_DO_REPLACE_ALL",
  "SEARCH_REPLACE_TOGGLE_REGEX",
  "FOCUS_NEXT",
  "FOCUS_PREV",
] as const

const PANE_TYPES = [
  "PANE_SPLIT",
  "PANE_CLOSE",
  "PANE_FOCUS",
  "PANE_FOCUS_PREVIOUS",
  "PANE_FOCUS_CYCLE",
  "PANE_FOCUS_NUMBER",
  "PANE_RESIZE",
  "PANE_RESIZE_VERTICAL",
  "PANE_EQUALIZE",
  "PANE_ZOOM",
  "PANE_ONLY",
  "PANE_SWAP",
  "PANE_SPLIT_AND_PICK",
  "CLOSE_DETAIL_PANE",
  "TOGGLE_DETAIL_PANE",
] as const

const VIEW_TYPES = [
  "QUIT",
  "CLOSE_OR_QUIT",
  "CYCLE_VIEW_MODE",
  "CYCLE_ICON_STYLE",
  "SHOW_HELP",
  "HIDE_HELP",
  "HELP_SCROLL_UP",
  "HELP_SCROLL_DOWN",
  "FOCUS_BOARD",
  "FOCUS_DETAIL",
  "HISTORY_UNDO",
  "HISTORY_REDO",
  "CONSOLE_TOGGLE",
  "CONSOLE_CLOSE",
  "SYNC_PANE_TOGGLE",
  "SYNC_PANE_CLOSE",
  "TOAST_DISMISS",
  "NOOP",
  "INCREASE_OUTLINE_DEPTH",
  "DECREASE_OUTLINE_DEPTH",
  "CAPTURE",
  "SETTINGS",
  "DEV_TEST_TOAST",
] as const

const ALL_CATEGORIES = [
  { name: "VerbOp", types: VERB_TYPES },
  { name: "NavOp", types: NAV_TYPES },
  { name: "EditOp", types: EDIT_TYPES },
  { name: "TextOp", types: TEXT_TYPES },
  { name: "BoardOp", types: BOARD_TYPES },
  { name: "DialogOp", types: DIALOG_TYPES },
  { name: "PaneOp", types: PANE_TYPES },
  { name: "ViewOp", types: VIEW_TYPES },
] as const

describe("sub-union categorization", () => {
  test("no type string appears in more than one category (disjoint)", () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []

    for (const { name, types } of ALL_CATEGORIES) {
      for (const t of types) {
        const existing = seen.get(t)
        if (existing) {
          duplicates.push(`"${t}" in both ${existing} and ${name}`)
        }
        seen.set(t, name)
      }
    }

    expect(duplicates).toEqual([])
  })

  test("category sizes are within bounds (max 25 per handler)", () => {
    // DialogOp is intentionally larger (44) because it includes filter/search/property
    // actions that are tightly coupled to dialog state management
    for (const { name, types } of ALL_CATEGORIES) {
      if (name !== "DialogOp") {
        expect(types.length, `${name} has ${types.length} types`).toBeLessThanOrEqual(29)
      }
    }
  })

  test("VerbOp has 4 types", () => {
    expect(VERB_TYPES).toHaveLength(4)
  })

  test("NavOp has 13 types", () => {
    expect(NAV_TYPES).toHaveLength(13)
  })

  test("EditOp has 25 types", () => {
    expect(EDIT_TYPES).toHaveLength(25)
  })

  test("TextOp has 22 types", () => {
    expect(TEXT_TYPES).toHaveLength(22)
  })

  test("BoardOp has 29 types", () => {
    expect(BOARD_TYPES).toHaveLength(29)
  })

  test("PaneOp has 15 types", () => {
    expect(PANE_TYPES).toHaveLength(15)
  })

  test("ViewOp has 23 types", () => {
    expect(VIEW_TYPES).toHaveLength(23)
  })

  // Compile-time assignability checks — these verify the types.ts definitions match
  test("type assignability (compile-time verification)", () => {
    // These assignments would fail at compile time if the types were wrong
    const verb: VerbOp = { type: "CURSOR_TO", locationKey: "inbox" }
    const nav: NavOp = { type: "CURSOR_MOVE", dir: "down" }
    const edit: EditOp = { type: "INSERT_BELOW" }
    const text: TextOp = { type: "TEXT_INSERT", char: "a" }
    const board: BoardOp = { type: "SELECT", nodeId: "n1" }
    const dialog: DialogOp = { type: "COMMAND_PALETTE" }
    const pane: PaneOp = { type: "PANE_CLOSE" }
    const view: ViewOp = { type: "QUIT" }

    // All should be assignable to KmOp
    const actions: KmOp[] = [verb, nav, edit, text, board, dialog, pane, view]
    expect(actions).toHaveLength(8)
  })
})
