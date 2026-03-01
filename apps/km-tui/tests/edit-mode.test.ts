/**
 * Edit mode — getEditMode() unit tests
 *
 * Tests the mode derivation: node (default) / text (inline editing) / dialog (overlays).
 */

import { describe, test, expect } from "vitest"
import { getEditMode, createInitialUIState } from "../src/ui-reducer.ts"

describe("getEditMode", () => {
  const base = createInitialUIState("cards", [], { columns: 80, rows: 24 })

  test("returns 'node' for default state", () => {
    expect(getEditMode(base)).toBe("node")
  })

  test("returns 'text' when inlineEditBlock is set", () => {
    expect(getEditMode({ ...base, inlineEditBlock: { nodeId: "n1", blockIndex: 0 } })).toBe("text")
  })

  test("returns 'dialog' when search dialog is open", () => {
    expect(getEditMode({ ...base, showSearchDialog: true })).toBe("dialog")
  })

  test("returns 'dialog' when new item dialog is open", () => {
    expect(getEditMode({ ...base, showNewItemDialog: true })).toBe("dialog")
  })

  test("returns 'dialog' when item picker is open", () => {
    expect(getEditMode({ ...base, activePicker: { type: "project" } })).toBe("dialog")
  })

  test("returns 'dialog' when date prompt is active", () => {
    expect(getEditMode({ ...base, datePrompt: { field: "due_at", nodeIds: ["n1"], currentValue: "" } })).toBe("dialog")
  })

  test("returns 'dialog' when filter dialog is open", () => {
    expect(getEditMode({ ...base, showFilterDialog: true })).toBe("dialog")
  })

  test("returns 'dialog' when delete confirm is active", () => {
    expect(
      getEditMode({ ...base, deleteConfirm: { nodeIds: ["n1"], title: "t", childCount: 0, backlinkCount: 0 } }),
    ).toBe("dialog")
  })

  test("text mode takes precedence over dialog", () => {
    // If both inline edit and dialog are somehow active, text mode wins
    expect(getEditMode({ ...base, inlineEditBlock: { nodeId: "n1", blockIndex: 0 }, showSearchDialog: true })).toBe(
      "text",
    )
  })
})
