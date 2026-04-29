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
  const s = await renderScenario({ script: welcome, cols: 120, rows: 40, agent: "claude-code" })
  // Banner is figlet ASCII art at 120 cols (well above the 36-col cutoff for
  // the "standard" tier). Assert structural signatures rather than literal
  // text — "SILVER" / "CODE" no longer render as glyphs:
  //   "____ ___ _ __" — unique top-row signature of figlet Standard "SILVER"
  //   "____ ___  ____" — unique top-row signature of figlet Standard "CODE"
  // These two strings only ever appear inside the brand banner, so their
  // presence proves both blocks rendered AND on different lines.
  // Bead: km-silvercode.welcome-claude-hardcoded, km-cr94.
  const silverSig = s.lines.findIndex((l) => l.includes("____ ___ _ __"))
  const codeSig = s.lines.findIndex((l) => l.includes("____ ___  ____"))
  expect(silverSig, "figlet SILVER block top row should render").toBeGreaterThanOrEqual(0)
  expect(codeSig, "figlet CODE block top row should render").toBeGreaterThanOrEqual(0)
  expect(silverSig, "SILVER and CODE blocks must be on different lines").not.toBe(codeSig)
  // CODE block sits below SILVER block (they're stacked vertically).
  expect(codeSig).toBeGreaterThan(silverSig)
  // Agent label muted line below the banner.
  expect(s.text).toContain("Claude Code")
  // Centered command box (TextInput placeholder text) — present in both
  // idle + spawning. Bead: km-cr94.
  expect(s.text).toMatch(/Type a message to start|Type your first message/)
  // Help surface — uppercase Small section headers.
  expect(s.text).toContain("COMMANDS")
  expect(s.text).toContain("KEYBINDINGS")
  // At least one slash-command row.
  expect(s.text).toContain("/panel")
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
        <SessionCard
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
  // Banner is figlet ASCII art. The 80-col viewport hosts the "standard"
  // tier (33-col blocks fit comfortably). Assert via structural signatures
  // — same approach as the "full app" test above. Bead: km-cr94.
  const silverSig = app.lines.findIndex((l) => l.includes("____ ___ _ __"))
  const codeSig = app.lines.findIndex((l) => l.includes("____ ___  ____"))
  expect(silverSig, "figlet SILVER block should render").toBeGreaterThanOrEqual(0)
  expect(codeSig, "figlet CODE block should render").toBeGreaterThanOrEqual(0)
  expect(silverSig).not.toBe(codeSig)
  expect(codeSig).toBeGreaterThan(silverSig)
  expect(app.text).toContain("Claude Code")
  // Focus bar still paints in column 0.
  const lines = app.lines.filter((l) => l.startsWith("▎"))
  expect(lines.length).toBeGreaterThan(5)
})
