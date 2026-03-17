/**
 * Storybook Smoke Test
 *
 * Renders every storybook section to verify none crash or hang.
 * Dynamic: auto-discovers sections from storybook.tsx.
 */

import React from "react"
import { describe, it, expect } from "vitest"
import { createRenderer } from "@silvery/test"

import { sections, StorybookProviders, mockRepo } from "./storybook.tsx"
import { RepoProvider } from "../src/repo-context.tsx"

const render = createRenderer({ cols: 120, rows: 40 })

describe("storybook smoke", () => {
  it.each(sections.map((s) => ({ id: s.id, title: s.title, component: s.component })))(
    "$title renders without error",
    ({ component: Component }) => {
      // Rendering without throwing = success. BoardCore sections may produce
      // empty output in headless mode (no real terminal) — that's OK.
      const app = render(
        <RepoProvider repo={mockRepo}>
          <StorybookProviders>
            <Component />
          </StorybookProviders>
        </RepoProvider>,
      )
      // Verify render completed (lastFrame exists)
      expect(app.lastFrame()).toBeDefined()
      app.unmount()
    },
  )
})
