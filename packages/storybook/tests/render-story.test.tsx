/**
 * @failure  @silvery/storybook's StorybookApp regresses so a registered
 *   story's rendered content, or its chrome (the nav-list entry / preview
 *   title band), silently stops appearing — e.g. a `stories` prop plumbing
 *   change drops the initial story, or `StoryFrame` stops calling
 *   `story.render()`. This is the package's OWN behavioral coverage: before
 *   this file, @silvery/storybook shipped only the @ag-free purity invariant
 *   (host-framework-purity.test.ts) and relied entirely on a downstream
 *   consumer (ag/packages/code/storybook) to prove the host actually renders.
 * @level    l2
 * @consumer @si/scroll/15065-l4l5/15067-storybook-previewhost-scrollarea/20722-host-extraction/20740-functional-tests
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "@silvery/ag-react"
import { StorybookApp } from "../src/index.ts"
import type { Story } from "../src/index.ts"

/** Minimal Story fixture — a single-line marker so mounting is unambiguous. */
function fixtureStory(id: string, bodyMarker: string): Story {
  const [component, variant] = id.split("/") as [string, string]
  return {
    id,
    component,
    variant,
    description: "Fixture story for @silvery/storybook host coverage.",
    render: () => <Text>{bodyMarker}</Text>,
  }
}

describe("StorybookApp renders a registered story (20740)", () => {
  test("mounts the initial story's content and chrome (nav entry + preview title)", () => {
    const story = fixtureStory("Widget/basic", "RENDER-STORY-BODY-MARKER")
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<StorybookApp initialStoryId={story.id} stories={[story]} />)

    // Chrome: the runner header + story-count label always render.
    expect(app.text).toContain("STORYBOOK")
    expect(app.text).toContain("1 story")

    // Chrome: the story id appears as BOTH the nav-list entry and the
    // preview pane's title band — two distinct chrome surfaces, not one.
    const idOccurrences = app.text.split(story.id).length - 1
    expect(
      idOccurrences,
      `expected "${story.id}" in both the nav entry and preview title:\n${app.text}`,
    ).toBeGreaterThanOrEqual(2)

    // Content: the story's own render() output actually painted.
    expect(app.text).toContain("RENDER-STORY-BODY-MARKER")
  })

  test("opening a specific story via initialStoryId renders only that story's content", () => {
    const first = fixtureStory("Widget/basic", "FIRST-STORY-BODY-MARKER")
    const second = fixtureStory("Widget/danger", "SECOND-STORY-BODY-MARKER")
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<StorybookApp initialStoryId={second.id} stories={[first, second]} />)

    expect(app.text).toContain("2 stories")
    expect(app.text).toContain(first.id) // still listed in the nav pane
    expect(app.text).toContain(second.id) // selected — shown in nav + preview title
    expect(app.text).toContain("SECOND-STORY-BODY-MARKER")
    expect(app.text).not.toContain("FIRST-STORY-BODY-MARKER")
  })
})
