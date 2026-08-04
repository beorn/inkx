import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { ShortcutHelpDialog } from "../src/ui/components/ShortcutHelpDialog"

describe("ShortcutHelpDialog", () => {
  test("renders titled sections of keyboard shortcuts and actions", () => {
    const render = createRenderer({ cols: 80, rows: 20 })
    const app = render(
      <ShortcutHelpDialog
        title="Reader keys"
        footer="Esc closes"
        sections={[
          {
            title: "Navigate",
            rows: [
              { keys: ["[", "Ctrl+-"], action: "go back" },
              { keys: ["]"], action: "go forward" },
            ],
          },
          {
            title: "Find",
            rows: [{ keys: ["/"], action: "search this document" }],
          },
        ]}
      />,
    )

    expect(app.text).toContain("Reader keys")
    expect(app.text).toContain("Navigate")
    expect(app.text).toContain("Ctrl+-")
    expect(app.text).toContain("go back")
    expect(app.text).toContain("Find")
    expect(app.text).toContain("search this document")
    expect(app.text).toContain("Esc closes")
  })
})
