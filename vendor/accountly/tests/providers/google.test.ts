import { describe, test, expect, vi } from "vitest"
import { createGoogleProvider } from "../../src/providers/google.ts"

/** Cast a vitest mock to satisfy the typeof fetch constraint */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asFetch = (mock: any): typeof fetch => mock

describe("google provider", () => {
  const provider = createGoogleProvider()

  test("validates credential with apiKey", () => {
    expect(provider.validateCredential({ apiKey: "AIza-test-123" })).toBe(true)
  })

  test("rejects credential without apiKey", () => {
    expect(provider.validateCredential({})).toBe(false)
    expect(provider.validateCredential({ apiKey: "" })).toBe(false)
  })

  test("checkQuota returns available for valid key", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    try {
      const result = await provider.checkQuota({ apiKey: "AIza-test" })
      expect(result.available).toBe(true)
      expect(result.provider).toBe("google")
      expect(result.windows).toHaveLength(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns error for invalid key (403)", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockResolvedValue({ ok: false, status: 403 }))

    try {
      const result = await provider.checkQuota({ apiKey: "invalid" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Invalid API key")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns error for invalid key (400)", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockResolvedValue({ ok: false, status: 400 }))

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
    globalThis.fetch = asFetch(vi.fn().mockRejectedValue(new Error("DNS resolution failed")))

    try {
      const result = await provider.checkQuota({ apiKey: "AIza-test" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("DNS resolution failed")
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
