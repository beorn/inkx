/**
 * Breadcrumb `compact` Tests
 *
 * `compact` renders separators with no surrounding spaces, so a filesystem
 * trail reads `a/b/c` rather than `a / b / c`. Opt-in: navigational trails
 * (`Home > Settings`) still want the airy default, so the default path is
 * covered here too, per the defaults-contract convention.
 *
 * The spaces used to be literal `{" "}` nodes inside the separator's Text —
 * the "fake padding with spaces" anti-pattern named in The Silvery Way,
 * principle 2 — with no way for a caller to opt out.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Breadcrumb } from "silvery"

const render = createRenderer({ cols: 80, rows: 6 })

const ITEMS = [{ label: "@hh" }, { label: "tent" }, { label: "22467-config" }]

describe("Breadcrumb compact", () => {
  test("compact renders separators with no surrounding spaces", () => {
    const app = render(<Breadcrumb items={ITEMS} compact />)

    expect(app.text).toContain("@hh/tent/22467-config")
  })

  test("contract: separators default to spaced when compact is omitted", () => {
    const app = render(<Breadcrumb items={ITEMS} />)

    expect(app.text).toContain("@hh / tent / 22467-config")
  })

  test("compact honours a per-item separator override", () => {
    const app = render(
      <Breadcrumb items={[{ label: "a" }, { label: "b", separator: "›" }, { label: "c" }]} compact />,
    )

    expect(app.text).toContain("a›b/c")
  })

  test("a single item renders no separator under either setting", () => {
    const one = [{ label: "solo" }]

    expect(render(<Breadcrumb items={one} compact />).text.trim()).toBe("solo")
    expect(render(<Breadcrumb items={one} />).text.trim()).toBe("solo")
  })
})
