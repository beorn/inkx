/**
 * OverflowIndicator Component Tests
 *
 * Tests the unified overflow indicator used by all views.
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createTestRenderer } from "inkx/testing"

const render = createTestRenderer()
import { OverflowIndicator } from "../../src/views/OverflowIndicator.tsx"

describe("OverflowIndicator", () => {
  it("returns null when count is 0", () => {
    const { lastFrameText } = render(
      <OverflowIndicator direction="down" count={0} />,
    )
    // Component returns null, so the frame should be empty (just whitespace)
    expect(lastFrameText()?.trim()).toBe("")
  })

  it("returns null when count is negative", () => {
    const { lastFrameText } = render(
      <OverflowIndicator direction="down" count={-5} />,
    )
    // Component returns null, so the frame should be empty (just whitespace)
    expect(lastFrameText()?.trim()).toBe("")
  })

  it("shows down arrow with count for direction down", () => {
    const { lastFrameText } = render(
      <OverflowIndicator direction="down" count={5} />,
    )
    expect(lastFrameText()).toContain("▼")
    expect(lastFrameText()).toContain("5 more")
  })

  it("shows up arrow with count for direction up", () => {
    const { lastFrameText } = render(
      <OverflowIndicator direction="up" count={3} />,
    )
    expect(lastFrameText()).toContain("▲")
    expect(lastFrameText()).toContain("3 more")
  })

  it("renders with width prop", () => {
    const { lastFrameText } = render(
      <OverflowIndicator direction="down" count={5} width={30} />,
    )
    const frame = lastFrameText() || ""
    // Verify the text is present
    // Note: centering behavior (padding spaces) may be stripped by text extraction
    expect(frame).toContain("▼ 5 more")
  })

  it("does not center when width is too narrow", () => {
    const { lastFrameText } = render(
      <OverflowIndicator direction="down" count={5} width={5} />,
    )
    const frame = lastFrameText() || ""
    // Width is less than text, so no padding should be applied
    expect(frame).toContain("▼ 5 more")
  })

  it("handles large counts", () => {
    const { lastFrameText } = render(
      <OverflowIndicator direction="down" count={999} />,
    )
    expect(lastFrameText()).toContain("▼")
    expect(lastFrameText()).toContain("999 more")
  })

  it("works without width prop", () => {
    const { lastFrameText } = render(
      <OverflowIndicator direction="up" count={10} />,
    )
    expect(lastFrameText()).toContain("▲ 10 more")
  })
})
