import { describe, test, expect, vi } from "vitest"
import { createClaudeOAuthProvider } from "../../src/providers/claude-oauth.ts"

describe("claude-oauth provider", () => {
  const provider = createClaudeOAuthProvider()

  test("validates credential with direct accessToken", () => {
    expect(provider.validateCredential({ accessToken: "test-token" })).toBe(true)
  })

  test("validates credential with claudeAiOauth wrapper", () => {
    expect(
      provider.validateCredential({
        claudeAiOauth: { accessToken: "sk-ant-oat01-test" },
      }),
    ).toBe(true)
  })

  test("rejects credential without accessToken", () => {
    expect(provider.validateCredential({})).toBe(false)
    expect(provider.validateCredential({ accessToken: "" })).toBe(false)
    expect(provider.validateCredential({ apiKey: "sk-test" })).toBe(false)
    expect(provider.validateCredential({ claudeAiOauth: {} })).toBe(false)
    expect(provider.validateCredential({ claudeAiOauth: { accessToken: "" } })).toBe(false)
  })

  test("checkQuota returns error for invalid credential", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })

    try {
      const result = await provider.checkQuota({
        accessToken: "invalid-token",
      })
      expect(result.available).toBe(false)
      expect(result.error).toContain("401")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota parses flat usage response", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          five_hour: {
            utilization: 60.0,
            resets_at: "2026-02-15T14:00:00Z",
          },
          seven_day: {
            utilization: 35.0,
            resets_at: "2026-02-20T00:00:00Z",
          },
          seven_day_opus: null,
          seven_day_sonnet: {
            utilization: 10.0,
            resets_at: "2026-02-19T00:00:00Z",
          },
          extra_usage: {
            is_enabled: true,
            monthly_limit: 20000,
            used_credits: 10000,
            utilization: 50.0,
          },
        }),
    })

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })

      expect(result.available).toBe(true)
      expect(result.windows.length).toBeGreaterThanOrEqual(3)

      const fiveHour = result.windows.find((w) => w.name === "5-hour")
      expect(fiveHour).toBeDefined()
      expect(fiveHour!.utilization).toBe(60)

      const sevenDay = result.windows.find((w) => w.name === "7-day")
      expect(sevenDay).toBeDefined()
      expect(sevenDay!.utilization).toBe(35)

      const extra = result.windows.find((w) => w.name === "Extra usage")
      expect(extra).toBeDefined()
      expect(extra!.utilization).toBe(50)
      expect(extra!.remaining).toBe(10000)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota marks unavailable when 5-hour at 100%", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          five_hour: {
            utilization: 100.0,
            resets_at: "2026-02-15T14:00:00Z",
          },
          seven_day: {
            utilization: 50.0,
            resets_at: "2026-02-20T00:00:00Z",
          },
        }),
    })

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })
      expect(result.available).toBe(false)
      expect(result.windows[0].utilization).toBe(100)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota handles network error", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"))

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Network timeout")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota handles API error response", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          error: { message: "Rate limited" },
        }),
    })

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Rate limited")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota skips null windows", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          five_hour: {
            utilization: 20.0,
            resets_at: "2026-02-15T14:00:00Z",
          },
          seven_day_opus: null,
          seven_day_cowork: null,
        }),
    })

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })
      expect(result.available).toBe(true)
      expect(result.windows).toHaveLength(1)
      expect(result.windows[0].name).toBe("5-hour")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns error for missing token", async () => {
    const result = await provider.checkQuota({})
    expect(result.available).toBe(false)
    expect(result.error).toBe("No access token found")
  })
})
