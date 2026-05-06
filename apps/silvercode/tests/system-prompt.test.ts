/**
 * Tests for the silvercode session system-prompt fragments.
 *
 * Verifies the NOTIFICATION_FRAMING_SYSTEM_CLAUSE is present, well-formed,
 * and the `notificationFramingInjector` injects exactly once per session.
 */

import { describe, expect, test } from "vitest"
import type { SessionId } from "@km/agent-harness"
import { NOTIFICATION_FRAMING_SYSTEM_CLAUSE, notificationFramingInjector } from "../src/system-prompt.ts"

describe("system-prompt", () => {
  test("NOTIFICATION_FRAMING_SYSTEM_CLAUSE mentions the three precepts", () => {
    expect(NOTIFICATION_FRAMING_SYSTEM_CLAUSE).toContain("memory of past activity")
    expect(NOTIFICATION_FRAMING_SYSTEM_CLAUSE).toContain("Mention them")
    expect(NOTIFICATION_FRAMING_SYSTEM_CLAUSE).toContain("Ask the user")
  })

  test("NOTIFICATION_FRAMING_SYSTEM_CLAUSE references the NOTIFICATION framing prefix", () => {
    expect(NOTIFICATION_FRAMING_SYSTEM_CLAUSE).toContain("[NOTIFICATION")
    expect(NOTIFICATION_FRAMING_SYSTEM_CLAUSE).toContain("informational, do not act")
  })

  test("NOTIFICATION_FRAMING_SYSTEM_CLAUSE references _meta.notification", () => {
    expect(NOTIFICATION_FRAMING_SYSTEM_CLAUSE).toContain("_meta.notification")
  })

  test("NOTIFICATION_FRAMING_SYSTEM_CLAUSE references the quarantine sentinels", () => {
    expect(NOTIFICATION_FRAMING_SYSTEM_CLAUSE).toContain("QUARANTINED")
  })

  test("notificationFramingInjector injects on first call for a session", () => {
    const inj = notificationFramingInjector()
    const out = inj.run("hello", { sessionId: "s1" as SessionId, cwd: "/tmp" })
    expect(out).toBe(NOTIFICATION_FRAMING_SYSTEM_CLAUSE)
  })

  test("notificationFramingInjector returns null on subsequent calls for the same session", () => {
    const inj = notificationFramingInjector()
    const sessionId = "s1" as SessionId
    const first = inj.run("hello", { sessionId, cwd: "/tmp" })
    const second = inj.run("again", { sessionId, cwd: "/tmp" })
    expect(first).toBe(NOTIFICATION_FRAMING_SYSTEM_CLAUSE)
    expect(second).toBeNull()
  })

  test("notificationFramingInjector tracks distinct sessions independently", () => {
    const inj = notificationFramingInjector()
    const a = inj.run("hello", { sessionId: "sA" as SessionId, cwd: "/tmp" })
    const b = inj.run("hello", { sessionId: "sB" as SessionId, cwd: "/tmp" })
    expect(a).toBe(NOTIFICATION_FRAMING_SYSTEM_CLAUSE)
    expect(b).toBe(NOTIFICATION_FRAMING_SYSTEM_CLAUSE)
  })
})
