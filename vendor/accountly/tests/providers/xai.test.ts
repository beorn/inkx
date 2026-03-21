import { describe, test, expect, vi } from "vitest"
import { createXaiProvider } from "../../src/providers/xai.ts"

/** Cast a vitest mock to satisfy the typeof fetch constraint */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asFetch = (mock: any): typeof fetch => mock

describe("xai provider", () => {
  const provider = createXaiProvider()

  test("validates credential with apiKey", () => {
    expect(provider.validateCredential({ apiKey: "xai-test-123" })).toBe(true)
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
          "x-ratelimit-limit-requests": "60",
          "x-ratelimit-remaining-requests": "60",
        }),
      }),
    )

    try {
      const result = await provider.checkQuota({ apiKey: "xai-test-123" })
      expect(result.available).toBe(true)
      expect(result.provider).toBe("xai")

      const rpm = result.windows.find((w) => w.name === "RPM")
      expect(rpm).toBeDefined()
      expect(rpm!.limit).toBe(60)
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
    globalThis.fetch = asFetch(vi.fn().mockRejectedValue(new Error("connection refused")))

    try {
      const result = await provider.checkQuota({ apiKey: "xai-test" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("connection refused")
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
