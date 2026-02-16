import { describe, test, expect } from "vitest"
import { formatAccountLine, formatStatus } from "../src/display.ts"
import type { QuotaInfo } from "../src/types.ts"

describe("display formatting", () => {
  test("formatAccountLine shows active marker", () => {
    const quota: QuotaInfo = {
      accountName: "bjorn@test.com",
      provider: "claude-oauth",
      available: true,
      windows: [{ name: "5-hour", utilization: 60 }],
      checkedAt: Date.now(),
    }

    const active = formatAccountLine(quota, true, 20, ["5-hour"])
    const inactive = formatAccountLine(quota, false, 20, ["5-hour"])

    expect(active).toContain("*")
    expect(active).toContain("bjorn@test.com")
    expect(active).toContain("60%")

    expect(inactive).not.toContain("*")
    expect(inactive).toContain("bjorn@test.com")
  })

  test("formatAccountLine shows error", () => {
    const quota: QuotaInfo = {
      accountName: "broken@test.com",
      provider: "claude-oauth",
      available: false,
      windows: [],
      error: "Network timeout",
      checkedAt: Date.now(),
    }

    const line = formatAccountLine(quota, false, 20, [])
    expect(line).toContain("broken@test.com")
    expect(line).toContain("Network timeout")
  })

  test("formatAccountLine shows plan from metadata", () => {
    const quota: QuotaInfo = {
      accountName: "pro@test.com",
      provider: "claude-oauth",
      available: true,
      windows: [{ name: "5-hour", utilization: 30 }],
      checkedAt: Date.now(),
    }
    const account = {
      name: "pro@test.com",
      provider: "claude-oauth" as const,
      metadata: { plan: "claude_max", email: "pro@test.com" },
    }

    const line = formatAccountLine(quota, false, 20, ["5-hour"], account)
    expect(line).toContain("claude_max")
  })

  test("formatStatus groups by provider with header", () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "user@test.com",
        provider: "claude-oauth",
        available: true,
        windows: [{ name: "5-hour", utilization: 30 }],
        checkedAt: Date.now(),
      },
      {
        accountName: "openai-main",
        provider: "openai",
        available: true,
        windows: [],
        checkedAt: Date.now(),
      },
    ]

    const output = formatStatus(quotas, "user@test.com")
    expect(output).toContain("Claude Code (OAuth)")
    expect(output).toContain("OpenAI")
    expect(output).toContain("ACCOUNT")
    expect(output).toContain("user@test.com")
  })

  test("formatStatus shows empty message", () => {
    const output = formatStatus([], undefined)
    expect(output).toContain("No accounts configured")
  })

  test("formatAccountLine shows key valid for providers without quota windows", () => {
    const quota: QuotaInfo = {
      accountName: "openai-main",
      provider: "openai",
      available: true,
      windows: [],
      checkedAt: Date.now(),
    }

    // When windowNames is empty (all accounts in group have no windows), show "key valid"
    const line = formatAccountLine(quota, false, 20, [])
    expect(line).toContain("openai-main")
    expect(line).toContain("key valid")
  })

  test("formatStatus shows all provider types", () => {
    const quotas: QuotaInfo[] = [
      { accountName: "claude", provider: "claude-oauth", available: true, windows: [], checkedAt: Date.now() },
      { accountName: "openai", provider: "openai", available: true, windows: [], checkedAt: Date.now() },
      { accountName: "grok", provider: "xai", available: true, windows: [], checkedAt: Date.now() },
      { accountName: "gemini", provider: "google", available: true, windows: [], checkedAt: Date.now() },
      { accountName: "router", provider: "openrouter", available: true, windows: [], checkedAt: Date.now() },
    ]

    const output = formatStatus(quotas, undefined)
    expect(output).toContain("Claude Code (OAuth)")
    expect(output).toContain("OpenAI")
    expect(output).toContain("xAI (Grok)")
    expect(output).toContain("Google (Gemini)")
    expect(output).toContain("OpenRouter")
  })

  test("formatStatus aligns columns across accounts", () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "short@a.com",
        provider: "claude-oauth",
        available: true,
        windows: [
          { name: "5-hour", utilization: 60 },
          { name: "7-day", utilization: 35 },
        ],
        checkedAt: Date.now(),
      },
      {
        accountName: "longer-email@company.com",
        provider: "claude-oauth",
        available: true,
        windows: [
          { name: "5-hour", utilization: 80 },
          { name: "7-day", utilization: 50 },
        ],
        checkedAt: Date.now(),
      },
    ]

    const output = formatStatus(quotas, "short@a.com")
    // Both rows should have 5-hour and 7-day columns
    expect(output).toContain("5-hour")
    expect(output).toContain("7-day")
    expect(output).toContain("60%")
    expect(output).toContain("80%")
  })
})
