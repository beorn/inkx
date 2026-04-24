/**
 * Context-window utilization in the StatusLine.
 *
 * Verifies:
 * 1. Pure helpers in `context-windows.ts` (window resolution, level, format).
 * 2. StatusLine renders "ctx: <totalK> / <windowK> (<percent>%)".
 * 3. Color shifts across the 70% / 90% thresholds.
 * 4. Unknown models fall back to the 200K default window.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import type { AgentSession, SessionState, SessionStore } from "@km/agent-harness"
import { StatusLine } from "../src/components/StatusLine.tsx"
import type { SessionHandle } from "../src/controller.ts"
import {
  contextUtilizationColor,
  contextUtilizationLevel,
  contextUtilizationPercent,
  contextWindowFor,
  formatContextUtilization,
} from "../src/context-windows.ts"

/** Build a fake SessionStore whose state is fixed — no subscribe wiring. */
function stubStore(state: Partial<SessionState>): SessionStore {
  const full: SessionState = {
    sessionId: null,
    model: "claude-sonnet-4-6",
    mode: "auto",
    cwd: "/tmp",
    tools: [],
    mcpServers: [],
    status: "idle",
    messages: [],
    permissions: [],
    todos: [],
    cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    lastError: null,
    ...state,
  }
  return {
    state: {
      get: () => full,
      subscribe: () => () => {},
    },
    apply: () => {},
    bind: (_: AgentSession) => () => {},
  }
}

/** Build a minimal SessionHandle stub — only fields StatusLine reads. */
function stubHandle(state: Partial<SessionState>, name = "s1"): SessionHandle {
  return {
    id: name,
    name,
    store: stubStore(state),
    // StatusLine never touches session / unsubscribe — cast is fine for tests.
    session: {} as AgentSession,
    unsubscribe: () => {},
  }
}

type RgbColor = { r: number; g: number; b: number }

/** Mount StatusLine and return { app, ctxCellFg } for color assertions. */
function renderStatusLine(state: Partial<SessionState>): { app: ReturnType<ReturnType<typeof createRenderer>>; ctxFg: unknown; text: string } {
  const handle = stubHandle(state)
  const render = createRenderer({ cols: 160, rows: 3 })
  const app = render(
    React.createElement(StatusLine, {
      session: handle,
      mode: "auto",
      sessionCount: 1,
      onSwitchMode: () => {},
    }),
  )
  // Find the silvery-text node containing "ctx:" and read its top-left cell.
  // Using the locator avoids fragile column arithmetic across wide unicode
  // (◈, ⚡) that appears earlier in the status line.
  const node = app.locator(":has-text('ctx:')").resolve()
  // Fallback: scan for any text node whose content starts with "ctx:".
  const box = node
    ? (node.scrollRect ?? null)
    : app
        .getByText(/^ctx:/)
        .boundingBox()
  if (!box) {
    throw new Error(`could not locate 'ctx:' in StatusLine; text=\n${app.text}`)
  }
  const cell = app.cell(box.x, box.y)
  return { app, ctxFg: cell.fg, text: app.text }
}

function colorsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const ao = a as Partial<RgbColor>
    const bo = b as Partial<RgbColor>
    return ao.r === bo.r && ao.g === bo.g && ao.b === bo.b
  }
  return false
}

