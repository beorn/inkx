/**
 * Button variant surface (Sterling Phase 2b).
 *
 * Covers the `variant` prop: Sterling status roles + `accent` + the
 * `destructive` intent alias. Each variant must resolve to the matching
 * Sterling flat tokens on the Box background and Text foreground.
 *
 * Refs: hub/silvery/design/v10-terminal/design-system.md §"Intent vs role"
 *       hub/silvery/design/v10-terminal/sterling-preflight.md (D1)
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import type { StyleProps } from "@silvery/ag/types"
import { Button } from "../../packages/ag-react/src/ui/components/Button"

const render = createRenderer({ cols: 80, rows: 24 })

interface BoxStyleProps extends StyleProps {
  backgroundColor?: string
}

function textColorOf(label: string, app: ReturnType<typeof render>): string | undefined {
  const node = app.getByText(` ${label} `).resolve()
  return (node?.props as StyleProps | undefined)?.color as string | undefined
}

function bgColorOf(label: string, app: ReturnType<typeof render>): string | undefined {
  // Button wraps its Text in a Box — walk up from the text node to the Box.
  const text = app.getByText(` ${label} `).resolve()
  const box = text?.parent
  return (box?.props as BoxStyleProps | undefined)?.backgroundColor
}

describe("Button variant surface", () => {
  // [variant, expected bg, expected fg]
  const cases: Array<[string, string, string]> = [
    ["accent", "$bg-accent", "$fg-on-accent"],
    ["error", "$bg-error", "$fg-on-error"],
    ["warning", "$bg-warning", "$fg-on-warning"],
    ["success", "$bg-success", "$fg-on-success"],
    ["info", "$bg-info", "$fg-on-info"],
    ["destructive", "$bg-error", "$fg-on-error"], // intent alias for error
  ]

  for (const [variant, expectedBg, expectedFg] of cases) {
    test(`variant="${variant}" → bg=${expectedBg}, fg=${expectedFg}`, () => {
      const label = `T-${variant}`
      const app = render(<Button label={label} variant={variant as never} onPress={() => {}} />)
      expect(bgColorOf(label, app), `bg for variant=${variant}`).toBe(expectedBg)
      expect(textColorOf(label, app), `fg for variant=${variant}`).toBe(expectedFg)
    })
  }

  test("destructive resolves to the same tokens as error", () => {
    // Each render() unmounts the previous one — capture values immediately.
    const err = render(<Button label="err" variant="error" onPress={() => {}} />)
    const errBg = bgColorOf("err", err)
    const errFg = textColorOf("err", err)
    const dst = render(<Button label="dst" variant="destructive" onPress={() => {}} />)
    const dstBg = bgColorOf("dst", dst)
    const dstFg = textColorOf("dst", dst)
    expect(dstBg).toBe(errBg)
    expect(dstFg).toBe(errFg)
    // And both should match error tokens explicitly.
    expect(errBg).toBe("$bg-error")
    expect(errFg).toBe("$fg-on-error")
  })

  test("default variant is accent (no variant prop, no color prop)", () => {
    const app = render(<Button label="default" onPress={() => {}} />)
    expect(app.containsText("[ default ]")).toBe(false)
    expect(app.containsText(" default ")).toBe(true)
    expect(bgColorOf("default", app)).toBe("$bg-accent")
    expect(textColorOf("default", app)).toBe("$fg-on-accent")
  })

  test("legacy color prop still works (no bg fill, no variant)", () => {
    // Caller provides raw color and no variant — stays on the legacy path so
    // existing call sites keep their rendering.
    const app = render(<Button label="legacy" color="#ff00ff" onPress={() => {}} />)
    expect(textColorOf("legacy", app)).toBe("#ff00ff")
    // No background fill on the legacy path.
    expect(bgColorOf("legacy", app)).toBeUndefined()
  })

  test("variant wins when both variant and color are set", () => {
    const app = render(<Button label="both" variant="error" color="#ff00ff" onPress={() => {}} />)
    // Variant path kicks in, so bg + fg come from Sterling, not the raw color.
    expect(bgColorOf("both", app)).toBe("$bg-error")
    expect(textColorOf("both", app)).toBe("$fg-on-error")
  })
})
