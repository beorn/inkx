/**
 * Tests for the silvercode session system-prompt fragments.
 *
 * Verifies the AMBIENT_FRAMING_SYSTEM_CLAUSE is present, well-formed,
 * and the `ambientFramingInjector` injects exactly once per session.
 */

import { describe, expect, test } from "vitest"
import type { SessionId } from "@km/agent-harness"
import { AMBIENT_FRAMING_SYSTEM_CLAUSE, ambientFramingInjector } from "../src/system-prompt.ts"

describe("system-prompt", () => {
  test("AMBIENT_FRAMING_SYSTEM_CLAUSE mentions the three precepts", () => {
    expect(AMBIENT_FRAMING_SYSTEM_CLAUSE).toContain("memory of past activity")
    expect(AMBIENT_FRAMING_SYSTEM_CLAUSE).toContain("Mention them")
    expect(AMBIENT_FRAMING_SYSTEM_CLAUSE).toContain("Ask the user")
  })

  test("AMBIENT_FRAMING_SYSTEM_CLAUSE references the AMBIENT framing prefix", () => {
    expect(AMBIENT_FRAMING_SYSTEM_CLAUSE).toContain("[AMBIENT")
    expect(AMBIENT_FRAMING_SYSTEM_CLAUSE).toContain("informational, do not act")
  })

  test("AMBIENT_FRAMING_SYSTEM_CLAUSE references _meta.ambient", () => {
    expect(AMBIENT_FRAMING_SYSTEM_CLAUSE).toContain("_meta.ambient")
  })

  test("AMBIENT_FRAMING_SYSTEM_CLAUSE references the quarantine sentinels", () => {
    expect(AMBIENT_FRAMING_SYSTEM_CLAUSE).toContain("QUARANTINED")
  })

  test("ambientFramingInjector injects on first call for a session", () => {
    const inj = ambientFramingInjector()
    const out = inj.run("hello", { sessionId: "s1" as SessionId, cwd: "/tmp" })
    expect(out).toBe(AMBIENT_FRAMING_SYSTEM_CLAUSE)
  })

  test("ambientFramingInjector returns null on subsequent calls for the same session", () => {
    const inj = ambientFramingInjector()
    const sessionId = "s1" as SessionId
    const first = inj.run("hello", { sessionId, cwd: "/tmp" })
    const second = inj.run("again", { sessionId, cwd: "/tmp" })
    expect(first).toBe(AMBIENT_FRAMING_SYSTEM_CLAUSE)
    expect(second).toBeNull()
  })

  test("ambientFramingInjector tracks distinct sessions independently", () => {
    const inj = ambientFramingInjector()
    const a = inj.run("hello", { sessionId: "sA" as SessionId, cwd: "/tmp" })
    const b = inj.run("hello", { sessionId: "sB" as SessionId, cwd: "/tmp" })
    expect(a).toBe(AMBIENT_FRAMING_SYSTEM_CLAUSE)
    expect(b).toBe(AMBIENT_FRAMING_SYSTEM_CLAUSE)
  })
})
