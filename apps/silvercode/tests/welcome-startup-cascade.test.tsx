/**
 * Regression test for the 5-stage startup layout cascade
 * (bead km-silvery.startup-layout-cascade, task #4).
 *
 * Symptom: when a user launches silvercode the welcome screen visibly settles
 * through several different layouts before stabilising — three quick jumps
 * in the first ~50ms followed by two more after a few seconds. The visible
 * artefacts are: (a) the SILVER CODE banner momentarily missing, then
 * appearing at full width, then re-laying out; (b) the centered command
 * box twitching position; (c) a flicker where the agent label or composer
 * surface re-flows.
 *
 * What this test asserts: drive the real <App/> through termless (real
 * silvery runtime, real React commit timeline, virtual xterm.js display),
 * poll the emulator screen on a fast interval (5ms), and count how many
 * DISTINCT layout snapshots appear during the first ~1500ms of startup.
 *
 * Acceptance: ≤ 2 distinct layouts. Tolerated transitions are (a) blank
 * pre-paint screen, and (b) one stable post-mount layout. Anything more
 * indicates the cascade is reaching the emulator.
 *
 * Note on reproducibility: termless does not exercise the real-TTY async
 * paths (no Kitty CSI probe, no focus-reporting reply, no real resize
 * stream), so this harness only catches cascades visible in pure-React
 * commits. Cascade triggers that depend on real-TTY async I/O are caught
 * only by manual smoke-testing (smoke-checklist.md). When this test fires
 * it always indicates a regression worth investigating.
 */

import type { AgentSession, SessionId } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../src/test/fake-session.ts"
import { installFakes } from "../src/test/fake-boundaries.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-session-cascade-1" as SessionId

const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>

/**
 * Normalise a frame for layout comparison: strip trailing whitespace per
 * line, drop fully-blank lines past the bottom of content, normalise
 * varying-but-equivalent characters that aren't load-bearing for layout
 * (e.g. cursor block on/off, blink phase). We compare on `text` (already
 * ANSI-stripped) so colour drift between paints isn't counted as a layout
 * change — only character positions are.
 */
function layoutFingerprint(text: string | undefined | null): string {
  if (typeof text !== "string") return ""
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n+$/u, "")
}

describe("welcome startup layout cascade (bead km-silvery.startup-layout-cascade)", () => {
  test("startup paints at most one intermediate + one steady-state layout", async () => {
    const fakes = installFakes({})
    const fake: ScriptedFakeSession = createFakeSession({ sessionId: SESSION })
    using term: TermlessTerm = createTermless({ cols: COLS, rows: ROWS })

    // Poll the emulator screen on a short interval to capture each layout
    // the runtime paints. createApp's render loop writes to term.output and
    // the bytes are fed to the xterm.js backend synchronously, so reading
    // term.screen.text after each `settle` reflects the buffer state at
    // that wall-clock moment. We sample more frequently than the renderer
    // can issue paints (5ms) so we catch every settled state.
    const fingerprints: string[] = []
    let pollerStop = false
    let lastFp = ""
    function readScreenText(): string {
      const screen = term.screen as unknown as {
        text?: string
        getText?: () => string
      } | null
      if (!screen) return ""
      if (typeof screen.getText === "function") return screen.getText()
      return screen.text ?? ""
    }
    const pollerInterval = setInterval(() => {
      if (pollerStop) return
      let fp = ""
      try {
        fp = layoutFingerprint(readScreenText())
      } catch {
        return
      }
      if (fp !== lastFp) {
        lastFp = fp
        fingerprints.push(fp)
      }
    }, 5)

    const handle = await run(
      <App
        cwd="/tmp/silvercode-test"
        bare
        layout="single"
        model="claude-sonnet-4-6"
        spawnFactory={() => fake as unknown as AgentSession}
      />,
      term,
    )
    try {
      // Allow the full cascade to play out: initial paint, async session
      // spawn microtask, welcomeIsFocused effect, any term-event-driven
      // re-paints. The user reports the last two jumps land "after a few
      // seconds" — sample the first 1500ms which includes any post-mount
      // async work that should settle quickly.
      await settle(1500)
      pollerStop = true
      clearInterval(pollerInterval)

      // Drop empty / pre-content frames — any leading frame with no
      // visible characters at all is a no-content blank screen and not a
      // layout snapshot. Layout cascade is observable only between
      // frames that actually render content.
      const contentFingerprints = fingerprints.filter((fp) => fp.replace(/\s+/gu, "").length > 0)
      const distinct = Array.from(new Set(contentFingerprints))

      // Sanity: the harness must capture the welcome screen. Empty frames means
      // run() never painted to the emulator and the test below would falsely
      // pass. We assert content arrived before grading the cascade.
      const screenText = readScreenText()
      expect(screenText.length, "termless screen never received output").toBeGreaterThan(0)

      // Assert: at most TWO distinct content-bearing layouts.
      //   - 1 frame: ideal — first paint is already stable
      //   - 2 frames: tolerable — useBoxRect width-zero → measured width
      //               is one unavoidable React commit on first mount
      //   - ≥ 3 frames: cascade bug. Fail with the per-layout text so
      //                 the diff is readable in CI logs.
      if (distinct.length > 2) {
        const summary = distinct
          .map((fp, i) => {
            const occurrences = contentFingerprints.filter((x) => x === fp).length
            const preview = fp
              .split("\n")
              .slice(0, 8)
              .map((line) => `    ${line}`)
              .join("\n")
            return `--- layout #${i + 1} (${occurrences} frame${occurrences === 1 ? "" : "s"}) ---\n${preview}`
          })
          .join("\n\n")
        throw new Error(
          `expected ≤ 2 distinct startup layouts, observed ${distinct.length}.\n\n` +
            `Total content samples captured: ${contentFingerprints.length}.\n\n` +
            `Distinct layouts (first 8 lines each):\n\n${summary}`,
        )
      }
      expect(distinct.length).toBeLessThanOrEqual(2)
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })
})
