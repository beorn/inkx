/**
 * Chat-session UI stability matrix. Bead:
 * `@km/silvercode/post-resize-ui-stability`.
 *
 * Same three cells as `welcome-stability.test.tsx` but on a populated
 * chat session — driven via `ScriptedFakeSession` + the `bashTool`
 * pre-built script, so the SessionUpdateList renders a real exchange
 * (user message + tool call + tool result + assistant text) with all the
 * memo / context / measurement hooks the live session uses.
 *
 * The bead's live repro (`silvercode --resume claude:f9eb64dc-…`) is a
 * resumed chat session, so this is the screen where the post-resize
 * shuffle is most likely to manifest. The welcome-screen cells already
 * pass; if the chat-screen cells fail, that pinpoints which subtree
 * carries the instability.
 *
 * Cells:
 *   - **initial paint** — paint the chat with the script settled, assert
 *     ≤ 2 distinct content-bearing layouts during the cascade.
 *   - **resize** — settle, then drive `term.resize(newCols, newRows)`,
 *     wait for propagation, assert ≤ 1 distinct layout in the post-event
 *     window.
 *   - **side-panel toggle** — settle, then send Ctrl+O, wait for
 *     propagation, assert ≤ 1 distinct layout.
 */

import type { AgentSession, SessionId } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../src/test/fake-session.ts"
import { installFakes } from "../src/test/fake-boundaries.ts"
import { markdownRich } from "../src/test/scripts/markdownRich.ts"
import { expectStableLayouts, pollTermlessFrames } from "./lib/stability.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-md-rich" as SessionId

const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>
type ResizableTerm = TermlessTerm & { resize?: (cols: number, rows: number) => void }
type InputTerm = TermlessTerm & { sendInput?: (data: string) => void }

describe("chat-session UI stability (bead @km/silvercode/post-resize-ui-stability)", () => {
  test("post-script-arrival paint converges to a stable layout (chat with rich markdown)", async () => {
    const fakes = installFakes({})
    const fake: ScriptedFakeSession = createFakeSession({ sessionId: SESSION })
    using term: TermlessTerm = createTermless({ cols: COLS, rows: ROWS })

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
      // Drive the markdownRich script (rich-content session) — exercises
      // the same MarkdownView / SessionUpdateList paths the live repro
      // uses on a resumed transcript.
      fake.script(markdownRich, 0)
      // Give the script + initial mount + every effect time to land,
      // THEN measure post-arrival stability. We're not testing how many
      // frames the script delivery itself produces (those are intrinsic
      // to streaming) — we're testing whether the chat is stable AFTER
      // it has settled into its final state.
      await settle(1500)

      const screenText = readScreenText(term)
      expect(screenText.length, "termless screen never received output").toBeGreaterThan(0)

      // Post-settle steady-state window: ≤ 1 distinct layout means the
      // chat fully converged. > 1 means the layout is still bouncing
      // even with no input — strong "shuffles" signal.
      const postFrames = await pollTermlessFrames(term, { durationMs: 500 })
      expectStableLayouts(postFrames, {
        label: "chat.post-arrival-steady-state",
        kMax: 1,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })

  test("resize converges to a single new layout (no post-resize shuffle in chat session)", async () => {
    const fakes = installFakes({})
    const fake: ScriptedFakeSession = createFakeSession({ sessionId: SESSION })
    using term: ResizableTerm = createTermless({ cols: COLS, rows: ROWS }) as ResizableTerm

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
      fake.script(markdownRich, 0)
      // Let the chat settle into its steady state.
      await settle(1500)

      const screenText = readScreenText(term)
      expect(screenText.length, "termless screen never received output").toBeGreaterThan(0)

      // Drive a real resize. Same path real SIGWINCH would take —
      // emulator.resize → size.update → resizeListeners fan-out.
      expect(typeof term.resize, "termless Term must expose .resize(cols, rows)").toBe("function")
      term.resize?.(90, ROWS)

      // Allow one React commit + microtask for the new layout to paint,
      // then measure the post-event steady-state. ≤ 1 distinct = the
      // chat list converged to a single new layout. > 1 = the symptom
      // ("shuffles around a lot" after resize).
      await settle(150)
      const postFrames = await pollTermlessFrames(term, { durationMs: 350 })
      expectStableLayouts(postFrames, {
        label: "chat.resize",
        kMax: 1,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })

  test("side-panel toggle (Ctrl+O) converges to a single new layout in a chat session", async () => {
    const fakes = installFakes({})
    const fake: ScriptedFakeSession = createFakeSession({ sessionId: SESSION })
    using term: InputTerm = createTermless({ cols: COLS, rows: ROWS }) as InputTerm

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
      fake.script(markdownRich, 0)
      await settle(1500)

      const screenText = readScreenText(term)
      expect(screenText.length, "termless screen never received output").toBeGreaterThan(0)

      // Send Ctrl+O — the side-panel toggle (App.tsx, useInput →
      // togglePanel()). 0x0f === Ctrl+O.
      expect(typeof term.sendInput, "termless Term must expose .sendInput(data)").toBe("function")
      term.sendInput?.("\x0f")

      await settle(150)
      const postFrames = await pollTermlessFrames(term, { durationMs: 350 })
      expectStableLayouts(postFrames, {
        label: "chat.side-panel-toggle",
        kMax: 1,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })
})

function readScreenText(term: TermlessTerm): string {
  const screen = term.screen as unknown as {
    text?: string
    getText?: () => string
  } | null
  if (!screen) return ""
  if (typeof screen.getText === "function") return screen.getText()
  return screen.text ?? ""
}
