import React from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import { ActivityIndicator } from "../src/components/ActivityIndicator.tsx"

describe("ActivityIndicator", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("uses the silvercode thinking words", () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const renderer = createRenderer({ cols: 80, rows: 6 })
    const app = renderer(
      <Box width={80} height={6} flexDirection="column">
        <ActivityIndicator status="thinking" turnStartedAt={0} />
      </Box>,
    )

    expect(app.text).toContain("Smelting…")
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