describe("context-windows helpers", () => {
  test("contextWindowFor resolves known model families to 200K", () => {
    expect(contextWindowFor("claude-opus-4-1")).toBe(200_000)
    expect(contextWindowFor("claude-sonnet-4-6")).toBe(200_000)
    expect(contextWindowFor("claude-haiku-3-5")).toBe(200_000)
  })

  test("contextWindowFor falls back to 200K for unknown / empty model", () => {
    expect(contextWindowFor("gpt-5-super")).toBe(200_000)
    expect(contextWindowFor("")).toBe(200_000)
    expect(contextWindowFor(null)).toBe(200_000)
    expect(contextWindowFor(undefined)).toBe(200_000)
  })

  test("contextUtilizationPercent floors the ratio", () => {
    // 7000/200000 = 3.5% → 3% (not 4%, which Math.round would give).
    expect(contextUtilizationPercent(7_000, 200_000)).toBe(3)
    expect(contextUtilizationPercent(0, 200_000)).toBe(0)
    expect(contextUtilizationPercent(200_000, 200_000)).toBe(100)
    expect(contextUtilizationPercent(100_000, 200_000)).toBe(50)
    // Divide-by-zero guard.
    expect(contextUtilizationPercent(10_000, 0)).toBe(0)
  })

  test("formatContextUtilization produces the expected label", () => {
    expect(formatContextUtilization(7_000, 200_000)).toBe("ctx: 7K / 200K (3%)")
    expect(formatContextUtilization(100_000, 200_000)).toBe("ctx: 100K / 200K (50%)")
    expect(formatContextUtilization(180_000, 200_000)).toBe("ctx: 180K / 200K (90%)")
    expect(formatContextUtilization(0, 200_000)).toBe("ctx: 0K / 200K (0%)")
  })

  test("contextUtilizationLevel applies 70% / 90% thresholds", () => {
    expect(contextUtilizationLevel(0)).toBe("ok")
    expect(contextUtilizationLevel(50)).toBe("ok")
    expect(contextUtilizationLevel(69)).toBe("ok")
    expect(contextUtilizationLevel(70)).toBe("warn")
    expect(contextUtilizationLevel(75)).toBe("warn")
    expect(contextUtilizationLevel(89)).toBe("warn")
    expect(contextUtilizationLevel(90)).toBe("critical")
    expect(contextUtilizationLevel(95)).toBe("critical")
    expect(contextUtilizationLevel(100)).toBe("critical")
  })

  test("contextUtilizationColor maps levels to semantic tokens", () => {
    expect(contextUtilizationColor("ok")).toBe("$muted")
    expect(contextUtilizationColor("warn")).toBe("$warning")
    expect(contextUtilizationColor("critical")).toBe("$error")
  })
})

describe("StatusLine context utilization", () => {
  test("renders ctx label for a small context (3%)", () => {
    const { text } = renderStatusLine({
      model: "claude-sonnet-4-6",
      cost: { usd: 0.01, inputTokens: 6_500, outputTokens: 500 },
    })
    expect(text).toContain("ctx: 7K / 200K (3%)")
    // The old "tok:N" label is gone.
    expect(text).not.toContain("tok:")
  })

  test("renders 50% label and uses the ok (muted) color", () => {
    const { text, ctxFg } = renderStatusLine({
      model: "claude-sonnet-4-6",
      cost: { usd: 0.5, inputTokens: 100_000, outputTokens: 0 },
    })
    expect(text).toContain("ctx: 100K / 200K (50%)")
    const muted = mutedReferenceFg()
    expect(colorsEqual(ctxFg, muted)).toBe(true)
  })

  test("renders 75% with $warning color — distinct from muted baseline", () => {
    const { text, ctxFg } = renderStatusLine({
      model: "claude-sonnet-4-6",
      cost: { usd: 1.0, inputTokens: 150_000, outputTokens: 0 },
    })
    expect(text).toContain("ctx: 150K / 200K (75%)")
    const muted = mutedReferenceFg()
    expect(colorsEqual(ctxFg, muted)).toBe(false)
  })

  test("renders 95% with $error color — distinct from 75% warning", () => {
    const { text: t95, ctxFg: fg95 } = renderStatusLine({
      model: "claude-sonnet-4-6",
      cost: { usd: 1.0, inputTokens: 190_000, outputTokens: 0 },
    })
    const { ctxFg: fg75 } = renderStatusLine({
      model: "claude-sonnet-4-6",
      cost: { usd: 1.0, inputTokens: 150_000, outputTokens: 0 },
    })
    expect(t95).toContain("ctx: 190K / 200K (95%)")
    // Critical fg is distinct from the warning fg.
    expect(colorsEqual(fg95, fg75)).toBe(false)
    // Both differ from the muted baseline.
    const muted = mutedReferenceFg()
    expect(colorsEqual(fg95, muted)).toBe(false)
    expect(colorsEqual(fg75, muted)).toBe(false)
  })

  test("unknown model still renders the 200K default window", () => {
    const { text } = renderStatusLine({
      model: "claude-sonnet-9-ultra",
      cost: { usd: 0.1, inputTokens: 7_000, outputTokens: 0 },
    })
    expect(text).toContain("ctx: 7K / 200K (3%)")
  })
})

/**
 * Baseline muted color — rendered at 0% utilization so the fg is known to be
 * "$muted". Used to assert that the 50%-cell matches and the 75/95% cells differ.
 */
function mutedReferenceFg(): unknown {
  const { ctxFg } = renderStatusLine({
    model: "claude-sonnet-4-6",
    cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
  })
  return ctxFg
}
