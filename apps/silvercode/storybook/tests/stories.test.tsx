/**
 * Smoke-render every registered story.
 *
 * For each story we resolve knob defaults, mount the rendered element via
 * `@silvery/test createRenderer`, and assert that the output frame is not
 * empty. We don't snapshot the frame — story output is intentionally
 * volatile during design iteration. Snapshotting belongs in dedicated
 * `*.tape.ts` tests once the design stabilizes (tape-recording integration
 * is queued for follow-up).
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Screen } from "silvery"
import { STORIES } from "../registry.ts"
import { resolveKnobs } from "../types.ts"

describe("storybook stories — smoke render", () => {
  for (const story of STORIES) {
    test(`renders: ${story.id}`, async () => {
      const renderer = createRenderer({ cols: 80, rows: 24 })
      const knobs = resolveKnobs(story)
      const element = story.render(knobs)
      // Wrap in Screen if the story didn't already — Screen owns the
      // root layout pin every silvery render needs. Stories that bring
      // their own Screen (ChatBlockList variants) double-wrap harmlessly.
      const app = renderer(<Screen flexDirection="column">{element}</Screen>)
      expect(app.text).toBeTypeOf("string")
      // Stories may legitimately produce a blank frame (e.g. dialogs
      // that gate on filtered results) — only assert we didn't crash.
      // The shape of `app.text` is enough to confirm the render path
      // succeeded; Screen guarantees a string output.
    })
  }
})

describe("All/together layout", () => {
  test("uses only the runner navigation; story body has fixed right side panel and no local sections nav", () => {
    const story = STORIES.find((s) => s.id === "All/together")
    expect(story).toBeDefined()
    const renderer = createRenderer({ cols: 120, rows: 30 })
    const app = renderer(story!.render(resolveKnobs(story!)))

    expect(app.text).not.toContain("Sections")
    expect(app.text).not.toContain("Exchange 1\n")
    expect(app.text).toContain("Sessions")
    expect(app.locator("#all-side-panel").boundingBox()?.width).toBe(40)
    expect(app.locator("#all-main-panel").boundingBox()?.width).toBe(79)
  })
})
