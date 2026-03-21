import { describe, test, expect, vi } from "vitest"
import { createOpenRouterProvider } from "../../src/providers/openrouter.ts"

/** Cast a vitest mock to satisfy the typeof fetch constraint */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asFetch = (mock: any): typeof fetch => mock

describe("openrouter provider", () => {
  const provider = createOpenRouterProvider()

  test("validates credential with apiKey", () => {
    expect(provider.validateCredential({ apiKey: "sk-or-test-123" })).toBe(true)
  })

  test("rejects credential without apiKey", () => {
    expect(provider.validateCredential({})).toBe(false)
    expect(provider.validateCredential({ apiKey: "" })).toBe(false)
  })

  test("checkQuota returns credits info with limit", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              label: "my-key",
              limit: 10.0,
              limit_remaining: 7.5,
              usage: 2.5,
              usage_daily: 0.5,
              usage_monthly: 2.5,
              is_free_tier: false,
            },
          }),
      }),
    )

    try {
      const result = await provider.checkQuota({ apiKey: "sk-or-test" })
      expect(result.available).toBe(true)
      expect(result.provider).toBe("openrouter")

      const creditWindow = result.windows.find((w) => w.name.startsWith("Credits"))
      expect(creditWindow).toBeDefined()
      expect(creditWindow!.utilization).toBe(25) // 2.5/10 = 25%
      expect(creditWindow!.remaining).toBe(7.5)
      expect(creditWindow!.limit).toBe(10.0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns unavailable when credits exhausted", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              limit: 5.0,
              limit_remaining: 0,
              usage: 5.0,
              is_free_tier: false,
            },
          }),
      }),
    )

    try {
      const result = await provider.checkQuota({ apiKey: "sk-or-test" })
      expect(result.available).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns available when no limit set", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              limit: null,
              limit_remaining: null,
              usage: 12.3,
              is_free_tier: false,
            },
          }),
      }),
    )

    try {
      const result = await provider.checkQuota({ apiKey: "sk-or-test" })
      expect(result.available).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns error for invalid key", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    try {
      const result = await provider.checkQuota({ apiKey: "invalid" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Invalid API key")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota handles network error", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockRejectedValue(new Error("timeout")))

    try {
      const result = await provider.checkQuota({ apiKey: "sk-or-test" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("timeout")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns error for missing key", async () => {
    const result = await provider.checkQuota({})
    expect(result.available).toBe(false)
    expect(result.error).toBe("No API key found")
  })
})
