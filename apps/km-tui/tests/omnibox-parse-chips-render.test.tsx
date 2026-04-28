/**
 * Render-side test for the parse-chips strip — verifies the chips render
 * inside the UnifiedOmnibox between the input and the result list, with
 * one chip per parsed token and distinct kind attributes.
 *
 * Acceptance (e): "esthetic parity tested in the mockup app first" —
 * this is the unit-level proxy. The deeper visual review happens in the
 * showcase app.
 */
import React from "react"
import { describe, expect, it } from "vitest"
import { createRenderer } from "@silvery/test"
import { UnifiedOmnibox } from "../src/views/UnifiedOmnibox.tsx"
import { createOmniboxPane, type OmniboxInvocationSpec } from "../src/state/omnibox.ts"

function spec(buffer: string): OmniboxInvocationSpec {
  return {
    initialBuffer: buffer,
    initialDefaultCommand: "default",
    initialArgumentId: null,
    anchorPaneId: "pane-1",
    subjectSelection: { cursorId: "anchor", selectedIds: ["anchor"] },
    candidateProvider: () => [],
  }
}

describe("UnifiedOmnibox — parse chips strip", () => {
  it("renders no chip strip when buffer is empty", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <UnifiedOmnibox pane={createOmniboxPane(spec(""))} results={[]} selectedIndex={0} onBufferChange={() => {}} onConfirm={() => {}} layout="center" />,
    )
    expect(app.locator("[data-testid='omnibox-parse-chips']").count()).toBe(0)
  })

  it("renders one chip strip with multiple chips for '[] @me urgent'", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <UnifiedOmnibox
        pane={createOmniboxPane(spec("[] @me urgent"))}
        results={[]}
        selectedIndex={0}
        onBufferChange={() => {}}
        onConfirm={() => {}}
        layout="center"
      />,
    )
    expect(app.locator("[data-testid='omnibox-parse-chips']").count()).toBe(1)
    expect(app.text).toContain("[]")
    expect(app.text).toContain("@me")
    expect(app.text).toContain("urgent")
  })

  it("emits a data-chip-kind attribute on each chip for visual differentiation", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <UnifiedOmnibox
        pane={createOmniboxPane(spec("#bug -wip"))}
        results={[]}
        selectedIndex={0}
        onBufferChange={() => {}}
        onConfirm={() => {}}
        layout="center"
      />,
    )
    expect(app.locator("[data-chip-kind='tag']").count()).toBeGreaterThanOrEqual(1)
    expect(app.locator("[data-chip-kind='exclude']").count()).toBeGreaterThanOrEqual(1)
  })
})
