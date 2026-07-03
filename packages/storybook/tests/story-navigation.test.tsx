/**
 * @failure  StorybookApp's list-pane keyboard navigation (j / ArrowDown)
 *   stops moving the selected story — e.g. the `nav`/`active` wiring on the
 *   story ListView regresses, or `onCursor`/`setSelectedStoryId` stops
 *   updating the preview — silently freezing the runner on the initial
 *   story regardless of keypresses. This is the package's OWN behavioral
 *   coverage; before this file only a downstream consumer's tests exercised
 *   navigation.
 * @level    l2
 * @consumer @si/scroll/15065-l4l5/15067-storybook-previewhost-scrollarea/20722-host-extraction/20740-functional-tests
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "@silvery/ag-react"
import { StorybookApp } from "../src/index.ts"
import type { Story } from "../src/index.ts"

/** Minimal Story fixture — a single-line marker so the preview is unambiguous. */
function fixtureStory(id: string, bodyMarker: string): Story {
  const [component, variant] = id.split("/") as [string, string]
  return {
    id,
    component,
    variant,
    description: "Fixture story for @silvery/storybook navigation coverage.",
    render: () => <Text>{bodyMarker}</Text>,
  }
}

const STORIES: readonly Story[] = [
  fixtureStory("Nav/alpha", "ALPHA-BODY-MARKER"),
  fixtureStory("Nav/beta", "BETA-BODY-MARKER"),
  fixtureStory("Nav/gamma", "GAMMA-BODY-MARKER"),
]

// NOTE — cross-test global state gotcha: StorybookApp seeds its initial pane
// focus ("list" vs "preview") from a process-global hot-reload runtime
// singleton (getHotStorybookRuntime(), backed by
// globalThis.__SILVERY_STORYBOOK_RUNTIME__) that persists across every test
// in this file/worker. Every test below presses "h" right after mount — the
// global key that deterministically forces pane focus back to "list" — so
// list-nav (j/ArrowDown) assertions never depend on what a previous test left
// behind in that shared singleton.
describe("StorybookApp story navigation (20740)", () => {
  test("pressing j moves the cursor to the next story and updates the preview", async () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<StorybookApp initialStoryId="Nav/alpha" stories={STORIES} />)
    await app.press("h")

    expect(app.text).toContain("ALPHA-BODY-MARKER")
    expect(app.text).not.toContain("BETA-BODY-MARKER")

    await app.press("j")

    expect(app.text).toContain("BETA-BODY-MARKER")
    expect(app.text).not.toContain("ALPHA-BODY-MARKER")
  })

  test("pressing ArrowDown moves the cursor to the next story and updates the preview", async () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<StorybookApp initialStoryId="Nav/alpha" stories={STORIES} />)
    await app.press("h")

    expect(app.text).toContain("ALPHA-BODY-MARKER")

    await app.press("ArrowDown")

    expect(app.text).toContain("BETA-BODY-MARKER")
    expect(app.text).not.toContain("ALPHA-BODY-MARKER")
  })

  test("pressing j twice from the first story reaches the third story", async () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<StorybookApp initialStoryId="Nav/alpha" stories={STORIES} />)
    await app.press("h")

    await app.press("j")
    await app.press("j")

    expect(app.text).toContain("GAMMA-BODY-MARKER")
    expect(app.text).not.toContain("ALPHA-BODY-MARKER")
    expect(app.text).not.toContain("BETA-BODY-MARKER")
  })
})
