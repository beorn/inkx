/**
 * Text `internal_dim` prop — end-to-end coverage for the SGR 2 (faint) style
 * escape hatch across the React prop surface. `dim` is intentionally NOT a
 * public style prop (the design system is token-first — reach for `$fg-muted`
 * etc.); `internal_dim` mirrors the `internal_hyperlink` convention and exists
 * only for chrome with no matching token tier. A plain `<Text internal_dim>`
 * renders dimmed cells, nested `<Text>` inherits/overrides dim like bold, and
 * toggling it on a mounted node repaints incrementally (the prop is in the
 * reconciler's STYLE_PROPS set, so a change sets stylePropsDirty).
 *
 * @failure `<Text internal_dim>` renders undimmed, nested dim inheritance is
 *   wrong, a dim toggle does not repaint (stale cell) because the reconciler
 *   never marked the node style-dirty, or `dim` leaks onto the PUBLIC Text prop
 *   surface (token-first policy break).
 * @level l1
 * @consumer km-tui muted/faint chrome; internal_dim plumbing (feat: Text dim prop)
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "../src"

describe("Text internal_dim prop", () => {
  test("<Text internal_dim> renders dimmed cells; plain <Text> does not", () => {
    const render = createRenderer({ cols: 6, rows: 1 })
    const app = render(<Text internal_dim>hi</Text>)
    expect(app.cell(0, 0).char).toBe("h")
    expect(app.cell(0, 0).dim).toBe(true)
    expect(app.cell(1, 0).dim).toBe(true)

    app.rerender(<Text>hi</Text>)
    expect(app.cell(0, 0).dim).toBe(false)
  })

  test("nested <Text internal_dim> inside a plain parent dims only the nested run", () => {
    const render = createRenderer({ cols: 8, rows: 1 })
    const app = render(
      <Text>
        a<Text internal_dim>b</Text>c
      </Text>,
    )
    expect(app.cell(0, 0).char).toBe("a")
    expect(app.cell(0, 0).dim).toBe(false)
    expect(app.cell(1, 0).char).toBe("b")
    expect(app.cell(1, 0).dim).toBe(true)
    expect(app.cell(2, 0).char).toBe("c")
    expect(app.cell(2, 0).dim).toBe(false)
  })

  test("nested internal_dim override mirrors bold exactly (shared base-emphasis limit)", () => {
    // A nested `internal_dim={false}` inside a dim parent does NOT clear dim at
    // the cell level — the top-level <Text internal_dim> carries dim on the base
    // cell style, and the nested run emits no explicit un-dim SGR, so the base
    // emphasis survives the OR-merge. This is IDENTICAL to bold (verified
    // side-by-side): internal_dim is plumbed to mirror bold exactly, including
    // this shared limitation. The child style CONTEXT does get dim=false (see
    // render-text.test.ts merge tests) — only the base-carried cell emphasis is
    // not cleared here.
    const dimApp = createRenderer({ cols: 8, rows: 1 })(
      <Text internal_dim>
        a<Text internal_dim={false}>b</Text>c
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

  test("toggling internal_dim on a mounted node repaints incrementally (STRICT-verified)", () => {
    const prevStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "1"
    try {
      const render = createRenderer({ cols: 6, rows: 1 })
      const app = render(<Text internal_dim={false}>hi</Text>)
      expect(app.cell(0, 0).dim).toBe(false)

      app.rerender(<Text internal_dim>hi</Text>)
      expect(app.cell(0, 0).dim).toBe(true)

      app.rerender(<Text internal_dim={false}>hi</Text>)
      expect(app.cell(0, 0).dim).toBe(false)
    } finally {
      if (prevStrict === undefined) {
        delete process.env.SILVERY_STRICT
      } else {
        process.env.SILVERY_STRICT = prevStrict
      }
    }
  })

  test("`dim` is not a public Text prop (token-first policy — use internal_dim)", () => {
    // Enforced by the typecheck gate (tsc), not the vitest runtime: if someone
    // adds a public `dim?: boolean` to StyleProps/TextProps, the @ts-expect-error
    // below becomes an unused-directive error and this guard fails.
    // @ts-expect-error — public `dim` is intentionally unadvertised; use internal_dim.
    const el = <Text dim>x</Text>
    expect(el).toBeTruthy()
  })
})
