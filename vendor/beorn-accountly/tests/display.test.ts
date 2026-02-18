import { describe, test, expect } from "vitest"
import { formatStatus } from "../src/display.tsx"
import type { QuotaInfo } from "../src/types.ts"

describe("display formatting", () => {
  test("formatStatus groups by provider", async () => {
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

    const output = await formatStatus(quotas, "user@test.com")
    expect(output).toContain("Claude Code (OAuth)")
    expect(output).toContain("OpenAI")
    expect(output).toContain("user@test.com")
  })

  test("formatStatus shows empty message", async () => {
    const output = await formatStatus([], undefined)
    expect(output).toContain("No accounts configured")
  })

  test("formatStatus shows all provider types", async () => {
    const quotas: QuotaInfo[] = [
      { accountName: "claude", provider: "claude-oauth", available: true, windows: [], checkedAt: Date.now() },
      { accountName: "openai", provider: "openai", available: true, windows: [], checkedAt: Date.now() },
      { accountName: "grok", provider: "xai", available: true, windows: [], checkedAt: Date.now() },
      { accountName: "gemini", provider: "google", available: true, windows: [], checkedAt: Date.now() },
      { accountName: "router", provider: "openrouter", available: true, windows: [], checkedAt: Date.now() },
    ]

    const output = await formatStatus(quotas, undefined)
    expect(output).toContain("Claude Code (OAuth)")
    expect(output).toContain("OpenAI")
    expect(output).toContain("xAI (Grok)")
    expect(output).toContain("Google (Gemini)")
    expect(output).toContain("OpenRouter")
  })

  test("formatStatus aligns columns across accounts", async () => {
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

    const output = await formatStatus(quotas, "short@a.com")
    expect(output).toContain("5-hour")
    expect(output).toContain("7-day")
    expect(output).toContain("60%")
    expect(output).toContain("80%")
  })

  test("formatStatus shows active marker", async () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "active@test.com",
        provider: "claude-oauth",
        available: true,
        windows: [{ name: "5-hour", utilization: 50 }],
        checkedAt: Date.now(),
      },
    ]

    const output = await formatStatus(quotas, "active@test.com")
    expect(output).toContain("*")
    expect(output).toContain("active@test.com")
  })

  test("formatStatus shows error", async () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "broken@test.com",
        provider: "claude-oauth",
        available: false,
        windows: [],
        error: "Network timeout",
        checkedAt: Date.now(),
      },
    ]

    const output = await formatStatus(quotas, undefined)
    expect(output).toContain("broken@test.com")
    expect(output).toContain("Network timeout")
  })

  test("formatStatus shows key valid for providers without quota windows", async () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "gemini-key",
        provider: "google",
        available: true,
        windows: [],
        checkedAt: Date.now(),
      },
    ]

    const output = await formatStatus(quotas, undefined)
    expect(output).toContain("gemini-key")
    expect(output).toContain("key valid")
  })
})
