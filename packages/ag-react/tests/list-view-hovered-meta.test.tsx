/**
 * ListView surfaces `meta.isHovered` so a consumer can paint a hover affordance
 * independently of the keyboard cursor. Paired with an `onItemHover` no-op, the
 * pointer marks a row as hovered WITHOUT moving the selection — the yrd queue
 * watch "hover paints, click selects" contract (item P).
 *
 * Realistic-scale fixture (60 items) per the silvery new-prop test rule; run
 * through the render pipeline at SILVERY_STRICT=2 in CI.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { ListView } from "../src/ui/components/ListView"
import { Text } from "../src/components/Text"

const ITEMS = Array.from({ length: 60 }, (_, i) => `item-${i}`)

describe("ListView meta.isHovered", () => {
  test("marks the pointed row and follows the pointer, exactly one at a time", async () => {
    const render = createRenderer({ cols: 40, rows: 20 })
    const app = render(
      <ListView
        items={ITEMS}
        height={14}
        nav
        onItemHover={() => {}}
        renderItem={(item, _i, meta) => (
          <Text>
            {meta.isHovered ? "» " : "  "}
            {item}
          </Text>
        )}
      />,
    )
    // Nothing is hovered until the pointer enters a row.
    expect(app.text).not.toContain("»")

    await app.hover(0, 3)
    const marked = app.lines.filter((line) => line.includes("»"))
    expect(marked, app.text).toHaveLength(1)
    expect(app.lines[3]).toContain("»")
    expect(app.lines[3]).toContain("item-3")

    // Moving the pointer down moves the hover — still exactly one row.
    await app.hover(0, 6)
    const moved = app.lines.filter((line) => line.includes("»"))
    expect(moved).toHaveLength(1)
    expect(app.lines[6]).toContain("item-6")
    expect(app.lines[3]).not.toContain("»")
  })

  test("isHovered is independent of isCursor: hover paints but does not select", async () => {
    const onCursor = vi.fn()
    const onSelect = vi.fn()
    const render = createRenderer({ cols: 40, rows: 20 })
    const app = render(
      <ListView
        items={ITEMS}
        height={14}
        nav
        onCursor={onCursor}
        onSelect={onSelect}
        onItemHover={() => {}}
        renderItem={(item, _i, meta) => (
          <Text>
            {meta.isCursor ? "C" : "-"}
            {meta.isHovered ? "H" : "-"} {item}
          </Text>
        )}
      />,
    )
    await app.hover(0, 5)
    // Hover marked the row but did NOT move the cursor or fire selection.
    expect(onCursor).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    // The default cursor stays on the first row; the hover is on row 5.
    expect(app.lines[0]).toContain("C")
    expect(app.lines[5]).toContain("H")
    expect(app.lines[5]).not.toContain("C")
    expect(app.lines[0]).not.toContain("H")
  })
})
