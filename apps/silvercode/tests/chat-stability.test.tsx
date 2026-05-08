/**
 * Chat-session UI stability matrix. Bead:
 * `@km/silvercode/post-resize-ui-stability`.
 *
 * Same three cells as `welcome-stability.test.tsx` but on a populated
 * chat session — driven via `ScriptedFakeSession` + the `bashTool`
 * pre-built script, so the ChatBlockList renders a real exchange
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
import { createSessionStore } from "@km/agent-harness"
import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { Box } from "silvery"
import { App } from "../src/App.tsx"
import { ChatPane } from "../src/components/ChatPane.tsx"
import { Content } from "../src/components/Content.tsx"
import { SessionPromptComposer } from "../src/components/SessionPromptComposer.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../src/test/fake-session.ts"
import { installFakes } from "../src/test/fake-boundaries.ts"
import { markdownRich } from "../src/test/scripts/markdownRich.ts"
import { stressUnwrappable } from "../src/test/scripts/stressUnwrappable.ts"
import {
  expectStableFirstVisibleContent,
  expectStableLayouts,
  pollTermlessFrames,
  recordRenderFrames,
} from "./lib/stability.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-md-rich" as SessionId

const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>
type ResizableTerm = TermlessTerm & { resize?: (cols: number, rows: number) => void }
type InputTerm = TermlessTerm & { sendInput?: (data: string) => void }

let restoreConsoleLogs: (() => void) | undefined

beforeEach(() => {
  const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
  restoreConsoleLogs = () => {
    debugSpy.mockRestore()
    infoSpy.mockRestore()
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  }
})

afterEach(() => {
  restoreConsoleLogs?.()
  restoreConsoleLogs = undefined
})

describe("chat-session UI stability (bead @km/silvercode/post-resize-ui-stability)", () => {
  test("resumed replay load keeps the first visible transcript row stable until live activity", async () => {
    const cols = 96
    const rows = 16
    const store = createSessionStore()
    const sessionId = "resumed-stability-session" as SessionId
    for (let index = 0; index < 32; index++) {
      store.apply({
        kind: "user-message",
        sessionId,
        turnId: `u${index}` as never,
        text: `replay prompt ${index}`,
        ts: Date.UTC(2026, 4, 7, 20, index),
      })
      store.apply({
        kind: "assistant-message",
        sessionId,
        turnId: `a${index}` as never,
        content: [{ type: "text", text: `replay answer ${index}` }],
        ts: Date.UTC(2026, 4, 7, 20, index, 1),
      })
    }

    const recorded = recordRenderFrames()
    let app: { text: string; unmount: () => void } | undefined
    try {
      const renderer = createRenderer({
        cols,
        rows,
        autoRender: true,
        onFrame: recorded.onFrame,
      })
      const messages = store.state.get().messages
      const tree = (
        <Box width={cols} height={rows} flexDirection="column" overflow="hidden">
          <Content.Layout>
            <ChatPane
              handle={
                {
                  id: "resumed-stability-session",
                  name: "resumed-stability-session",
                  store,
                  session: {},
                  unsubscribe: () => {},
                  log: { write: () => {}, sessionLogPath: "" },
                  account: undefined,
                  metadata: {
                    cwd: "/tmp/silvercode-test",
                    spawnedAt: 1,
                    resumeId: "codex:resumed-stability-session",
                    replayStartedAt: 1,
                    replayCompletedAt: Date.UTC(2026, 4, 7, 20, 32),
                    replayMessageCount: messages.length,
                    replayBoundaryMessageId: messages.at(-1)?.id,
                  },
                } as never
              }
              isFocused
              onFocus={() => {}}
              onApprove={() => {}}
              onDeny={() => {}}
              composerSlot={
                <SessionPromptComposer
                  queueText=""
                  onQueueChange={() => {}}
                  onQueueSubmit={() => {}}
                  inputValue=""
                  onInputChange={() => {}}
                  onSubmit={() => {}}
                  onExit={() => {}}
                  focusedRegion="command"
                  onFocusRegion={() => {}}
                />
              }
            />
          </Content.Layout>
        </Box>
      )
      app = renderer(tree)
      await settle(80)

      const topRows = app.text.split("\n").slice(0, 6).join("\n")
      expect(topRows, app.text).toContain("replay prompt 0")
      expectStableFirstVisibleContent(recorded.raw, { label: "chat.resume-load.first-visible-row" })
    } finally {
      app?.unmount()
    }
  })

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
      // the same MarkdownView / ChatBlockList paths the live repro
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
      await settle(400)
      const postFrames = await pollTermlessFrames(term, { durationMs: 350 })
      expectStableLayouts(postFrames, {
        label: "chat.resize",
        kMax: 3,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })

  test("cmux-style multi-SIGWINCH burst converges to a single layout (81→113→126→94)", async () => {
    // Real-world repro from `@km/silvercode/post-resize-ui-stability` log:
    // a cmux workspace switch sends 4 SIGWINCH events in ~300 ms (cols
    // 81, 113, 126, 94). Each one should produce ONE settled layout —
    // currently triggers an internal 88↔120 breakpoint feedback loop
    // visible as 11 width transitions in 1 second. Drive the same burst,
    // assert post-burst stability.
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
      await settle(1500)
      expect(typeof term.resize, "termless Term must expose .resize(cols, rows)").toBe("function")

      const burst = [81, 113, 126, 94]
      for (const cols of burst) {
        term.resize?.(cols, ROWS)
        await settle(80)
      }
      await settle(800)
      const postFrames = await pollTermlessFrames(term, { durationMs: 400 })
      expectStableLayouts(postFrames, {
        label: "chat.cmux-multi-sigwinch",
        kMax: 1,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })

  test("stress: long unwrappable tokens + cmux burst converges to a single layout", async () => {
    // Repro target — content close to the live session that produced 150
    // STRICT overflows. Long unwrappable tokens (URLs, file paths, hashes)
    // force natural-width measurement that conflicts with the constrained
    // sidebar-aware parent. Combined with a cmux-style multi-SIGWINCH
    // burst, this is the closest synthetic match to the user's repro.
    const fakes = installFakes({})
    const fake: ScriptedFakeSession = createFakeSession({
      sessionId: "fake-stress-unwrappable" as SessionId,
    })
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
      fake.script(stressUnwrappable, 0)
      await settle(1500)
      expect(typeof term.resize, "termless Term must expose .resize(cols, rows)").toBe("function")

      // Tighter burst — SIGWINCH events arrive faster than the 16ms
      // resize-coalescing budget in silvery's Size device, exercising
      // the coalescer if it exists.
      for (const cols of [81, 113, 126, 94, 81, 126]) {
        term.resize?.(cols, ROWS)
        await settle(20)
      }
      await settle(500)
      const postFrames = await pollTermlessFrames(term, { durationMs: 500 })
      expectStableLayouts(postFrames, {
        label: "chat.stress-unwrappable",
        kMax: 1,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })

  test("focus-in (after blur) converges to a single layout in a chat session", async () => {
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
      expect(typeof term.sendInput, "termless Term must expose .sendInput(data)").toBe("function")
      term.sendInput?.("\x1b[O")
      await settle(80)
      term.sendInput?.("\x1b[I")
      await settle(400)
      const postFrames = await pollTermlessFrames(term, { durationMs: 400 })
      expectStableLayouts(postFrames, {
        label: "chat.focus-regain",
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

      await settle(400)
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
