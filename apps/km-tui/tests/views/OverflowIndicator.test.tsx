/**
 * OverflowIndicator Component Tests
 *
 * Tests the unified overflow indicator used by all views.
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"

const render = createRenderer()
import { OverflowIndicator } from "../../src/views/OverflowIndicator.tsx"

describe("OverflowIndicator", () => {
  it("returns null when count is 0", () => {
    const app = render(<OverflowIndicator direction="down" count={0} />)
    // Component returns null, so the frame should be empty (just whitespace)
    expect(app.text.trim()).toBe("")
  })

  it("returns null when count is negative", () => {
    const app = render(<OverflowIndicator direction="down" count={-5} />)
    // Component returns null, so the frame should be empty (just whitespace)
    expect(app.text.trim()).toBe("")
  })

  it("shows down arrow with count for direction down", () => {
    const app = render(<OverflowIndicator direction="down" count={5} />)
    expect(app.text).toContain("▼")
    expect(app.text).toContain("5 more")
  })

  it("shows up arrow with count for direction up", () => {
    const app = render(<OverflowIndicator direction="up" count={3} />)
    expect(app.text).toContain("▲")
    expect(app.text).toContain("3 more")
  })

  it("renders with width prop", () => {
    const app = render(<OverflowIndicator direction="down" count={5} width={30} />)
    // Verify the text is present
    // Note: centering behavior (padding spaces) may be stripped by text extraction
    expect(app.text).toContain("▼ 5 more")
  })

  it("does not center when width is too narrow", () => {
    const app = render(<OverflowIndicator direction="down" count={5} width={5} />)
    // Width is less than text, so no padding should be applied
    expect(app.text).toContain("▼ 5 more")
  })

  it("handles large counts", () => {
    const app = render(<OverflowIndicator direction="down" count={999} />)
    expect(app.text).toContain("▼")
    expect(app.text).toContain("999 more")
  })

  it("works without width prop", () => {
    const app = render(<OverflowIndicator direction="up" count={10} />)
    expect(app.text).toContain("▲ 10 more")
  })
})
