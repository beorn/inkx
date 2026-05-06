/**
 * Bead claim lease policy.
 *
 * Pins the agent vs user lease policy from `@km/agent/sigil-boards`:
 *   - 20 min for agent-shaped assignees (`<harness>:<session>`)
 *   - 24 h for everyone else (bare names, emails, @handles)
 */
import { describe, test, expect } from "vitest"
import { AGENT_LEASE_MS, USER_LEASE_MS, isAgentAssignee, leaseMsForAssignee } from "../src/lease.ts"

describe("lease policy constants", () => {
  test("AGENT_LEASE_MS is 20 minutes", () => {
    expect(AGENT_LEASE_MS).toBe(20 * 60 * 1000)
  })

  test("USER_LEASE_MS is 24 hours", () => {
    expect(USER_LEASE_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe("isAgentAssignee", () => {
  test("identifies harness:session shapes as agents", () => {
    expect(isAgentAssignee("claude:01J5XYZ")).toBe(true)
    expect(isAgentAssignee("silvercode:abc123")).toBe(true)
    expect(isAgentAssignee("pi:xyz")).toBe(true)
  })

  test("treats bare names / emails / handles as users", () => {
    expect(isAgentAssignee("beorn")).toBe(false)
    expect(isAgentAssignee("bjorn@stabell.org")).toBe(false)
    expect(isAgentAssignee("@beorn")).toBe(false)
    expect(isAgentAssignee("Bjorn Stabell")).toBe(false)
  })

  test("rejects URI-shaped strings (mailto, http, https)", () => {
    expect(isAgentAssignee("mailto:bjorn@stabell.org")).toBe(false)
    expect(isAgentAssignee("https://example.com/u/bjorn")).toBe(false)
    expect(isAgentAssignee("http://example.com/u/bjorn")).toBe(false)
  })
})

describe("leaseMsForAssignee", () => {
  test("returns AGENT_LEASE_MS for agent assignees", () => {
    expect(leaseMsForAssignee("claude:abc")).toBe(AGENT_LEASE_MS)
    expect(leaseMsForAssignee("silvercode:foo")).toBe(AGENT_LEASE_MS)
  })

  test("returns USER_LEASE_MS for user assignees", () => {
    expect(leaseMsForAssignee("beorn")).toBe(USER_LEASE_MS)
    expect(leaseMsForAssignee("bjorn@stabell.org")).toBe(USER_LEASE_MS)
    expect(leaseMsForAssignee("@beorn")).toBe(USER_LEASE_MS)
  })
})
