/**
 * @failure  The Kanban example treats the unshifted `.` base key as the
 *   documented `>` move-card binding because shifted punctuation is matched
 *   against normalized `input` instead of `key.text`.
 * @level    l2
 * @consumer @si/21467-silvery-shifted-punct-keybinds
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { KanbanBoard } from "../../examples/apps/kanban.tsx"

describe("Kanban shifted-punctuation bindings", () => {
  test("only the documented > character moves a card to the right", async () => {
    const render = createRenderer({ cols: 120, rows: 40 })
    const app = render(<KanbanBoard />)

    expect(app.text).toContain("To Do (8)")
    expect(app.text).toContain("In Progress (3)")

    await app.press(".")
    expect(app.text).toContain("To Do (8)")
    expect(app.text).toContain("In Progress (3)")

    await app.press(">")
    expect(app.text).toContain("To Do (7)")
    expect(app.text).toContain("In Progress (4)")
  })
})
