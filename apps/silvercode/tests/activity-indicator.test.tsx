import React from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import { ActivityIndicator } from "../src/components/ActivityIndicator.tsx"
import { StatusGlyph } from "../src/components/StatusGlyph.tsx"

describe("ActivityIndicator", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("uses the silvercode thinking words", () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const activeState = "thinking"
    const renderer = createRenderer({ cols: 80, rows: 6 })
    const app = renderer(
      <Box width={80} height={6} flexDirection="column">
        <ActivityIndicator status={activeState} turnStartedAt={0} />
      </Box>,
    )

    expect(app.text).toContain("Smelting…")
    expect(app.text).toContain("●")
    expect(app.text).not.toContain("◈")
  })

  test("active status glyph starts at background color for a full pulse fade", () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const renderer = createRenderer({ cols: 8, rows: 2 })
    const app = renderer(
      <Box width={8} height={2} backgroundColor="$bg-surface-raised">
        <StatusGlyph glyph="●" active color="$accent" backgroundColor="$bg-surface-raised" />
      </Box>,
    )

    const cell = app.cell(0, 0)
    expect(cell.char).toBe("●")
    expect(cell.fg).toStrictEqual(cell.bg)
  })

  test("resume startup says resuming instead of spawning", () => {
    const renderer = createRenderer({ cols: 80, rows: 6 })
    const app = renderer(
      <Box width={80} height={6} flexDirection="column">
        <ActivityIndicator status="spawning" agentLabel="Codex" startupVerb="resuming" />
      </Box>,
    )

    expect(app.text).toContain("Resuming Codex…")
    expect(app.text).not.toContain("Spawning Codex")
  })
})
