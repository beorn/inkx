/**
 * Regression test for `km-silvercode.welcome-pane-hidden`.
 *
 * Symptom: launching silvercode showed an empty pane — only the focus bar
 * `▎` was visible at column 0; no Welcome title, no Commands list, no
 * Keybindings list. Reproduces deterministically when ChatPane renders
 * Welcome (state.messages.length === 0).
 *
 * Root cause: ChatPane's focus-bar Box (`flexBasis={1} width={1}`) held
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
import { ChatPane } from "../src/components/ChatPane.tsx"

test("Welcome content renders in focused pane (full app)", async () => {
  const s = await renderScenario({ script: welcome, cols: 120, rows: 50, agent: "claude-code" })
  // Positive-space shaded gradient — SILVER row 1 sig " ░░░░░░  ░░░░",
  // CODE row 1 sig " ░░░░░░   ░░░░░░░". SILVER appears above CODE.
  const silverSig = s.lines.findIndex((l) => /[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/.test(l))
  const codeSig = s.lines.findIndex((l) => /[ \u00a0]░░░░░░[ \u00a0]{3}░░░░░░░/.test(l))
  expect(silverSig, "Shaded SILVER row 1 should render").toBeGreaterThanOrEqual(0)
  expect(codeSig, "Shaded CODE row 1 should render").toBeGreaterThanOrEqual(0)
  expect(silverSig).not.toBe(codeSig)
  expect(codeSig).toBeGreaterThan(silverSig)
  // Agent label muted line below the banner.
  expect(s.text).toContain("Claude Code")
  // Welcome is banner-only chrome — no embedded command box. The App-level
  // SessionPromptComposer at the bottom is the single command surface
  // (covered by separate composer tests). Help surface (COMMANDS /
  // KEYBINDINGS) was REMOVED in km-cr94.
  expect(s.text).not.toContain("COMMANDS")
  expect(s.text).not.toContain("KEYBINDINGS")
  s.dispose()
})

test("ChatPane with empty messages renders Welcome alongside the focus bar", async () => {
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
        <ChatPane
          handle={handle}
          isFocused
          agent="claude-code"
          onFocus={() => {}}
          onApprove={() => {}}
          onDeny={() => {}}
        />
      </Box>
    </Screen>,
  )
  // Positive-space shaded gradient — SILVER + CODE row-1 signatures.
  const silverSig = app.lines.findIndex((l) => /[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/.test(l))
  const codeSig = app.lines.findIndex((l) => /[ \u00a0]░░░░░░[ \u00a0]{3}░░░░░░░/.test(l))
  expect(silverSig, "SILVER row 1 should render").toBeGreaterThanOrEqual(0)
  expect(codeSig, "CODE row 1 should render").toBeGreaterThanOrEqual(0)
  expect(silverSig).not.toBe(codeSig)
  expect(codeSig).toBeGreaterThan(silverSig)
  expect(app.text).toContain("Claude Code")
  // Active-pane focus bar (▎) is intentionally REMOVED — no left-edge
  // chrome. The single-pane viewport doesn't need a focus indicator.
  const focusBarLines = app.lines.filter((l) => l.startsWith("▎"))
  expect(focusBarLines.length).toBe(0)
})
