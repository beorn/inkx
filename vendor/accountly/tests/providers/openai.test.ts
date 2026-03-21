import { describe, test, expect, vi } from "vitest"
import { createOpenAIProvider } from "../../src/providers/openai.ts"

/** Cast a vitest mock to satisfy the typeof fetch constraint */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asFetch = (mock: any): typeof fetch => mock

describe("openai provider", () => {
  const provider = createOpenAIProvider()

  test("validates credential with apiKey", () => {
    expect(provider.validateCredential({ apiKey: "sk-test-123" })).toBe(true)
  })

  test("rejects credential without apiKey", () => {
    expect(provider.validateCredential({})).toBe(false)
    expect(provider.validateCredential({ apiKey: "" })).toBe(false)
  })

  test("checkQuota returns available for valid key", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "x-ratelimit-limit-requests": "500",
          "x-ratelimit-remaining-requests": "499",
          "x-ratelimit-limit-tokens": "200000",
          "x-ratelimit-remaining-tokens": "200000",
        }),
      }),
    )

    try {
      const result = await provider.checkQuota({ apiKey: "sk-test-123" })
      expect(result.available).toBe(true)
      expect(result.provider).toBe("openai")
      expect(result.windows.length).toBeGreaterThanOrEqual(1)

      const rpm = result.windows.find((w) => w.name === "RPM")
      expect(rpm).toBeDefined()
      expect(rpm!.limit).toBe(500)
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
    globalThis.fetch = asFetch(vi.fn().mockRejectedValue(new Error("fetch failed")))

    try {
      const result = await provider.checkQuota({ apiKey: "sk-test" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("fetch failed")
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
