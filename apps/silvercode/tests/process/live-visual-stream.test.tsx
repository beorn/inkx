/**
 * Live visual stream checks through the process harness.
 *
 * The visual scenario tests render settled frames in-process. This file drives
 * canned AgentEvent streams inside a real PTY-backed silvercode subprocess, so
 * it catches bugs that only appear while the UI is changing: incremental
 * rendering, cursor writes, alt-screen behavior, and side-panel/chat races.
 */

import { describe, expect, test } from "vitest"
import type { RenderedScenario } from "../../src/test/render-harness.tsx"
import { expectLayoutInvariants } from "../visual/_invariants.ts"
import { spawnSilvercode } from "../process-harness/index.ts"

const COLS = 120
const ROWS = 40
const STARTUP_TIMEOUT_MS = 15_000

function isWelcomeReady(screen: string): boolean {
  return screen.includes("Silver Code v") && screen.includes("Claude Code") && screen.includes(">")
}

function scenarioFromScreen(text: string): RenderedScenario {
  return {
    text,
    lines: text.split("\n"),
    cols: COLS,
    rows: ROWS,
  } as unknown as RenderedScenario
}

async function sampleScreens(
  harness: Awaited<ReturnType<typeof spawnSilvercode>>,
  opts: { durationMs: number; intervalMs: number },
): Promise<string[]> {
  const samples: string[] = []
  const started = Date.now()
  while (Date.now() - started < opts.durationMs) {
    samples.push(harness.screenshot("text"))
    await new Promise<void>((resolve) => setTimeout(resolve, opts.intervalMs))
  }
  samples.push(harness.screenshot("text"))
  return samples
}

describe("silvercode live visual stream (process harness)", () => {
  test("streaming long tool output keeps layout invariants on every sampled PTY frame", async () => {
    await using harness = await spawnSilvercode({
      cols: COLS,
      rows: ROWS,
      script: "longToolResult",
      scriptDelayMs: 600,
      scriptIntervalMs: 140,
    })

    await harness.waitFor(isWelcomeReady, { timeoutMs: STARTUP_TIMEOUT_MS })
    const samples = await sampleScreens(harness, { durationMs: 1_800, intervalMs: 60 })
    await harness.waitFor("dump-huge-blob", { timeoutMs: STARTUP_TIMEOUT_MS })
    await harness.waitForStable({ stableMs: 400, timeoutMs: STARTUP_TIMEOUT_MS })

    const final = harness.screenshot("text")
    const interesting = [...samples, final].filter(
      (screen) => screen.includes("Silver Code v") || screen.includes("dump") || screen.includes("dump-huge-blob"),
    )
    expect(interesting.length, "expected to sample live silvercode frames").toBeGreaterThan(5)

    for (const [index, screen] of interesting.entries()) {
      expectLayoutInvariants(scenarioFromScreen(screen), {
        skip: {
          // Some sampled frames are welcome-only before the first transcript
          // row arrives; the other invariants still exercise live layout.
          icons: !screen.includes("dump"),
        },
      })
      expect(screen, `live PTY frame ${index} should not show border detritus`).not.toMatch(/[┌┐└┘╭╮╰╯]/u)
    }
  }, 30_000)
})
