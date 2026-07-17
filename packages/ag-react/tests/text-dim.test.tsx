/**
 * Text `dim` prop — end-to-end coverage for the SGR 2 (faint) style prop
 * across the React prop surface: a plain `<Text dim>` renders dimmed cells,
 * nested `<Text>` inherits/overrides dim like bold, and toggling `dim` on a
 * mounted node repaints incrementally (the prop is in the reconciler's
 * STYLE_PROPS set, so a change sets stylePropsDirty).
 *
 * @failure `<Text dim>` renders undimmed, nested dim inheritance is wrong, or a
 *   dim toggle does not repaint (stale cell) because the reconciler never
 *   marked the node style-dirty — the incremental-invariant break this prop
 *   plumbing was added to prevent.
 * @level l1
 * @consumer km-tui muted/faint text; dim-prop plumbing (feat: Text dim prop)
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "../src"

describe("Text dim prop", () => {
  test("<Text dim> renders dimmed cells; plain <Text> does not", () => {
    const render = createRenderer({ cols: 6, rows: 1 })
    const app = render(<Text dim>hi</Text>)
    expect(app.cell(0, 0).char).toBe("h")
    expect(app.cell(0, 0).dim).toBe(true)
    expect(app.cell(1, 0).dim).toBe(true)

    app.rerender(<Text>hi</Text>)
    expect(app.cell(0, 0).dim).toBe(false)
  })

  test("nested <Text dim> inside a plain parent dims only the nested run", () => {
    const render = createRenderer({ cols: 8, rows: 1 })
    const app = render(
      <Text>
        a<Text dim>b</Text>c
      </Text>,
    )
    expect(app.cell(0, 0).char).toBe("a")
    expect(app.cell(0, 0).dim).toBe(false)
    expect(app.cell(1, 0).char).toBe("b")
    expect(app.cell(1, 0).dim).toBe(true)
    expect(app.cell(2, 0).char).toBe("c")
    expect(app.cell(2, 0).dim).toBe(false)
  })

  test("nested dim override mirrors bold exactly (shared base-emphasis limit)", () => {
    // A nested `dim={false}` inside a dim parent does NOT clear dim at the cell
    // level — the top-level <Text dim> carries dim on the base cell style, and
    // the nested run emits no explicit un-dim SGR, so the base emphasis survives
    // the OR-merge. This is IDENTICAL to bold (verified side-by-side below): dim
    // is plumbed to mirror bold exactly, including this shared limitation. The
    // child style CONTEXT does get dim=false (see render-text.test.ts merge
    // tests) — only the base-carried cell emphasis is not cleared here.
    const dimApp = createRenderer({ cols: 8, rows: 1 })(
      <Text dim>
        a<Text dim={false}>b</Text>c
      </Text>,
    )
    const boldApp = createRenderer({ cols: 8, rows: 1 })(
      <Text bold>
        a<Text bold={false}>b</Text>c
      </Text>,
    )
    expect(dimApp.cell(1, 0).char).toBe("b")
    expect([dimApp.cell(0, 0).dim, dimApp.cell(1, 0).dim, dimApp.cell(2, 0).dim]).toEqual([
      boldApp.cell(0, 0).bold,
      boldApp.cell(1, 0).bold,
      boldApp.cell(2, 0).bold,
    ])
  })

  test("toggling dim on a mounted node repaints incrementally (STRICT-verified)", () => {
    const prevStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "1"
    try {
      const render = createRenderer({ cols: 6, rows: 1 })
      const app = render(<Text dim={false}>hi</Text>)
      expect(app.cell(0, 0).dim).toBe(false)

      app.rerender(<Text dim>hi</Text>)
      expect(app.cell(0, 0).dim).toBe(true)

      app.rerender(<Text dim={false}>hi</Text>)
      expect(app.cell(0, 0).dim).toBe(false)
    } finally {
      if (prevStrict === undefined) {
        delete process.env.SILVERY_STRICT
      } else {
        process.env.SILVERY_STRICT = prevStrict
      }
    }
  })
})
