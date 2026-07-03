/**
 * @failure  The StorybookHostInjection seam (`proseLaneWrapper` /
 *   `previewWrap`) stops firing — e.g. StorybookApp/StoryFrame/Story stop
 *   reading useStorybookHostInjection() or silently hardcode the plain-
 *   silvery fallback — so a consumer host (ag, hab) can no longer inject its
 *   responsive prose-lane or preview-pane layout, reverting every consumer
 *   to generic chrome with no signal in this package's own suite.
 * @level    l2
 * @consumer @si/scroll/15065-l4l5/15067-storybook-previewhost-scrollarea/20722-host-extraction/20740-functional-tests
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { StorybookApp, StorybookHostInjectionProvider } from "../src/index.ts"
import type { Story, StorybookHostInjection } from "../src/index.ts"

const PROSE_MARKER = "PROSE-LANE-INJECTION-MARKER"
const PREVIEW_MARKER = "PREVIEW-WRAP-INJECTION-MARKER"

/** Minimal Story fixture. Default contentLane ("prose"), so proseLaneWrapper applies. */
function fixtureStory(id: string, bodyMarker: string): Story {
  const [component, variant] = id.split("/") as [string, string]
  return {
    id,
    component,
    variant,
    description: "Fixture story for @silvery/storybook injection coverage.",
    render: () => <Text>{bodyMarker}</Text>,
  }
}

describe("StorybookHostInjection seam (20740)", () => {
  test("proseLaneWrapper and previewWrap both fire when supplied via StorybookHostInjectionProvider", () => {
    const story = fixtureStory("Injected/story", "INJECTED-BODY-MARKER")
    const injection: StorybookHostInjection = {
      proseLaneWrapper: (body) => (
        <Box flexDirection="column">
          <Text>{PROSE_MARKER}</Text>
          {body}
        </Box>
      ),
      previewWrap: (node, paneCols) => (
        <Box flexDirection="column">
          <Text>{`${PREVIEW_MARKER}-${paneCols}`}</Text>
          {node}
        </Box>
      ),
    }

    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(
      <StorybookHostInjectionProvider value={injection}>
        <StorybookApp initialStoryId={story.id} stories={[story]} />
      </StorybookHostInjectionProvider>,
    )

    expect(app.text).toContain(PROSE_MARKER)
    expect(app.text).toContain(PREVIEW_MARKER)
    // previewWrap's paneCols argument is real layout data (list pane width +
    // scrollbar gutter subtracted from the terminal width), not a stub value.
    // Assert it's a plausible positive column count rather than hardcoding
    // the internal LIST_PANE_WIDTH / PREVIEW_SCROLLBAR_GUTTER constants.
    const paneColsMatch = app.text.match(new RegExp(`${PREVIEW_MARKER}-(\\d+)`))
    expect(paneColsMatch, `expected "${PREVIEW_MARKER}-<N>" in:\n${app.text}`).not.toBeNull()
    const paneCols = Number(paneColsMatch?.[1] ?? NaN)
    expect(paneCols).toBeGreaterThan(0)
    expect(paneCols).toBeLessThan(100)
    // Both wrappers compose AROUND the actual story content, not replace it.
    expect(app.text).toContain("INJECTED-BODY-MARKER")
  })

  test("without an injection provider, the host falls back to plain silvery defaults", () => {
    const story = fixtureStory("Uninjected/story", "PLAIN-BODY-MARKER")
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<StorybookApp initialStoryId={story.id} stories={[story]} />)

    expect(app.text).not.toContain(PROSE_MARKER)
    expect(app.text).not.toContain(PREVIEW_MARKER)
    expect(app.text).toContain("PLAIN-BODY-MARKER")
  })
})
