/**
 * Regression tests for display bugs:
 * - km-tui.raw-section-ids: Empty mdsection nodes show raw GID fallback "(01KHW5W9)"
 * - km-tui.trailing-hash: Trailing "#" from "#@mention" Asana tag syntax
 * - km-tui.query-dsl-leaked: Internal query DSL "rules" visible in detail pane
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("km-tui.raw-section-ids — untitled section shows label not raw ID", () => {
  test("empty mdsection shows '(untitled section)' instead of raw GID", () => {
    const { board } = testEnv(
      () => {
        const nodes = item(
          "board",
          item("col1", item("task-1"), item("task-2")),
        )
        // Mutate task-2 to be an empty mdsection with a long GID-like ID
        const emptySection = nodes.find((n) => n.id === "task-2")!
        emptySection.id = "01KHW5W9JJHE7ZS2DTDBN0X0YQ"
        emptySection.type = "oi"
        emptySection.fstype = "mdsection"
        emptySection.content = ""
        emptySection.title = ""
        emptySection.name = ""
        emptySection.data = {}
        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = board.screen.text
    // The raw GID "(01KHW5W9)" should NOT appear
    expect(text).not.toContain("(01KHW5W9)")
    // Should show the human-readable label instead
    expect(text).toContain("(untitled section)")
  })
})

describe("km-tui.trailing-hash — strip orphan # from Asana tag syntax", () => {
  test("card title strips trailing # from #@mention pattern", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("Thermostat schedule #@home")),
        ),
      { columns: 80, rows: 24 },
    )

    const text = board.screen.text
    // Should show "Thermostat schedule" without trailing "#"
    expect(text).toContain("Thermostat schedule")
    expect(text).not.toMatch(/Thermostat schedule\s+#/)
  })

  test("card title strips multiple #@mention patterns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("BVI admin #@work #@home")),
        ),
      { columns: 80, rows: 24 },
    )

    const text = board.screen.text
    expect(text).toContain("BVI admin")
    expect(text).not.toMatch(/BVI admin\s+#/)
  })
})

describe("km-tui.query-dsl-leaked — hide rules from detail pane", () => {
  test("section card does not show km.add:: query DSL", () => {
    const { board } = testEnv(
      () => {
        const nodes = item(
          "board",
          item.section("Inbox", item("task-a"), item("task-b")),
        )
        // Simulate a section with query DSL in content
        const inboxNode = nodes.find((n) => n.id === "Inbox")!
        inboxNode.content = "Inbox km.add:: ./inbox/** km.default:: true"
        inboxNode.data = {
          ...inboxNode.data,
          rules: { default: true, add: ["./inbox/**"] },
        }
        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = board.screen.text
    // "km.add::" query DSL should not be visible on the card
    expect(text).not.toContain("km.add::")
    expect(text).not.toContain("km.default::")
  })
})
