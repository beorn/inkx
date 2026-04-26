/**
 * Regression test for `km-silvercode.welcome-card-hidden`.
 *
 * Symptom: launching silvercode showed an empty pane — only the focus bar
 * `▎` was visible at column 0; no Welcome title, no Commands list, no
 * Keybindings list. Reproduces deterministically when SessionCard renders
 * Welcome (state.messages.length === 0).
 *
 * Root cause: SessionCard's focus-bar Box (`flexBasis={1} width={1}`) held
 * `<Text wrap="wrap">{"▎".repeat(200)}</Text>`. Without `overflow="hidden"`,
 * the text's max-content width (200) leaked into the layout — the bar
 * column was sized to ~30-200 cells instead of 1, pushing the Welcome
 * sibling's content past the viewport's right edge so only the bar painted.
 *
 * Fix: add `overflow="hidden"` to the focus bar Box. flexBasis/width=1
 * alone don't clamp wrap-content max-content size in flexily; the box
 * needs an explicit overflow boundary on the wrap-content item itself.
 */

import React from "react"
import { test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Screen } from "silvery"
import { renderScenario } from "../src/test/render-harness.tsx"
import { welcome } from "../src/test/scripts/welcome.ts"
import { SessionCard } from "../src/components/SessionCard.tsx"

test("Welcome content renders in focused pane (full app)", async () => {
  const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
  // Title is the canonical Welcome marker.
  expect(s.text).toContain("Silver Code for Claude Code")
  // Commands + Keybindings sections must both render.
  expect(s.text).toContain("Commands")
  expect(s.text).toContain("Keybindings")
  // At least one slash-command row.
  expect(s.text).toContain("/inbox")
  s.dispose()
})

test("SessionCard with empty messages renders Welcome alongside the focus bar", async () => {
  const fakeStore = {
    state: {
      get: () => ({
        messages: [],
        status: "idle" as const,
        cost: { inputTokens: 0, outputTokens: 0 },
        permissions: [],
      }),
      subscribe: () => () => {},
    },
  } as never
  const handle = {
    id: "test",
    name: "test",
    store: fakeStore,
    session: {} as never,
    unsubscribe: () => {},
    log: { write: () => {}, sessionLogPath: "" } as never,
    account: undefined,
  } as never

  const renderer = createRenderer({ cols: 80, rows: 30 })
  const app = renderer(
    <Screen flexDirection="row">
      <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        <SessionCard handle={handle} isFocused onFocus={() => {}} onApprove={() => {}} onDeny={() => {}} />
      </Box>
    </Screen>,
  )
  expect(app.text).toContain("Silver Code for Claude Code")
  expect(app.text).toContain("Commands")
  expect(app.text).toContain("Keybindings")
  // Focus bar still paints in column 0.
  const lines = app.lines.filter((l) => l.startsWith("▎"))
  expect(lines.length).toBeGreaterThan(5)
})
