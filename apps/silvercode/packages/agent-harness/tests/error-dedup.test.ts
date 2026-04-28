/**
 * Consecutive-identical-error de-duplication.
 *
 * User-reported scenario: the harness emitted "Request failed with status
 * code 402" three times in rapid succession; each toast/error row stacked
 * up in the UI as a separate entry. Cosmetically painful, but also
 * actively misleading — the user reads three errors as three independent
 * incidents rather than one transient failure that the harness surfaced
 * three times.
 *
 * Fix: at the reducer level, fold consecutive identical error events
 * into a single `lastError` entry with a `count` (and refresh `ts`).
 * "Identical" is by message string; "consecutive" is no different error
 * in between. A 5-second window bounds the fold so genuinely separate
 * occurrences (same message, minutes apart) still count as new errors.
 *
 * The 5s window is the same one used elsewhere for "are these the same
 * incident?" semantics (toast dedup, retry-bucket grouping). Using the
 * same number keeps reasoning consistent across the UI surfaces.
 *
 * Bead: km-silvercode.error-dedup.
 */

import { describe, expect, test } from "vitest"
import { initialInternalState, publicView, reduce } from "../src/session-reducer.ts"
import type { AgentEvent, SessionId } from "../src/events.ts"

const sid = "s-test" as SessionId

function errorEvent(message: string, ts: number): AgentEvent {
  return { kind: "error", sessionId: sid, message, ts }
}

describe("session-reducer — error dedup (km-silvercode.error-dedup)", () => {
  test("3 identical errors within 1s collapse to ONE entry with count=3", () => {
    let s = initialInternalState()
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1000))
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1300))
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1700))

    const view = publicView(s)
    expect(view.lastError).not.toBeNull()
    expect(view.lastError?.message).toBe("Request failed with status code 402")
    expect(view.lastError?.count).toBe(3)
  })

  test("a 4th DIFFERENT error replaces lastError as a fresh entry (count=1)", () => {
    let s = initialInternalState()
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1000))
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1300))
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1700))
    ;[s] = reduce(s, errorEvent("Connection refused", 1900))

    const view = publicView(s)
    expect(view.lastError?.message).toBe("Connection refused")
    expect(view.lastError?.count).toBe(1)
  })

  test("a 5th identical error AFTER the 5s window starts a fresh entry (count=1)", () => {
    let s = initialInternalState()
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1000))
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1300))
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 1700))
    // 6.3 seconds after the third error → outside the 5s window.
    ;[s] = reduce(s, errorEvent("Request failed with status code 402", 8000))

    const view = publicView(s)
    expect(view.lastError?.message).toBe("Request failed with status code 402")
    expect(view.lastError?.count).toBe(1)
  })

  test("first error sets count=1", () => {
    let s = initialInternalState()
    ;[s] = reduce(s, errorEvent("boom", 100))
    expect(publicView(s).lastError).toEqual(expect.objectContaining({ message: "boom", count: 1 }))
  })

  test("dedup window refreshes on each merge — slow-but-steady drip stays folded", () => {
    // Three errors 4 seconds apart each. From the FIRST error to the
    // THIRD that's 8 seconds wall time, but each successive error is
    // within 5s of its immediate predecessor — they should still fold.
    // The window bounds "since the last identical fold," not "since the
    // first occurrence."
    let s = initialInternalState()
    ;[s] = reduce(s, errorEvent("flap", 0))
    ;[s] = reduce(s, errorEvent("flap", 4000))
    ;[s] = reduce(s, errorEvent("flap", 8000))

    expect(publicView(s).lastError?.count).toBe(3)
  })

  test("publicView never exposes the private dedup runtime", () => {
    let s = initialInternalState()
    ;[s] = reduce(s, errorEvent("x", 0))
    const view = publicView(s) as Record<string, unknown>
    expect(view._strip).toBeUndefined()
    expect(view._errorDedup).toBeUndefined()
  })
})
