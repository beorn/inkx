/**
 * Resume-hint output shape — pure function tests.
 *
 * Drives `formatResumeHint(sessionIds)` directly so we can pin the exit
 * message without driving silvery's teardown. The full integration path
 * (registration via `term.signals.on("exit", …)`, output to stdout after
 * alt-screen exit) is exercised in production; here we just verify the
 * three branches:
 *
 *   1. One or more real session ids → `silvercode --resume <sid>` per id
 *   2. Sessions exist but only "pending" → fallback explanation
 *   3. No sessions at all → bare confirmation
 *
 * Bead: km-silvercode.resume-hint-not-shown
 */

import { describe, expect, test } from "vitest"
import { formatResumeHint } from "../src/App.tsx"

describe("formatResumeHint", () => {
  test("single real session id renders one --resume line", () => {
    const out = formatResumeHint(["abc-123"])
    expect(out).toContain("silvercode --resume abc-123")
    expect(out).toContain("Resume this session with:")
    // Leading + trailing blank lines so the hint clears the prompt.
    expect(out.startsWith("\n")).toBe(true)
    expect(out.endsWith("\n\n")).toBe(true)
  })

  test("multiple real session ids render one --resume line each", () => {
    const out = formatResumeHint(["sid-1", "sid-2", "sid-3"])
    expect(out).toContain("silvercode --resume sid-1")
    expect(out).toContain("silvercode --resume sid-2")
    expect(out).toContain("silvercode --resume sid-3")
    expect(out).toContain("Resume one of these sessions with:")
  })

  test("filters 'pending' placeholders before deciding which branch fires", () => {
    // Mix of pending + real → only real ones shown.
    const out = formatResumeHint(["pending", "real-1", "pending"])
    expect(out).toContain("silvercode --resume real-1")
    expect(out).not.toContain("--resume pending")
    // Singular form because only one real id remains after filtering.
    expect(out).toContain("Resume this session with:")
  })

  test("only pending sessions → fallback explanation, not a misleading empty resume block", () => {
    const out = formatResumeHint(["pending", "pending"])
    expect(out).not.toContain("silvercode --resume pending")
    expect(out).not.toContain("Resume this session with:")
    expect(out).not.toContain("Resume one of these sessions with:")
    expect(out).toContain("no resumable sessions")
    expect(out).toContain("Send a turn before quitting")
  })

  test("no sessions at all → bare exit confirmation", () => {
    const out = formatResumeHint([])
    expect(out).not.toContain("--resume")
    expect(out).not.toContain("no resumable")
    expect(out).toContain("silvercode: exited")
  })
})
